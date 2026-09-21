/**
 * Device-side CodeRelay transport.
 *
 * Runs the X25519 handshake, seals actions as `device-to-host` envelopes, and
 * opens the `host-to-device` events the gateway piggybacks on an authenticated
 * `/envelope` response. The session key is persisted in `expo-secure-store`;
 * the one-time pairing secret and the session key are never logged.
 */
import {
  PROTOCOL_VERSION,
  ReplayGuard,
  buildAad,
  buildPairingProof,
  buildTranscript,
  derivePairingKey,
  deriveSessionKey,
  encodeUtf8,
  isAllowedEvent,
  parseEnvelope,
  parsePairingCompleteResponse,
} from '@coderelay/protocol';
import type {
  Action,
  Bytes,
  CiphertextBlob,
  Envelope,
  NormalizedEvent,
  PairingCompleteResponse,
  PairingPayload,
  PairingRequest,
} from '@coderelay/protocol';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import {
  constantTimeEqual,
  createDeviceCrypto,
  decodeUtf8,
  fromBase64,
  toBase64,
} from '@/shared/crypto/aes-gcm';
import type { DeviceCrypto } from '@/shared/crypto/aes-gcm';

export const SESSION_STORAGE_KEY = 'coderelay.session';
export const DEFAULT_TIMEOUT_MS = 10_000;

export interface DeviceSession {
  pairingId: string;
  deviceCredentialId: string;
  sessionKey: Bytes;
  endpoint: string;
}

export interface StoredDeviceSession extends DeviceSession {
  sequence: number;
}

export interface ActionResultSummary {
  type: string;
  value: unknown;
}

export interface ActionOutcome {
  result: ActionResultSummary;
  events: NormalizedEvent[];
}

export type GatewayClientErrorCode =
  | 'no-endpoints'
  | 'network'
  | 'timeout'
  | 'http'
  | 'invalid-response'
  | 'confirmation-mismatch'
  | 'not-paired'
  | 'unauthorized'
  | 'revoked'
  | 'resync'
  | 'storage';

export class GatewayClientError extends Error {
  readonly code: GatewayClientErrorCode;

  constructor(code: GatewayClientErrorCode, message: string) {
    super(message);
    this.name = 'GatewayClientError';
    this.code = code;
  }
}

export interface GatewaySessionStorage {
  load(): Promise<StoredDeviceSession | null>;
  save(session: StoredDeviceSession): Promise<void>;
  clear(): Promise<void>;
}

export interface GatewayClientOptions {
  crypto?: DeviceCrypto;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  storage?: GatewaySessionStorage;
}

interface HttpResult {
  status: number;
  body: string;
}

interface EnvelopeResponse {
  result: ActionResultSummary;
  events: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function withPath(endpoint: string, path: string): string {
  return `${endpoint.replace(/\/+$/, '')}${path}`;
}

function parseNormalizedEvent(plaintext: Bytes): NormalizedEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(plaintext));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const name = parsed['name'];
  if (!isAllowedEvent(name)) return null;
  const properties = parsed['properties'];
  if (!isRecord(properties)) return null;
  return { name, properties };
}

function parseEnvelopeResponse(body: string): EnvelopeResponse | GatewayClientError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new GatewayClientError('invalid-response', 'Host response was not JSON');
  }
  if (!isRecord(parsed)) {
    return new GatewayClientError('invalid-response', 'Host response was not an object');
  }
  const result = parsed['result'];
  if (!isRecord(result)) {
    return new GatewayClientError('invalid-response', 'Host response had no result');
  }
  const type = result['type'];
  if (typeof type !== 'string') {
    return new GatewayClientError('invalid-response', 'Host result had no action type');
  }
  const events = parsed['events'];
  if (!Array.isArray(events)) {
    return new GatewayClientError('invalid-response', 'Host response had no events array');
  }
  return { result: { type, value: result['value'] }, events };
}

function createSecureStoreStorage(): GatewaySessionStorage {
  return {
    async load(): Promise<StoredDeviceSession | null> {
      const raw = await getItemAsync(SESSION_STORAGE_KEY);
      if (raw === null) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!isRecord(parsed)) return null;
      const pairingId = parsed['pairingId'];
      const deviceCredentialId = parsed['deviceCredentialId'];
      const sessionKey = parsed['sessionKey'];
      const endpoint = parsed['endpoint'];
      const sequence = parsed['sequence'];
      if (
        typeof pairingId !== 'string' ||
        typeof deviceCredentialId !== 'string' ||
        typeof sessionKey !== 'string' ||
        typeof endpoint !== 'string' ||
        typeof sequence !== 'number'
      ) {
        return null;
      }
      try {
        return {
          pairingId,
          deviceCredentialId,
          sessionKey: fromBase64(sessionKey),
          endpoint,
          sequence,
        };
      } catch {
        return null;
      }
    },

    async save(session: StoredDeviceSession): Promise<void> {
      await setItemAsync(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          pairingId: session.pairingId,
          deviceCredentialId: session.deviceCredentialId,
          sessionKey: toBase64(session.sessionKey),
          endpoint: session.endpoint,
          sequence: session.sequence,
        }),
      );
    },

    async clear(): Promise<void> {
      await deleteItemAsync(SESSION_STORAGE_KEY);
    },
  };
}

interface HandshakeMaterial {
  oneTimeSecret: Bytes;
  devicePublicKey: string;
  transcript: Bytes;
  sharedSecret: Bytes;
  pairingKey: Bytes;
}

interface FinishPairingParams {
  endpoint: string;
  response: PairingCompleteResponse;
  sharedSecret: Bytes;
  oneTimeSecret: Bytes;
  transcript: Bytes;
}

export class GatewayClient {
  private readonly crypto: DeviceCrypto;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly storage: GatewaySessionStorage;
  private readonly hostReplayGuard = new ReplayGuard();
  private session: DeviceSession | null = null;
  private sequence = 0;

  constructor(options: GatewayClientOptions = {}) {
    this.crypto = options.crypto ?? createDeviceCrypto();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.storage = options.storage ?? createSecureStoreStorage();
  }

  /**
   * Runs the handshake against each advertised endpoint in order. The first
   * endpoint that completes the exchange wins; later endpoints stay unused.
   */
  async pair(payload: PairingPayload): Promise<DeviceSession | GatewayClientError> {
    if (payload.endpoints.length === 0) {
      return new GatewayClientError('no-endpoints', 'Pairing payload has no endpoints');
    }
    const handshake = this.buildHandshake(payload);
    if (handshake instanceof GatewayClientError) return handshake;
    const sealedSecret = await this.sealPairingSecret(
      handshake.pairingKey,
      handshake.oneTimeSecret,
      handshake.transcript,
    );
    if (sealedSecret instanceof GatewayClientError) return sealedSecret;
    const request: PairingRequest = {
      version: payload.version,
      pairingId: payload.pairingId,
      devicePublicKey: handshake.devicePublicKey,
      sealedSecret: {
        nonce: toBase64(sealedSecret.nonce),
        ciphertext: toBase64(sealedSecret.ciphertext),
        tag: toBase64(sealedSecret.tag),
      },
    };
    const body = JSON.stringify(request);
    let lastError = new GatewayClientError('network', 'No pairing endpoint responded');
    for (const endpoint of payload.endpoints) {
      const result = await this.postJson(withPath(endpoint, '/pair'), body);
      if (result instanceof GatewayClientError) {
        lastError = result;
        continue;
      }
      if (result.status !== 200) {
        lastError = new GatewayClientError('http', `Pairing endpoint responded ${result.status}`);
        continue;
      }
      const response = parsePairingCompleteResponse(result.body);
      if (response instanceof Error) {
        return new GatewayClientError('invalid-response', response.message);
      }
      return this.finishPairing({
        endpoint,
        response,
        sharedSecret: handshake.sharedSecret,
        oneTimeSecret: handshake.oneTimeSecret,
        transcript: handshake.transcript,
      });
    }
    return lastError;
  }

  /**
   * Builds the ephemeral keypair, shared secret, and pairing key. Everything
   * here is local; nothing is sent until `/pair` is called.
   */
  private buildHandshake(payload: PairingPayload): HandshakeMaterial | GatewayClientError {
    try {
      const oneTimeSecret = fromBase64(payload.oneTimeSecret);
      const keyPair = this.crypto.keyAgreement.generateKeyPair();
      const devicePublicKey = toBase64(keyPair.publicKey);
      const transcript = buildTranscript({
        version: payload.version,
        pairingId: payload.pairingId,
        hostPublicKey: payload.hostPublicKey,
        devicePublicKey,
      });
      const sharedSecret = this.crypto.keyAgreement.deriveSharedSecret(
        keyPair.privateKey,
        fromBase64(payload.hostPublicKey),
      );
      const pairingKey = derivePairingKey({
        sharedSecret,
        transcript,
        keyDerivation: this.crypto.keyDerivation,
      });
      return { oneTimeSecret, devicePublicKey, transcript, sharedSecret, pairingKey };
    } catch (error) {
      return new GatewayClientError(
        'invalid-response',
        toMessage(error, 'Pairing handshake could not be built'),
      );
    }
  }

  /**
   * Sends one allowlisted action and returns the host result plus any
   * host-to-device events delivered on the same authenticated response.
   */
  async sendAction(action: Action): Promise<ActionOutcome | GatewayClientError> {
    const active = await this.requireSession();
    if (active instanceof GatewayClientError) return active;
    const envelope = await this.sealAction(action, active);
    if (envelope instanceof GatewayClientError) return envelope;
    const result = await this.postJson(
      withPath(active.endpoint, '/envelope'),
      JSON.stringify(envelope),
    );
    if (result instanceof GatewayClientError) return result;
    if (result.status === 409) {
      return new GatewayClientError('resync', 'Host requested a session resync');
    }
    if (result.status !== 200) {
      const failure = this.classifyFailure(result);
      if (failure.code === 'revoked' || failure.code === 'unauthorized') {
        await this.clearStorageOnly();
      }
      return failure;
    }
    const parsed = parseEnvelopeResponse(result.body);
    if (parsed instanceof GatewayClientError) return parsed;
    const events = await this.decryptEvents(parsed.events, active);
    if (events instanceof GatewayClientError) return events;
    // Commit the next device sequence only after the host accepted the envelope.
    await this.advanceSequence(active, envelope.sequence + 1);
    return { result: parsed.result, events };
  }

  /**
   * Restores a stored session and probes it with a cheap action. A revoked or
   * unknown session clears storage and requires a new pairing; a transport
   * failure keeps the stored session for a later retry.
   */
  async reconnect(): Promise<DeviceSession | GatewayClientError> {
    const restored = await this.loadStoredSession();
    if (restored instanceof GatewayClientError) return restored;
    if (restored === null) {
      return new GatewayClientError('not-paired', 'No stored device session to reconnect');
    }
    this.session = restored;
    this.sequence = restored.sequence;
    this.hostReplayGuard.reset();
    const probe = await this.sendAction({ type: 'session.list' });
    if (probe instanceof GatewayClientError) return probe;
    return restored;
  }

  /** Drops the in-memory and stored session so the next action requires pairing. */
  async disconnect(): Promise<void> {
    await this.clearStorageOnly();
  }

  private async sealPairingSecret(
    key: Bytes,
    secret: Bytes,
    transcript: Bytes,
  ): Promise<CiphertextBlob | GatewayClientError> {
    try {
      return await this.crypto.cipher.encrypt({ key, plaintext: secret, aad: transcript });
    } catch (error) {
      return new GatewayClientError(
        'invalid-response',
        toMessage(error, 'Pairing secret could not be sealed'),
      );
    }
  }

  private async openSealedBlob(
    key: Bytes,
    nonce: string,
    ciphertext: string,
    tag: string,
    aad: Bytes,
    failureMessage: string,
  ): Promise<Bytes | GatewayClientError> {
    try {
      return await this.crypto.cipher.decrypt({
        key,
        nonce: fromBase64(nonce),
        ciphertext: fromBase64(ciphertext),
        tag: fromBase64(tag),
        aad,
      });
    } catch (error) {
      return new GatewayClientError('invalid-response', toMessage(error, failureMessage));
    }
  }

  private async finishPairing(
    params: FinishPairingParams,
  ): Promise<DeviceSession | GatewayClientError> {
    const sessionKey = deriveSessionKey({
      sharedSecret: params.sharedSecret,
      oneTimeSecret: params.oneTimeSecret,
      transcript: params.transcript,
      keyDerivation: this.crypto.keyDerivation,
    });
    const opened = await this.openSealedBlob(
      sessionKey,
      params.response.sealedConfirmation.nonce,
      params.response.sealedConfirmation.ciphertext,
      params.response.sealedConfirmation.tag,
      params.transcript,
      'Host confirmation could not be opened',
    );
    if (opened instanceof GatewayClientError) return opened;
    const expectedProof = buildPairingProof({
      transcript: params.transcript,
      sessionKey,
      hash: this.crypto,
    });
    if (!constantTimeEqual(opened, expectedProof)) {
      return new GatewayClientError(
        'confirmation-mismatch',
        'Host confirmation proof did not verify',
      );
    }
    const session: DeviceSession = {
      pairingId: params.response.pairingId,
      deviceCredentialId: params.response.deviceCredentialId,
      sessionKey,
      endpoint: params.endpoint,
    };
    const stored = await this.persist({ ...session, sequence: 0 });
    if (stored !== null) return stored;
    this.session = session;
    this.sequence = 0;
    this.hostReplayGuard.reset();
    return session;
  }

  private async sealAction(
    action: Action,
    session: DeviceSession,
  ): Promise<Envelope | GatewayClientError> {
    const sequence = this.sequence;
    try {
      const blob = await this.crypto.cipher.encrypt({
        key: session.sessionKey,
        plaintext: encodeUtf8(JSON.stringify(action)),
        aad: buildAad({
          version: PROTOCOL_VERSION,
          pairingId: session.pairingId,
          direction: 'device-to-host',
          sequence,
        }),
      });
      return {
        version: PROTOCOL_VERSION,
        direction: 'device-to-host',
        sequence,
        pairingId: session.pairingId,
        nonce: toBase64(blob.nonce),
        ciphertext: toBase64(blob.ciphertext),
        tag: toBase64(blob.tag),
      };
    } catch (error) {
      return new GatewayClientError(
        'invalid-response',
        toMessage(error, 'Action could not be sealed'),
      );
    }
  }

  private async decryptEvents(
    rawEvents: unknown[],
    session: DeviceSession,
  ): Promise<NormalizedEvent[] | GatewayClientError> {
    const events: NormalizedEvent[] = [];
    for (const raw of rawEvents) {
      const envelope = parseEnvelope(JSON.stringify(raw));
      if (envelope instanceof Error) {
        return new GatewayClientError('invalid-response', envelope.message);
      }
      if (envelope.direction !== 'host-to-device' || envelope.pairingId !== session.pairingId) {
        return new GatewayClientError(
          'invalid-response',
          'Host event envelope did not match the session',
        );
      }
      if (!this.hostReplayGuard.accept(envelope.direction, envelope.sequence)) {
        return new GatewayClientError('invalid-response', 'Host event envelope was replayed');
      }
      const plaintext = await this.openSealedBlob(
        session.sessionKey,
        envelope.nonce,
        envelope.ciphertext,
        envelope.tag,
        buildAad({
          version: envelope.version,
          pairingId: envelope.pairingId,
          direction: envelope.direction,
          sequence: envelope.sequence,
        }),
        'Host event could not be decrypted',
      );
      if (plaintext instanceof GatewayClientError) return plaintext;
      const event = parseNormalizedEvent(plaintext);
      if (event === null) {
        return new GatewayClientError('invalid-response', 'Host event payload was malformed');
      }
      events.push(event);
    }
    return events;
  }

  private async requireSession(): Promise<DeviceSession | GatewayClientError> {
    if (this.session !== null) return this.session;
    const restored = await this.loadStoredSession();
    if (restored instanceof GatewayClientError) return restored;
    if (restored === null) {
      return new GatewayClientError('not-paired', 'Device is not paired');
    }
    this.session = restored;
    this.sequence = restored.sequence;
    return restored;
  }

  private async loadStoredSession(): Promise<StoredDeviceSession | GatewayClientError | null> {
    try {
      return await this.storage.load();
    } catch (error) {
      return new GatewayClientError('storage', toMessage(error, 'Stored session could not be read'));
    }
  }

  private async persist(session: StoredDeviceSession): Promise<GatewayClientError | null> {
    try {
      await this.storage.save(session);
      return null;
    } catch (error) {
      return new GatewayClientError('storage', toMessage(error, 'Session could not be stored'));
    }
  }

  private async advanceSequence(session: DeviceSession, sequence: number): Promise<void> {
    this.sequence = sequence;
    // Best effort: the in-memory sequence already advanced, so a persistence
    // failure only costs a resync on the next cold start.
    await this.persist({ ...session, sequence });
  }

  private async clearStorageOnly(): Promise<void> {
    this.session = null;
    this.sequence = 0;
    this.hostReplayGuard.reset();
    try {
      await this.storage.clear();
    } catch {
      // The in-memory session is already cleared; a failed wipe is not fatal.
    }
  }

  private classifyFailure(result: HttpResult): GatewayClientError {
    let message = `Host responded ${result.status}`;
    try {
      const parsed: unknown = JSON.parse(result.body);
      if (isRecord(parsed) && typeof parsed['error'] === 'string') {
        message = parsed['error'];
      }
    } catch {
      // Keep the status message when the error body is not JSON.
    }
    const normalized = message.toLowerCase();
    if (normalized.includes('revoked')) {
      return new GatewayClientError('revoked', message);
    }
    if (
      normalized.includes('not paired') ||
      normalized.includes('session key') ||
      normalized.includes('could not be decrypted') ||
      normalized.includes('pairing id')
    ) {
      return new GatewayClientError('unauthorized', message);
    }
    return new GatewayClientError('http', message);
  }

  private async postJson(url: string, body: string): Promise<HttpResult | GatewayClientError> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal,
      });
      return { status: response.status, body: await response.text() };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return new GatewayClientError('timeout', `Request to ${url} timed out`);
      }
      return new GatewayClientError('network', toMessage(error, `Request to ${url} failed`));
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createGatewayClient(options: GatewayClientOptions = {}): GatewayClient {
  return new GatewayClient(options);
}

let sharedGatewayClient: GatewayClient | null = null;

/**
 * Returns the process-wide gateway client. Pairing and session both use this
 * instance so the device sequence and the host replay guard stay coherent;
 * constructing a second client would fork that shared state.
 */
export function getGatewayClient(): GatewayClient {
  if (sharedGatewayClient === null) {
    sharedGatewayClient = createGatewayClient();
  }
  return sharedGatewayClient;
}
