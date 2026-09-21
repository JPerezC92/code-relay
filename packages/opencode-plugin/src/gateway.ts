import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import {
  ActionError,
  EnvelopeError,
  PROTOCOL_VERSION,
  PairingError,
  ReplayGuard,
  buildAad,
  normalizeEvent,
  parseAction,
  parseEnvelope,
  parsePairingRequest,
} from '@coderelay/protocol';
import type {
  Action,
  CryptoAdapter,
  Envelope,
  EnvelopeDirection,
  NormalizedEvent,
  PairingCompleteResponse,
  PairingPayload,
} from '@coderelay/protocol';
import { AllowlistError, executeAllowedAction } from './allowlist';
import type { AllowedActionResult, OpenCodeClientLike } from './allowlist';
import { createHostCrypto, fromBase64, toBase64 } from './crypto';
import { DEFAULT_GATEWAY_PORT } from './endpoints';
import { PairingManager, PairingManagerError } from './pairing';
import type { PairingStatus } from './pairing';
import { SessionCatalogError } from './session-catalog';
import type { SessionCatalog } from './session-catalog';

export const GATEWAY_PORT = DEFAULT_GATEWAY_PORT;
export const RESYNC_ACTION = 'session.messages' as const;

/** Maximum accepted request body on the non-loopback listener. */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;
/** Maximum `/pair` attempts inside one rate-limit window. */
export const MAX_PAIR_ATTEMPTS = 5;
export const PAIR_RATE_WINDOW_MS = 60_000;
/** Maximum `/envelope` requests inside one rate-limit window. */
export const MAX_ENVELOPE_ATTEMPTS = 120;
export const ENVELOPE_RATE_WINDOW_MS = 60_000;
/**
 * Maximum loopback `/pairing-payload` polls inside one rate-limit window. The
 * TUI polls this route while a pairing waits, so the cap is generous enough to
 * outlast the pairing TTL without ever throttling the legitimate poller.
 */
export const MAX_PAIRING_PAYLOAD_REQUESTS = 240;
export const PAIRING_PAYLOAD_RATE_WINDOW_MS = 60_000;

/** Remote addresses considered loopback for the pairing-payload route. */
export const LOOPBACK_REMOTE_ADDRESSES: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
]);

/**
 * True only when the peer address is loopback. The decision is made from the
 * socket peer address; request headers such as `x-forwarded-for` are never
 * consulted, so a remote client cannot spoof loopback.
 */
export function isLoopbackRemoteAddress(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK_REMOTE_ADDRESSES.has(address);
}

export class GatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class BodyTooLargeError extends Error {
  constructor(message = `Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`) {
    super(message);
    this.name = 'BodyTooLargeError';
  }
}

export type GatewayDecision =
  | { kind: 'accept'; sequence: number }
  | { kind: 'resync'; refetch: typeof RESYNC_ACTION }
  | { kind: 'reject'; reason: 'replay' };

export type EnvelopeHandling =
  | { kind: 'action'; action: Action; result: AllowedActionResult; events: Envelope[] }
  | { kind: 'resync'; refetch: typeof RESYNC_ACTION }
  | { kind: 'error'; error: GatewayError };

export interface PairingHandling {
  response: PairingCompleteResponse;
}

export type GatewayServerFactory = (
  handler: (request: IncomingMessage, response: ServerResponse) => void,
) => Server;

export interface GatewayDependencies {
  client: OpenCodeClientLike;
  pairing: PairingManager;
  catalog?: SessionCatalog;
  crypto?: CryptoAdapter;
  /**
   * Supplies the live pairing payload while a pairing waits. The gateway serves
   * it only from the loopback `/pairing-payload` route and only while the
   * pairing state is `waiting`, so the one-time secret cannot leak after the QR
   * has served its purpose.
   */
  pairingPayload?: () => PairingPayload | null;
  /**
   * Clears the host-owned live pairing payload and one-time-secret holders once
   * the pairing is consumed or explicitly revoked.
   */
  clearPairingPayload?: () => void;
  /**
   * Recreates a pairing when the current one is expired or revoked and returns
   * the fresh payload, or null when recreation fails. Served only from the
   * loopback `/pairing-renew` route; never called while a device is paired.
   */
  renewPairing?: () => PairingPayload | null;
  port?: number;
  serverFactory?: GatewayServerFactory;
  now?: () => number;
}

/** Sliding-window limiter used to bound `/pair` and `/envelope` traffic. */
export class SlidingWindowLimiter {
  private readonly attempts: number[] = [];

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  attempt(nowMs: number): boolean {
    const threshold = nowMs - this.windowMs;
    while (true) {
      const oldest = this.attempts[0];
      if (oldest === undefined || oldest > threshold) break;
      this.attempts.shift();
    }
    if (this.attempts.length >= this.maxAttempts) return false;
    this.attempts.push(nowMs);
    return true;
  }

  reset(): void {
    this.attempts.length = 0;
  }
}

/**
 * Pure sequence check. It never mutates the guard: the caller commits with
 * `guard.accept()` only after the AEAD tag has been verified, so a tampered
 * envelope cannot advance the accepted window.
 */
export function evaluateSequence(
  guard: ReplayGuard,
  direction: EnvelopeDirection,
  sequence: number,
): GatewayDecision {
  if (!Number.isInteger(sequence) || sequence < 0) return { kind: 'reject', reason: 'replay' };
  const highest = guard.highestAccepted(direction);
  if (highest !== undefined) {
    if (sequence <= highest) return { kind: 'reject', reason: 'replay' };
    if (sequence > highest + 1) return { kind: 'resync', refetch: RESYNC_ACTION };
  }
  return { kind: 'accept', sequence };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function projectStringFields(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const key of keys) {
    const value = readString(record, key);
    if (value !== undefined) projected[key] = value;
  }
  return projected;
}

/** Maps the SDK-only permission notification to the protocol event name. */
function mapHostEvent(raw: unknown): unknown {
  if (!isRecord(raw) || raw['type'] !== 'permission.updated') return raw;
  return { type: 'permission.asked', properties: raw['properties'] };
}

/**
 * Reduces allowlisted host events to the precise data read by the mobile hook.
 * Host SDK records can include local paths and request metadata, so no source
 * object is forwarded across the encrypted boundary.
 */
function projectEvent(event: NormalizedEvent): NormalizedEvent {
  const properties = event.properties;
  switch (event.name) {
    case 'session.status': {
      const projected = projectStringFields(properties, ['sessionID']);
      const status = properties['status'];
      if (isRecord(status)) {
        const type = readString(status, 'type');
        if (type !== undefined) projected['status'] = { type };
      }
      return { name: event.name, properties: projected };
    }
    case 'session.idle':
    case 'session.error':
      return { name: event.name, properties: projectStringFields(properties, ['sessionID']) };
    case 'permission.asked': {
      const info = properties['info'];
      const infoRecord = isRecord(info) ? info : undefined;
      const projected: Record<string, unknown> = {};
      for (const key of ['id', 'permissionID', 'sessionID', 'title']) {
        const value = readString(properties, key) ??
          (infoRecord === undefined ? undefined : readString(infoRecord, key));
        if (value !== undefined) projected[key] = value;
      }
      return { name: event.name, properties: projected };
    }
    case 'permission.replied':
      return {
        name: event.name,
        properties: projectStringFields(properties, ['sessionID', 'permissionID']),
      };
    case 'message.part.updated': {
      const part = properties['part'];
      if (!isRecord(part)) return { name: event.name, properties: {} };
      return {
        name: event.name,
        properties: { part: projectStringFields(part, ['type', 'messageID', 'sessionID', 'text']) },
      };
    }
    default:
      return { name: event.name, properties: {} };
  }
}

function readBody(
  request: IncomingMessage,
  maxBytes: number = MAX_REQUEST_BODY_BYTES,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let exceeded = false;
    request.on('data', (chunk: Buffer) => {
      if (exceeded) return;
      size += chunk.byteLength;
      if (size > maxBytes) {
        exceeded = true;
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (exceeded) return;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}

function writeJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(payload));
}

function envelopeError(message: string): EnvelopeHandling {
  return { kind: 'error', error: new GatewayError(message) };
}

export class CodeRelayGateway {
  readonly port: number;
  private readonly client: OpenCodeClientLike;
  private readonly pairing: PairingManager;
  private readonly catalog: SessionCatalog | undefined;
  private readonly pairingPayload: () => PairingPayload | null;
  private readonly clearPairingPayload: () => void;
  private readonly renewPairing: (() => PairingPayload | null) | undefined;
  private readonly crypto: CryptoAdapter;
  private readonly serverFactory: GatewayServerFactory;
  private readonly now: () => number;
  private readonly pairLimiter = new SlidingWindowLimiter(MAX_PAIR_ATTEMPTS, PAIR_RATE_WINDOW_MS);
  private readonly envelopeLimiter = new SlidingWindowLimiter(
    MAX_ENVELOPE_ATTEMPTS,
    ENVELOPE_RATE_WINDOW_MS,
  );
  private readonly pairingPayloadLimiter = new SlidingWindowLimiter(
    MAX_PAIRING_PAYLOAD_REQUESTS,
    PAIRING_PAYLOAD_RATE_WINDOW_MS,
  );
  private readonly replayGuard = new ReplayGuard();
  private readonly reservedSequences = new Map<EnvelopeDirection, Set<number>>();
  private readonly events: NormalizedEvent[] = [];
  private sessionKey: Uint8Array | null = null;
  private sessionGeneration = 0;
  /**
   * Host-to-device envelope sequence. It restarts at zero for every paired
   * session so a device that re-pairs after revoke does not inherit the previous
   * session's counters.
   */
  private hostToDeviceSequence = 0;
  private server: Server | null = null;

  constructor(deps: GatewayDependencies) {
    this.client = deps.client;
    this.pairing = deps.pairing;
    this.catalog = deps.catalog;
    this.pairingPayload = deps.pairingPayload ?? (() => null);
    this.clearPairingPayload = deps.clearPairingPayload ?? (() => {});
    this.renewPairing = deps.renewPairing;
    this.crypto = deps.crypto ?? createHostCrypto();
    this.serverFactory = deps.serverFactory ?? ((handler) => createServer(handler));
    this.port = deps.port ?? GATEWAY_PORT;
    this.now = deps.now ?? (() => Date.now());
  }

  handleEvent(raw: unknown): NormalizedEvent | null {
    const normalized = normalizeEvent(mapHostEvent(raw));
    if (normalized === null) return null;
    const projected = projectEvent(normalized);
    this.events.push(projected);
    return projected;
  }

  drainEvents(): NormalizedEvent[] {
    return this.events.splice(0, this.events.length);
  }

  eventCount(): number {
    return this.events.length;
  }

  status(): PairingStatus {
    return this.pairing.status();
  }

  /**
   * The live pairing payload, including the one-time secret, only while the
   * pairing is still `waiting`. Every other state (idle, paired, expired,
   * revoked) returns null so the secret is never served after pairing completes
   * or is revoked.
   */
  currentPairingPayload(): PairingPayload | null {
    if (this.pairing.status().state !== 'waiting') return null;
    return this.pairingPayload();
  }

  /** Highest authenticated sequence committed for a direction. */
  highestAccepted(direction: EnvelopeDirection): number | undefined {
    return this.replayGuard.highestAccepted(direction);
  }

  revoke(): void {
    this.pairing.revoke();
    this.clearPairingPayload();
    this.events.splice(0, this.events.length);
    this.catalog?.clear();
    this.sessionKey = null;
    this.sessionGeneration += 1;
    this.hostToDeviceSequence = 0;
    this.replayGuard.reset();
    this.reservedSequences.clear();
    this.pairLimiter.reset();
    this.envelopeLimiter.reset();
    this.pairingPayloadLimiter.reset();
  }

  async handlePairing(body: unknown): Promise<PairingHandling | GatewayError> {
    const request = parsePairingRequest(body);
    if (request instanceof PairingError) return new GatewayError(request.message);
    const result = await this.pairing.completePairing({
      pairingId: request.pairingId,
      devicePublicKey: fromBase64(request.devicePublicKey),
      sealedSecret: {
        nonce: fromBase64(request.sealedSecret.nonce),
        ciphertext: fromBase64(request.sealedSecret.ciphertext),
        tag: fromBase64(request.sealedSecret.tag),
      },
    });
    if (result instanceof PairingManagerError) return new GatewayError(result.message);
    this.sessionKey = result.sessionKey;
    this.sessionGeneration += 1;
    // A new paired session starts its host-to-device stream at sequence zero.
    this.hostToDeviceSequence = 0;
    this.clearPairingPayload();
    return { response: result.response };
  }

  async handleEnvelope(raw: string): Promise<EnvelopeHandling> {
    const status = this.pairing.status();
    if (status.state === 'revoked') return envelopeError('Device has been revoked');
    if (status.state !== 'paired') return envelopeError('Device is not paired');
    const key = this.sessionKey;
    if (key === null) {
      return envelopeError('Session key is not established');
    }
    // Capture the session generation and key so a revoke()/dispose() that lands
    // during the async decrypt cannot let a stale envelope execute afterwards.
    const generation = this.sessionGeneration;
    const envelope = parseEnvelope(raw);
    if (envelope instanceof EnvelopeError) return envelopeError(envelope.message);
    if (envelope.pairingId !== this.pairing.pairingId()) {
      return envelopeError('Envelope pairing id does not match');
    }
    const decision = evaluateSequence(this.replayGuard, envelope.direction, envelope.sequence);
    if (decision.kind === 'reject') return envelopeError('Replayed envelope sequence');
    if (decision.kind === 'resync') return { kind: 'resync', refetch: RESYNC_ACTION };
    if (!this.reserveSequence(envelope.direction, envelope.sequence)) {
      return envelopeError('Replayed envelope sequence');
    }
    const aad = buildAad({
      version: envelope.version,
      pairingId: envelope.pairingId,
      direction: envelope.direction,
      sequence: envelope.sequence,
    });
    let plaintext: Uint8Array;
    try {
      plaintext = await this.crypto.decrypt({
        key,
        nonce: fromBase64(envelope.nonce),
        ciphertext: fromBase64(envelope.ciphertext),
        tag: fromBase64(envelope.tag),
        aad,
      });
    } catch {
      this.releaseSequence(envelope.direction, envelope.sequence);
      return envelopeError('Envelope could not be decrypted');
    }
    if (!this.isSessionCurrent(generation)) {
      this.releaseSequence(envelope.direction, envelope.sequence);
      return envelopeError('Device session changed during envelope processing');
    }
    if (!this.replayGuard.accept(envelope.direction, envelope.sequence)) {
      this.releaseSequence(envelope.direction, envelope.sequence);
      return envelopeError('Replayed envelope sequence');
    }
    this.releaseSequence(envelope.direction, envelope.sequence);
    const action = parseAction(new TextDecoder().decode(plaintext));
    if (action instanceof ActionError) return envelopeError(action.message);
    const result = await this.executeRoutedAction(action);
    if (result instanceof GatewayError) return envelopeError(result.message);
    // Piggyback queued host events on the authenticated response. The events are
    // drained here, after the allowlisted action executed, and sealed under the
    // same session key that authenticated the request.
    const events = await this.sealQueuedEvents(key, envelope.pairingId);
    return { kind: 'action', action, result, events };
  }

  private async executeRoutedAction(action: Action): Promise<AllowedActionResult | GatewayError> {
    const catalog = this.catalog;
    if (catalog === undefined) return new GatewayError('Session catalog is not available');
    if (action.type === 'session.list') {
      const summaries = await catalog.list();
      if (summaries instanceof SessionCatalogError) {
        return new GatewayError(summaries.message);
      }
      return { type: 'session.list', value: summaries };
    }
    const directory = await this.resolveSessionDirectory(catalog, action.sessionID);
    if (directory instanceof GatewayError) return directory;
    const executed = await executeAllowedAction(this.client, action, directory);
    if (executed instanceof AllowlistError) return new GatewayError(executed.message);
    return executed;
  }

  private async resolveSessionDirectory(
    catalog: SessionCatalog,
    sessionId: string,
  ): Promise<string | GatewayError> {
    const cached = catalog.lookup(sessionId);
    if (cached !== null) return cached;
    const refreshed = await catalog.list();
    if (refreshed instanceof SessionCatalogError) return new GatewayError(refreshed.message);
    const routed = catalog.lookup(sessionId);
    if (routed === null) return new GatewayError('Unknown session');
    return routed;
  }

  /**
   * Drains queued allowlisted events and seals each one as a `host-to-device`
   * envelope under the session key. Only sealed envelopes leave this method, so
   * no plaintext event payload can reach the wire.
   */
  private async sealQueuedEvents(sessionKey: Uint8Array, pairingId: string): Promise<Envelope[]> {
    const queued = this.drainEvents();
    const sealed: Envelope[] = [];
    for (const event of queued) {
      const sequence = this.hostToDeviceSequence;
      this.hostToDeviceSequence += 1;
      const blob = await this.crypto.encrypt({
        key: sessionKey,
        plaintext: new TextEncoder().encode(JSON.stringify(event)),
        aad: buildAad({
          version: PROTOCOL_VERSION,
          pairingId,
          direction: 'host-to-device',
          sequence,
        }),
      });
      sealed.push({
        version: PROTOCOL_VERSION,
        direction: 'host-to-device',
        sequence,
        pairingId,
        nonce: toBase64(blob.nonce),
        ciphertext: toBase64(blob.ciphertext),
        tag: toBase64(blob.tag),
      });
    }
    return sealed;
  }

  async listen(): Promise<{ port: number }> {
    if (this.server !== null) return { port: this.port };
    const server = this.serverFactory((request, response) => {
      void this.handleHttpRequest(request, response);
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.removeListener('listening', onListening);
        this.server = null;
        reject(error);
      };
      const onListening = (): void => {
        server.removeListener('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.port, '0.0.0.0');
    });
    return { port: this.port };
  }

  async dispose(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.catalog?.clear();
    this.sessionKey = null;
    this.sessionGeneration += 1;
    this.hostToDeviceSequence = 0;
    this.events.length = 0;
    this.replayGuard.reset();
    this.reservedSequences.clear();
    this.pairLimiter.reset();
    this.envelopeLimiter.reset();
    this.pairingPayloadLimiter.reset();
    if (server === null) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }

  private reserveSequence(direction: EnvelopeDirection, sequence: number): boolean {
    const reserved = this.reservedSequences.get(direction) ?? new Set<number>();
    if (reserved.has(sequence)) return false;
    reserved.add(sequence);
    this.reservedSequences.set(direction, reserved);
    return true;
  }

  private releaseSequence(direction: EnvelopeDirection, sequence: number): void {
    this.reservedSequences.get(direction)?.delete(sequence);
  }

  /**
   * Re-validates the paired session captured before the async decrypt. Any
   * revoke(), dispose(), or re-pair during the await bumps the generation so an
   * in-flight envelope is dropped before it can execute.
   */
  private isSessionCurrent(generation: number): boolean {
    return (
      this.sessionGeneration === generation &&
      this.sessionKey !== null &&
      this.pairing.status().state === 'paired'
    );
  }

  /**
   * Loopback-only read of the live pairing payload. This route is deliberately
   * outside the `/pair` and `/envelope` session/auth paths: it carries no body,
   * requires no pairing session, and is gated purely by the socket peer address
   * plus the `waiting` pairing state.
   */
  private handlePairingPayloadRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    if (!isLoopbackRemoteAddress(request.socket?.remoteAddress)) {
      writeJson(response, 403, { error: 'forbidden' });
      return;
    }
    if (request.method !== 'GET') {
      writeJson(response, 405, { error: 'method-not-allowed' });
      return;
    }
    if (!this.pairingPayloadLimiter.attempt(this.now())) {
      writeJson(response, 429, { error: 'too-many-pairing-payload-requests' });
      return;
    }
    const payload = this.currentPairingPayload();
    if (payload === null) {
      // Carries only the non-secret manager state (never `waiting`-payload
      // data) so the TUI can resolve its modal instead of waiting forever.
      writeJson(response, 409, { error: 'pairing-not-waiting', state: this.status().state });
      return;
    }
    // The one-time secret is short-lived; make sure no cache retains it.
    writeJson(response, 200, { payload }, { 'cache-control': 'no-store' });
  }

  /**
   * Loopback-only pairing renewal. A paired host refuses renewal with 403 (the
   * device must be revoked first), a waiting pairing re-serves its CURRENT
   * payload, and an expired or revoked pairing is recreated through the
   * injectable `renewPairing` provider so a fresh one-time secret is issued.
   * The route shares the pairing-payload rate-limit budget and, like the
   * payload route, never trusts request headers over the socket peer address.
   */
  private handlePairingRenewRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    if (!isLoopbackRemoteAddress(request.socket?.remoteAddress)) {
      writeJson(response, 403, { error: 'forbidden' });
      return;
    }
    if (request.method !== 'POST') {
      writeJson(response, 405, { error: 'method-not-allowed' });
      return;
    }
    if (!this.pairingPayloadLimiter.attempt(this.now())) {
      writeJson(response, 429, { error: 'too-many-pairing-payload-requests' });
      return;
    }
    const status = this.pairing.status();
    if (status.state === 'paired') {
      writeJson(response, 403, { error: 'pairing-already-paired' });
      return;
    }
    if (status.state === 'waiting') {
      const payload = this.currentPairingPayload();
      if (payload === null) {
        writeJson(response, 409, { error: 'pairing-not-waiting' });
        return;
      }
      writeJson(response, 200, { payload }, { 'cache-control': 'no-store' });
      return;
    }
    const renewPairing = this.renewPairing;
    if (renewPairing === undefined) {
      writeJson(response, 503, { error: 'pairing-renew-unavailable' });
      return;
    }
    const fresh = renewPairing();
    if (fresh === null) {
      writeJson(response, 500, { error: 'pairing-renew-failed' });
      return;
    }
    writeJson(response, 200, { payload: fresh }, { 'cache-control': 'no-store' });
  }

  private async handleHttpRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      if (request.url === '/pairing-payload') {
        this.handlePairingPayloadRequest(request, response);
        return;
      }
      if (request.url === '/pairing-renew') {
        this.handlePairingRenewRequest(request, response);
        return;
      }
      if (request.method !== 'POST') {
        writeJson(response, 405, { error: 'method-not-allowed' });
        return;
      }
      if (request.url === '/pair' && !this.pairLimiter.attempt(this.now())) {
        writeJson(response, 429, { error: 'too-many-pair-attempts' });
        return;
      }
      if (request.url === '/envelope' && !this.envelopeLimiter.attempt(this.now())) {
        writeJson(response, 429, { error: 'too-many-envelope-requests' });
        return;
      }
      let body: string;
      try {
        body = await readBody(request);
      } catch (error) {
        if (error instanceof BodyTooLargeError) {
          writeJson(response, 413, { error: 'payload-too-large' });
          return;
        }
        throw error;
      }
      if (request.url === '/pair') {
        const result = await this.handlePairing(parseJson(body));
        if (result instanceof GatewayError) {
          writeJson(response, 400, { error: result.message });
          return;
        }
        writeJson(response, 200, result.response);
        return;
      }
      if (request.url === '/envelope') {
        const result = await this.handleEnvelope(body);
        if (result.kind === 'error') {
          writeJson(response, 400, { error: result.error.message });
          return;
        }
        if (result.kind === 'resync') {
          writeJson(response, 409, { resync: result.refetch });
          return;
        }
        writeJson(response, 200, {
          result: { type: result.action.type, value: result.result.value },
          events: result.events,
        });
        return;
      }
      writeJson(response, 404, { error: 'not-found' });
    } catch {
      writeJson(response, 500, { error: 'internal-error' });
    }
  }
}
