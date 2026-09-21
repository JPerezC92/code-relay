import { EventEmitter } from 'node:events';
import { Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  SESSION_KEY_LENGTH,
  X25519_KEY_LENGTH,
  ReplayGuard,
  buildAad,
  buildPairingProof,
  buildTranscript,
  derivePairingKey,
  deriveSessionKey,
} from '@coderelay/protocol';
import type {
  Bytes,
  CryptoAdapter,
  Envelope,
  PairingCompleteResponse,
  PairingPayload,
  PairingRequest,
} from '@coderelay/protocol';
import type { OpenCodeClientLike, SessionListOptions } from './allowlist';
import { createHostCrypto, createHostPairingCrypto, fromBase64, toBase64 } from './crypto';
import type { HostPairingCrypto } from './crypto';
import {
  CodeRelayGateway,
  ENVELOPE_RATE_WINDOW_MS,
  GATEWAY_PORT,
  GatewayError,
  LOOPBACK_REMOTE_ADDRESSES,
  MAX_ENVELOPE_ATTEMPTS,
  MAX_PAIR_ATTEMPTS,
  MAX_PAIRING_PAYLOAD_REQUESTS,
  MAX_REQUEST_BODY_BYTES,
  PAIRING_PAYLOAD_RATE_WINDOW_MS,
  PAIR_RATE_WINDOW_MS,
  RESYNC_ACTION,
  evaluateSequence,
  isLoopbackRemoteAddress,
} from './gateway';
import type { GatewayDependencies, GatewayServerFactory } from './gateway';
import { PAIRING_TTL_SECONDS, PairingManager, PairingManagerError } from './pairing';
import { SessionCatalog } from './session-catalog';
import type { OpenCodeProjectApi } from './session-catalog';

const TEST_NOW = new Date('2026-09-18T00:00:00.000Z');

const ENDPOINTS = ['http://192.168.1.20:47821'];

const ALPHA_WORKTREE = '/home/dev/alpha';

const ALPHA_SESSION_DIRECTORY = '/home/dev/alpha/packages/app';

const BETA_WORKTREE = '/home/dev/beta';

interface FakeClient extends OpenCodeClientLike {
  project: OpenCodeProjectApi;
}

function createClient(): FakeClient {
  return {
    project: {
      list: async () => ({
        data: [{ id: 'proj-default', worktree: '/home/dev/default' }],
        error: undefined,
        request: {},
        response: {},
      }),
    },
    session: {
      list: async () => ({ data: [], error: undefined, request: {}, response: {} }),
      status: async () => ({ data: {}, error: undefined, request: {}, response: {} }),
      messages: async () => ({ data: [], error: undefined, request: {}, response: {} }),
      promptAsync: async () => ({ data: undefined, error: undefined, request: {}, response: {} }),
      abort: async () => ({ data: true, error: undefined, request: {}, response: {} }),
    },
    postSessionIdPermissionsPermissionId: async () => ({
      data: true,
      error: undefined,
      request: {},
      response: {},
    }),
  };
}

type GatewayOverrides = Omit<Partial<GatewayDependencies>, 'client'> & { client?: FakeClient };

function createGateway(overrides: GatewayOverrides = {}): CodeRelayGateway {
  const client = overrides.client ?? createClient();
  return new CodeRelayGateway({
    client,
    catalog: overrides.catalog ?? new SessionCatalog(client),
    pairing: new PairingManager({ now: () => TEST_NOW }),
    ...overrides,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function installAlphaProject(
  client: FakeClient,
  sessions: unknown[],
): { sessionListCalls: () => number } {
  let sessionListCalls = 0;
  client.project.list = async () => ({
    data: [{ id: 'proj-alpha', worktree: ALPHA_WORKTREE }],
    error: undefined,
    request: {},
    response: {},
  });
  client.session.list = async (options?: SessionListOptions) => {
    sessionListCalls += 1;
    const directory = options?.query?.directory;
    return {
      data: directory === ALPHA_WORKTREE ? sessions : [],
      error: undefined,
      request: {},
      response: {},
    };
  };
  return { sessionListCalls: () => sessionListCalls };
}

function bytesEqual(left: Bytes, right: Bytes): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function hexToBytes(hex: string): Bytes {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

// RFC 7748 section 6.1 Curve25519 Diffie-Hellman known-answer vector. These
// bytes pin the host's node:crypto agreement to an independent specification
// instead of only agreeing with itself.
const RFC7748_ALICE_PRIVATE = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
const RFC7748_ALICE_PUBLIC = '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a';
const RFC7748_BOB_PRIVATE = '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb';
const RFC7748_BOB_PUBLIC = 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f';
const RFC7748_SHARED_SECRET = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';
const RFC7748_BASE_POINT = '0900000000000000000000000000000000000000000000000000000000000000';

/**
 * Device-side handshake simulation. The production device uses `@noble/curves`;
 * this test drives the same protocol primitives with the host's node:crypto
 * adapters, so the exchange below is node:crypto agreed with itself. The
 * RFC 7748 known-answer test anchors those primitives to the specification.
 */
async function createDeviceRequest(
  payload: PairingPayload,
  crypto: HostPairingCrypto,
): Promise<{
  request: PairingRequest;
  finish: (response: PairingCompleteResponse) => Promise<Bytes>;
}> {
  const keyPair = crypto.keyAgreement.generateKeyPair();
  const oneTimeSecretBytes = fromBase64(payload.oneTimeSecret);
  const transcript = buildTranscript({
    version: payload.version,
    pairingId: payload.pairingId,
    hostPublicKey: payload.hostPublicKey,
    devicePublicKey: toBase64(keyPair.publicKey),
  });
  const sharedSecret = crypto.keyAgreement.deriveSharedSecret(
    keyPair.privateKey,
    fromBase64(payload.hostPublicKey),
  );
  const pairingKey = derivePairingKey({
    sharedSecret,
    transcript,
    keyDerivation: crypto.keyDerivation,
  });
  const sealedSecret = await crypto.cipher.encrypt({
    key: pairingKey,
    plaintext: oneTimeSecretBytes,
    aad: transcript,
  });
  return {
    request: {
      version: payload.version,
      pairingId: payload.pairingId,
      devicePublicKey: toBase64(keyPair.publicKey),
      sealedSecret: {
        nonce: toBase64(sealedSecret.nonce),
        ciphertext: toBase64(sealedSecret.ciphertext),
        tag: toBase64(sealedSecret.tag),
      },
    },
    finish: async (response) => {
      const sessionKey = deriveSessionKey({
        sharedSecret,
        oneTimeSecret: oneTimeSecretBytes,
        transcript,
        keyDerivation: crypto.keyDerivation,
      });
      const proof = buildPairingProof({ transcript, sessionKey, hash: crypto });
      const opened = await crypto.cipher.decrypt({
        key: sessionKey,
        nonce: fromBase64(response.sealedConfirmation.nonce),
        ciphertext: fromBase64(response.sealedConfirmation.ciphertext),
        tag: fromBase64(response.sealedConfirmation.tag),
        aad: transcript,
      });
      if (!bytesEqual(opened, proof)) throw new Error('confirmation proof mismatch');
      return sessionKey;
    },
  };
}

async function encryptAction(
  crypto: HostPairingCrypto,
  sessionKey: Bytes,
  pairingId: string,
  sequence: number,
  action: unknown,
): Promise<Envelope> {
  const aad = buildAad({
    version: PROTOCOL_VERSION,
    pairingId,
    direction: 'device-to-host',
    sequence,
  });
  const plaintext = new TextEncoder().encode(JSON.stringify(action));
  const blob = await crypto.cipher.encrypt({ key: sessionKey, plaintext, aad });
  return {
    version: PROTOCOL_VERSION,
    direction: 'device-to-host',
    sequence,
    pairingId,
    nonce: toBase64(blob.nonce),
    ciphertext: toBase64(blob.ciphertext),
    tag: toBase64(blob.tag),
  };
}

async function decryptSealedEvent(
  crypto: HostPairingCrypto,
  sessionKey: Bytes,
  pairingId: string,
  envelope: Envelope,
): Promise<unknown> {
  const aad = buildAad({
    version: envelope.version,
    pairingId,
    direction: 'host-to-device',
    sequence: envelope.sequence,
  });
  const plaintext = await crypto.cipher.decrypt({
    key: sessionKey,
    nonce: fromBase64(envelope.nonce),
    ciphertext: fromBase64(envelope.ciphertext),
    tag: fromBase64(envelope.tag),
    aad,
  });
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function pairGateway(
  gateway: CodeRelayGateway,
  pairing: PairingManager,
  crypto: HostPairingCrypto = createHostPairingCrypto(),
): Promise<{ sessionKey: Bytes; pairingId: string }> {
  const created = pairing.createPairing({ endpoints: ENDPOINTS });
  if (created instanceof Error) throw created;
  const device = await createDeviceRequest(created.payload, crypto);
  const result = await gateway.handlePairing(device.request);
  if (result instanceof GatewayError) throw result;
  const sessionKey = await device.finish(result.response);
  return { sessionKey, pairingId: created.pairingId };
}

interface FakeIncomingMessage {
  method: string;
  url: string;
  socket: { remoteAddress: string | undefined };
  headers: Record<string, string | string[] | undefined>;
  on(event: string, listener: (...args: unknown[]) => void): FakeIncomingMessage;
}

interface FakeServerResponse {
  writeHead(status: number, headers?: Record<string, string>): void;
  end(value?: string): void;
}

class FakeRequest extends EventEmitter implements FakeIncomingMessage {
  readonly method: string;
  readonly url: string;
  readonly socket: { remoteAddress: string | undefined };
  readonly headers: Record<string, string | string[] | undefined>;

  constructor(
    method: string,
    url: string,
    remoteAddress: string | undefined,
    headers: Record<string, string | string[] | undefined> = {},
  ) {
    super();
    this.method = method;
    this.url = url;
    this.socket = { remoteAddress };
    this.headers = headers;
  }
}

function createResponseRecorder(): {
  response: FakeServerResponse;
  status: () => number;
  body: () => string;
  headers: () => Record<string, string>;
  finished: () => Promise<void>;
} {
  let statusCode = 0;
  let payload = '';
  let responseHeaders: Record<string, string> = {};
  let resolveFinished: (() => void) | null = null;
  const completion = new Promise<void>((resolve) => {
    resolveFinished = () => resolve();
  });
  const response: FakeServerResponse = {
    writeHead(code: number, headers: Record<string, string> = {}): void {
      statusCode = code;
      responseHeaders = headers;
    },
    end(value?: string): void {
      payload = value ?? '';
      resolveFinished?.();
    },
  };
  return {
    response,
    status: () => statusCode,
    body: () => payload,
    headers: () => responseHeaders,
    finished: () => completion,
  };
}

interface FakeHttp {
  factory: GatewayServerFactory;
  calls: { listen: number; close: number; closeAllConnections: number };
  emit: (event: string, ...args: unknown[]) => void;
  invoke: (request: FakeIncomingMessage, response: FakeServerResponse) => void;
}

class FakeServer extends Server {
  constructor(private readonly calls: { listen: number; close: number; closeAllConnections: number }) {
    super();
  }

  override listen(..._args: unknown[]): this {
    this.calls.listen += 1;
    return this;
  }

  override close(callback?: (error?: Error) => void): this {
    this.calls.close += 1;
    callback?.();
    return this;
  }

  override closeAllConnections(): void {
    this.calls.closeAllConnections += 1;
  }
}

function createFakeHttp(): FakeHttp {
  const calls = { listen: 0, close: 0, closeAllConnections: 0 };
  const server = new FakeServer(calls);
  return {
    factory: (handler) => {
      server.on('request', handler);
      return server;
    },
    calls,
    emit: (event, ...args) => {
      server.emit(event, ...args);
    },
    invoke: (request, response) => {
      server.emit('request', request, response);
    },
  };
}

/**
 * Crypto port whose `decrypt` suspends until `release()` runs, letting a test
 * land a revoke()/dispose() while an envelope is mid-decrypt.
 */
function createGatedCrypto(): { crypto: CryptoAdapter; release: () => void } {
  const host = createHostCrypto();
  let releaseGate: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    releaseGate = () => resolve();
  });
  const crypto: CryptoAdapter = {
    encrypt: (params) => host.encrypt(params),
    decrypt: async (params) => {
      await gate;
      return host.decrypt(params);
    },
  };
  return {
    crypto,
    release: () => {
      releaseGate?.();
    },
  };
}

describe('X25519 known-answer (RFC 7748 section 6.1)', () => {
  it('matches the published Curve25519 Diffie-Hellman vector', () => {
    const agreement = createHostPairingCrypto().keyAgreement;

    const alicePrivate = hexToBytes(RFC7748_ALICE_PRIVATE);
    const alicePublic = hexToBytes(RFC7748_ALICE_PUBLIC);
    const bobPrivate = hexToBytes(RFC7748_BOB_PRIVATE);
    const bobPublic = hexToBytes(RFC7748_BOB_PUBLIC);
    const shared = hexToBytes(RFC7748_SHARED_SECRET);

    expect(alicePrivate).toHaveLength(X25519_KEY_LENGTH);
    expect(bobPrivate).toHaveLength(X25519_KEY_LENGTH);
    expect(
      Array.from(agreement.deriveSharedSecret(alicePrivate, hexToBytes(RFC7748_BASE_POINT))),
    ).toEqual(Array.from(alicePublic));
    expect(Array.from(agreement.deriveSharedSecret(alicePrivate, bobPublic))).toEqual(
      Array.from(shared),
    );
    expect(Array.from(agreement.deriveSharedSecret(bobPrivate, alicePublic))).toEqual(
      Array.from(shared),
    );
  });
});

describe('CodeRelayGateway', () => {
  it('uses the documented gateway port without binding on construction', () => {
    expect(GATEWAY_PORT).toBe(47821);
    expect(createGateway().port).toBe(47821);
  });

  it('pins the gateway policy constants to their documented literals', () => {
    expect(MAX_PAIR_ATTEMPTS).toBe(5);
    expect(PAIR_RATE_WINDOW_MS).toBe(60_000);
    expect(MAX_ENVELOPE_ATTEMPTS).toBe(120);
    expect(ENVELOPE_RATE_WINDOW_MS).toBe(60_000);
    expect(MAX_REQUEST_BODY_BYTES).toBe(64 * 1024);
    expect(MAX_PAIRING_PAYLOAD_REQUESTS).toBe(240);
    expect(PAIRING_PAYLOAD_RATE_WINDOW_MS).toBe(60_000);
    expect([...LOOPBACK_REMOTE_ADDRESSES]).toEqual(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  });

  it('detects loopback peers by address only', () => {
    expect(isLoopbackRemoteAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackRemoteAddress('::1')).toBe(true);
    expect(isLoopbackRemoteAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackRemoteAddress('192.168.1.20')).toBe(false);
    expect(isLoopbackRemoteAddress(undefined)).toBe(false);
  });

  it('drops unknown events and keeps allowlisted ones', () => {
    const gateway = createGateway();
    expect(gateway.handleEvent({ type: 'file.edited', properties: {} })).toBeNull();
    expect(gateway.handleEvent({ type: 'session.created', properties: {} })).not.toBeNull();
    expect(
      gateway.handleEvent({ type: 'message.updated', properties: { info: {} } }),
    ).not.toBeNull();
    expect(gateway.drainEvents()).toHaveLength(2);
    expect(gateway.eventCount()).toBe(0);
  });

  it('checks sequence gaps without committing the guard', () => {
    const guard = new ReplayGuard();
    expect(evaluateSequence(guard, 'device-to-host', 0)).toEqual({ kind: 'accept', sequence: 0 });
    expect(guard.highestAccepted('device-to-host')).toBeUndefined();
    expect(guard.accept('device-to-host', 0)).toBe(true);
    expect(evaluateSequence(guard, 'device-to-host', 2)).toEqual({
      kind: 'resync',
      refetch: 'session.messages',
    });
    expect(evaluateSequence(guard, 'device-to-host', 0)).toEqual({
      kind: 'reject',
      reason: 'replay',
    });
  });

  it('pins the resync target to the literal session.messages action', () => {
    expect(RESYNC_ACTION).toBe('session.messages');
  });

  it('completes the X25519 handshake and executes an encrypted envelope', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);

    expect(sessionKey).toHaveLength(SESSION_KEY_LENGTH);
    const handling = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );

    expect(handling.kind).toBe('action');
    if (handling.kind === 'action') {
      expect(handling.action).toEqual({ type: 'session.list' });
      expect(handling.result.type).toBe('session.list');
    }
    expect(gateway.highestAccepted('device-to-host')).toBe(0);
  });

  it('returns the safe catalog with an empty project from an encrypted session.list envelope', async () => {
    const http = createFakeHttp();
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const client = createClient();
    installAlphaProject(client, [
      {
        id: 'ses-root-1',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        time: { updated: 400 },
        title: 'Host session',
      },
      {
        id: 'ses-child-1',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        time: { updated: 900 },
        parentID: 'ses-root-1',
      },
    ]);
    // A second discovered project with no root sessions must still be delivered
    // as a selectable catalog entry. installAlphaProject's session.list fake
    // answers [] for every directory other than the alpha worktree, so the beta
    // project arrives with zero root sessions.
    client.project.list = async () => ({
      data: [
        { id: 'proj-alpha', worktree: ALPHA_WORKTREE },
        { id: 'proj-beta', worktree: BETA_WORKTREE },
      ],
      error: undefined,
      request: {},
      response: {},
    });
    const gateway = createGateway({ pairing, client, serverFactory: http.factory });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const request = new FakeRequest('POST', '/envelope', '127.0.0.1');
    const recorder = createResponseRecorder();
    http.invoke(request, recorder.response);
    request.emit(
      'data',
      Buffer.from(
        JSON.stringify(
          await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' }),
        ),
      ),
    );
    request.emit('end');
    await recorder.finished();

    const body: unknown = JSON.parse(recorder.body());
    expect(recorder.status()).toBe(200);
    if (!isRecord(body)) throw new Error('expected an object body');
    expect(body.events).toStrictEqual([]);
    const result = body.result;
    if (!isRecord(result)) throw new Error('expected a result record');
    expect(result.type).toBe('session.list');
    const value = result.value;
    if (!isRecord(value)) throw new Error('expected a catalog record');
    expect(Object.keys(value).sort()).toStrictEqual(['projects', 'sessions']);

    const projects = value.projects;
    if (!Array.isArray(projects)) throw new Error('expected a projects array');
    expect(projects).toHaveLength(2);
    const alphaProject = projects[0];
    if (!isRecord(alphaProject)) throw new Error('expected an alpha project record');
    expect(Object.keys(alphaProject).sort()).toStrictEqual(['key', 'label']);
    expect(alphaProject.label).toBe('alpha');
    expect(String(alphaProject.key)).toMatch(/^[0-9a-f]{64}$/);
    const betaProject = projects[1];
    if (!isRecord(betaProject)) throw new Error('expected a beta project record');
    expect(Object.keys(betaProject).sort()).toStrictEqual(['key', 'label']);
    expect(betaProject.label).toBe('beta');
    expect(String(betaProject.key)).toMatch(/^[0-9a-f]{64}$/);
    // The zero-root project stays selectable under its own opaque key.
    expect(betaProject.key).not.toBe(alphaProject.key);

    const sessions = value.sessions;
    if (!Array.isArray(sessions)) throw new Error('expected a sessions array');
    expect(sessions).toHaveLength(1);
    const summary = sessions[0];
    if (!isRecord(summary)) throw new Error('expected a summary record');
    expect(Object.keys(summary).sort()).toStrictEqual([
      'id',
      'projectKey',
      'projectLabel',
      'title',
      'updatedAt',
    ]);
    expect(summary.id).toBe('ses-root-1');
    expect(summary.title).toBe('Host session');
    expect(summary.updatedAt).toBe(400);
    expect(summary.projectLabel).toBe('alpha');
    expect(String(summary.projectKey)).toMatch(/^[0-9a-f]{64}$/);
    // The root summary is bound to its project entry through the shared key.
    expect(summary.projectKey).toBe(alphaProject.key);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('directory');
    expect(serialized).not.toContain('worktree');
    expect(serialized).not.toContain('parentID');
    expect(serialized).not.toContain('projectID');
    expect(serialized).not.toContain('proj-alpha');
    expect(serialized).not.toContain('proj-beta');
    expect(serialized).not.toContain('request');
    expect(serialized).not.toContain('response');
    expect(serialized).not.toContain(ALPHA_WORKTREE);
    expect(serialized).not.toContain(BETA_WORKTREE);
  });

  it('rejects a session-bound action for an unknown session id after one refresh', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const client = createClient();
    const calls = installAlphaProject(client, [
      {
        id: 'ses-root-1',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        time: { updated: 400 },
        title: 'Root one',
      },
    ]);
    let messagesCalls = 0;
    client.session.messages = async () => {
      messagesCalls += 1;
      return { data: [], error: undefined, request: {}, response: {} };
    };
    const gateway = createGateway({ pairing, client });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const result = await gateway.handleEnvelope(
      JSON.stringify(
        await encryptAction(crypto, sessionKey, pairingId, 0, {
          type: 'session.messages',
          sessionID: 'ses-missing',
        }),
      ),
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.error.message).toBe('Unknown session');
    expect(calls.sessionListCalls()).toBe(1);
    expect(messagesCalls).toBe(0);
  });

  it('rejects a child session id that never enters the route map', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const client = createClient();
    installAlphaProject(client, [
      {
        id: 'ses-root-1',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        time: { updated: 400 },
        title: 'Root one',
      },
      {
        id: 'ses-child-1',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        time: { updated: 900 },
        parentID: 'ses-root-1',
      },
    ]);
    const catalog = new SessionCatalog(client);
    let messagesCalls = 0;
    client.session.messages = async () => {
      messagesCalls += 1;
      return { data: [], error: undefined, request: {}, response: {} };
    };
    const gateway = createGateway({ pairing, client, catalog });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const result = await gateway.handleEnvelope(
      JSON.stringify(
        await encryptAction(crypto, sessionKey, pairingId, 0, {
          type: 'session.messages',
          sessionID: 'ses-child-1',
        }),
      ),
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.error.message).toBe('Unknown session');
    expect(catalog.lookup('ses-child-1')).toBeNull();
    expect(catalog.lookup('ses-root-1')).toBe(ALPHA_WORKTREE);
    expect(messagesCalls).toBe(0);
  });

  it('refreshes the route map once on a miss and executes with the host-derived directory', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const client = createClient();
    const calls = installAlphaProject(client, [
      {
        id: 'ses-root-1',
        projectID: 'proj-alpha',
        directory: ALPHA_SESSION_DIRECTORY,
        time: { updated: 400 },
        title: 'Root one',
      },
    ]);
    const messagesOptions: unknown[] = [];
    client.session.messages = async (options) => {
      messagesOptions.push(options);
      return { data: [], error: undefined, request: {}, response: {} };
    };
    const gateway = createGateway({ pairing, client });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);

    const first = await gateway.handleEnvelope(
      JSON.stringify(
        await encryptAction(crypto, sessionKey, pairingId, 0, {
          type: 'session.messages',
          sessionID: 'ses-root-1',
        }),
      ),
    );
    expect(first.kind).toBe('action');
    if (first.kind === 'action') expect(first.result.type).toBe('session.messages');
    expect(calls.sessionListCalls()).toBe(1);
    expect(messagesOptions).toStrictEqual([
      { path: { id: 'ses-root-1' }, query: { directory: ALPHA_SESSION_DIRECTORY } },
    ]);

    const second = await gateway.handleEnvelope(
      JSON.stringify(
        await encryptAction(crypto, sessionKey, pairingId, 1, {
          type: 'session.messages',
          sessionID: 'ses-root-1',
        }),
      ),
    );
    expect(second.kind).toBe('action');
    expect(calls.sessionListCalls()).toBe(1);
    expect(messagesOptions).toHaveLength(2);
  });

  it('returns a safe action response for encrypted routed session messages', async () => {
    const http = createFakeHttp();
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const client = createClient();
    installAlphaProject(client, [
      {
        id: 'ses-root-1',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        time: { updated: 400 },
        title: 'Root one',
      },
    ]);
    client.session.messages = async () => ({
      data: [
        {
          info: {
            id: 'message-1',
            sessionID: 'ses-root-1',
            role: 'assistant',
            path: { cwd: '/host/project', root: '/host' },
            metadata: { private: true },
            projectID: 'proj-secret',
            directory: '/host/project',
          },
          parts: [
            { type: 'text', text: 'Safe reply', metadata: { private: true } },
            { type: 'tool', path: { cwd: '/host/project', root: '/host' } },
          ],
          path: { cwd: '/host/project', root: '/host' },
          metadata: { private: true },
        },
      ],
      error: undefined,
      request: {},
      response: {},
    });
    const gateway = createGateway({ pairing, client, serverFactory: http.factory });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const request = new FakeRequest('POST', '/envelope', '127.0.0.1');
    const recorder = createResponseRecorder();
    http.invoke(request, recorder.response);
    request.emit(
      'data',
      Buffer.from(
        JSON.stringify(
          await encryptAction(crypto, sessionKey, pairingId, 0, {
            type: 'session.messages',
            sessionID: 'ses-root-1',
          }),
        ),
      ),
    );
    request.emit('end');
    await recorder.finished();

    expect(recorder.status()).toBe(200);
    const body: unknown = JSON.parse(recorder.body());
    if (!isRecord(body)) throw new Error('expected an action response body');
    expect(body.result).toStrictEqual({
      type: 'session.messages',
      value: [
        {
          info: { id: 'message-1', sessionID: 'ses-root-1', role: 'assistant' },
          parts: [{ type: 'text', text: 'Safe reply' }],
        },
      ],
    });
    const serialized = JSON.stringify(body);
    for (const forbidden of ['cwd', 'root', 'path', 'metadata', 'projectID', 'directory']) {
      expect(serialized).not.toMatch(new RegExp(`"${forbidden}"\\s*:`));
    }
  });

  it('clears the session route map on revoke', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const client = createClient();
    installAlphaProject(client, [
      {
        id: 'ses-root-1',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        time: { updated: 400 },
        title: 'Root one',
      },
    ]);
    const catalog = new SessionCatalog(client);
    const gateway = createGateway({ pairing, client, catalog });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const handling = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(handling.kind).toBe('action');
    expect(catalog.lookup('ses-root-1')).toBe(ALPHA_WORKTREE);
    gateway.revoke();
    expect(catalog.lookup('ses-root-1')).toBeNull();
    expect(catalog.count()).toBe(0);
  });

  it('clears the session route map on dispose', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const client = createClient();
    installAlphaProject(client, [
      {
        id: 'ses-root-1',
        projectID: 'proj-alpha',
        directory: ALPHA_WORKTREE,
        time: { updated: 400 },
        title: 'Root one',
      },
    ]);
    const catalog = new SessionCatalog(client);
    const gateway = createGateway({ pairing, client, catalog });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const handling = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(handling.kind).toBe('action');
    expect(catalog.lookup('ses-root-1')).toBe(ALPHA_WORKTREE);
    await gateway.dispose();
    expect(catalog.lookup('ses-root-1')).toBeNull();
    expect(catalog.count()).toBe(0);
  });

  it('fails closed when no session catalog is configured', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = new CodeRelayGateway({ client: createClient(), pairing });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const listResult = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(listResult.kind).toBe('error');
    if (listResult.kind === 'error') {
      expect(listResult.error.message).toBe('Session catalog is not available');
    }
    const actionResult = await gateway.handleEnvelope(
      JSON.stringify(
        await encryptAction(crypto, sessionKey, pairingId, 1, {
          type: 'session.abort',
          sessionID: 'ses-root-1',
        }),
      ),
    );
    expect(actionResult.kind).toBe('error');
    if (actionResult.kind === 'error') {
      expect(actionResult.error.message).toBe('Session catalog is not available');
    }
  });

  it('returns the catalog failure message from an encrypted session.list', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const client = createClient();
    client.project.list = async () => ({ data: undefined, error: {}, request: {}, response: {} });
    const gateway = createGateway({ pairing, client });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const result = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error.message).toBe('OpenCode project list failed');
    }
  });

  it('clears the host pairing payload holder after pairing and revocation', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    let cleared = 0;
    const gateway = createGateway({
      pairing,
      clearPairingPayload: () => {
        cleared += 1;
      },
    });

    await pairGateway(gateway, pairing);
    expect(cleared).toBe(1);

    gateway.revoke();
    expect(cleared).toBe(2);
  });

  it('rejects a confirmation sealed under a key other than the derived session key', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    const device = await createDeviceRequest(created.payload, crypto);
    const result = await gateway.handlePairing(device.request);
    if (result instanceof GatewayError) throw result;

    // Re-seal the proof under an unrelated key while keeping the transcript as
    // AAD, so the tag itself is well formed and only the key binding is wrong.
    const transcript = buildTranscript({
      version: created.payload.version,
      pairingId: created.payload.pairingId,
      hostPublicKey: created.payload.hostPublicKey,
      devicePublicKey: device.request.devicePublicKey,
    });
    const resealed = await crypto.cipher.encrypt({
      key: new Uint8Array(SESSION_KEY_LENGTH).fill(0x5a),
      plaintext: new Uint8Array(32).fill(0x01),
      aad: transcript,
    });
    const forged: PairingCompleteResponse = {
      ...result.response,
      sealedConfirmation: {
        nonce: toBase64(resealed.nonce),
        ciphertext: toBase64(resealed.ciphertext),
        tag: toBase64(resealed.tag),
      },
    };

    await expect(device.finish(forged)).rejects.toThrow();
  });

  it('rejects a sealed secret that does not match the pending one-time secret', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;

    const wrongPayload: PairingPayload = {
      ...created.payload,
      oneTimeSecret: toBase64(new Uint8Array(32).fill(9)),
    };
    const device = await createDeviceRequest(wrongPayload, createHostPairingCrypto());

    expect(await gateway.handlePairing(device.request)).toBeInstanceOf(GatewayError);
  });

  it('rejects reuse of an already-consumed pairing', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;

    const first = await createDeviceRequest(created.payload, crypto);
    expect(await gateway.handlePairing(first.request)).not.toBeInstanceOf(GatewayError);

    const reuse = await createDeviceRequest(created.payload, crypto);
    expect(await gateway.handlePairing(reuse.request)).toBeInstanceOf(GatewayError);
  });

  it('rejects a pairing request after the QR expires', async () => {
    let current = TEST_NOW;
    const pairing = new PairingManager({ now: () => current });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    const device = await createDeviceRequest(created.payload, crypto);

    current = new Date(TEST_NOW.getTime() + PAIRING_TTL_SECONDS * 1000);

    expect(await gateway.handlePairing(device.request)).toBeInstanceOf(GatewayError);
  });

  it('refuses a second device until revoke, then pairs a fresh device', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    await pairGateway(gateway, pairing, crypto);

    expect(pairing.createPairing({ endpoints: ENDPOINTS })).toBeInstanceOf(PairingManagerError);

    gateway.revoke();
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    expect(created).not.toBeInstanceOf(PairingManagerError);
    if (created instanceof Error) throw created;
    const device = await createDeviceRequest(created.payload, crypto);
    expect(await gateway.handlePairing(device.request)).not.toBeInstanceOf(GatewayError);
  });

  it('asks the device to resync on a sequence gap without executing the gapped action', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const client = createClient();
    let executed = 0;
    client.session.list = async () => {
      executed += 1;
      return { data: [], error: undefined, request: {}, response: {} };
    };
    const gateway = createGateway({ pairing, client });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const accepted = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(accepted.kind).toBe('action');
    expect(gateway.highestAccepted('device-to-host')).toBe(0);
    const gap = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 2, { type: 'session.list' })),
    );
    expect(gap).toStrictEqual({ kind: 'resync', refetch: 'session.messages' });
    expect(gateway.highestAccepted('device-to-host')).toBe(0);
    expect(executed).toBe(1);
  });

  it('does not advance the accepted window for a tampered envelope', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const envelope = await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' });
    const tampered: Envelope = { ...envelope, tag: toBase64(new Uint8Array(16)) };
    const tamperedResult = await gateway.handleEnvelope(JSON.stringify(tampered));
    expect(tamperedResult.kind).toBe('error');
    expect(gateway.highestAccepted('device-to-host')).toBeUndefined();
    const retry = await gateway.handleEnvelope(JSON.stringify(envelope));
    expect(retry.kind).toBe('action');
    expect(gateway.highestAccepted('device-to-host')).toBe(0);
  });

  it('drops an envelope that was in flight when the device was revoked', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const { crypto, release } = createGatedCrypto();
    const client = createClient();
    let executed = 0;
    client.session.list = async () => {
      executed += 1;
      return { data: [], error: undefined, request: {}, response: {} };
    };
    const gateway = createGateway({ pairing, client, crypto });
    const deviceCrypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, deviceCrypto);
    const raw = JSON.stringify(
      await encryptAction(deviceCrypto, sessionKey, pairingId, 0, { type: 'session.list' }),
    );
    const pending = gateway.handleEnvelope(raw);
    gateway.revoke();
    release();
    const result = await pending;
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.error).toBeInstanceOf(GatewayError);
    expect(executed).toBe(0);
    expect(gateway.highestAccepted('device-to-host')).toBeUndefined();
    expect(gateway.status().state).toBe('revoked');
  });

  it('drops an envelope that was in flight when the gateway was disposed', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const { crypto, release } = createGatedCrypto();
    const client = createClient();
    let executed = 0;
    client.session.list = async () => {
      executed += 1;
      return { data: [], error: undefined, request: {}, response: {} };
    };
    const gateway = createGateway({ pairing, client, crypto });
    const deviceCrypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, deviceCrypto);
    const raw = JSON.stringify(
      await encryptAction(deviceCrypto, sessionKey, pairingId, 0, { type: 'session.list' }),
    );
    const pending = gateway.handleEnvelope(raw);
    await gateway.dispose();
    release();
    const result = await pending;
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.error).toBeInstanceOf(GatewayError);
    expect(executed).toBe(0);
    expect(gateway.highestAccepted('device-to-host')).toBeUndefined();
  });

  it('rejects a replayed authenticated sequence', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const first = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(first.kind).toBe('action');
    const replay = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(replay.kind).toBe('error');
  });

  it('refuses a revoked device on the envelope path', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    gateway.revoke();
    const result = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.error).toBeInstanceOf(GatewayError);
  });

  it('disposes listeners and clears session, replay, and event state', async () => {
    const http = createFakeHttp();
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ serverFactory: http.factory, pairing });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    gateway.handleEvent({ type: 'session.created', properties: {} });
    await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(gateway.highestAccepted('device-to-host')).toBe(0);
    await gateway.dispose();
    expect(gateway.highestAccepted('device-to-host')).toBeUndefined();
    expect(gateway.eventCount()).toBe(0);
    expect(http.calls.close).toBe(1);
    expect(http.calls.closeAllConnections).toBe(1);
    const afterDispose = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 1, { type: 'session.list' })),
    );
    expect(afterDispose.kind).toBe('error');
  });

  it('resets the server handle when listen emits an error', async () => {
    const http = createFakeHttp();
    const gateway = createGateway({ serverFactory: http.factory });
    const firstAttempt = gateway.listen();
    http.emit('error', new Error('listen failed'));
    await expect(firstAttempt).rejects.toThrow('listen failed');
    const secondAttempt = gateway.listen();
    http.emit('listening');
    await expect(secondAttempt).resolves.toEqual({ port: GATEWAY_PORT });
    expect(http.calls.listen).toBe(2);
  });

  it('rejects request bodies over the cap with 413', async () => {
    const http = createFakeHttp();
    const gateway = createGateway({ serverFactory: http.factory });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;
    const request = new FakeRequest('POST', '/pair', '127.0.0.1');
    const recorder = createResponseRecorder();
    http.invoke(request, recorder.response);
    request.emit('data', Buffer.alloc(MAX_REQUEST_BODY_BYTES + 1, 0x61));
    request.emit('end');
    await recorder.finished();
    expect(recorder.status()).toBe(413);
  });

  it('accepts a request body exactly at the cap', async () => {
    const http = createFakeHttp();
    const gateway = createGateway({ serverFactory: http.factory });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;
    const prefix = '{"padding":"';
    const suffix = '"}';
    const body = `${prefix}${'a'.repeat(
      MAX_REQUEST_BODY_BYTES - prefix.length - suffix.length,
    )}${suffix}`;
    expect(Buffer.byteLength(body)).toBe(MAX_REQUEST_BODY_BYTES);
    const request = new FakeRequest('POST', '/pair', '127.0.0.1');
    const recorder = createResponseRecorder();
    http.invoke(request, recorder.response);
    request.emit('data', Buffer.from(body));
    request.emit('end');
    await recorder.finished();
    // Exactly at the cap the body reaches the handler, so the response is the
    // pairing parse failure rather than the 413 body-cap rejection.
    expect(recorder.status()).toBe(400);
  });

  it('answers a successful HTTP /pair with 200 and never echoes the one-time secret', async () => {
    const http = createFakeHttp();
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing, serverFactory: http.factory });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    const device = await createDeviceRequest(created.payload, createHostPairingCrypto());
    const request = new FakeRequest('POST', '/pair', '127.0.0.1');
    const recorder = createResponseRecorder();
    http.invoke(request, recorder.response);
    request.emit('data', Buffer.from(JSON.stringify(device.request)));
    request.emit('end');
    await recorder.finished();
    expect(recorder.status()).toBe(200);
    const responseBody: unknown = JSON.parse(recorder.body());
    expect(responseBody).not.toHaveProperty('oneTimeSecret');
  });

  it('answers an HTTP /envelope sequence gap with 409 and the resync body', async () => {
    const http = createFakeHttp();
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing, serverFactory: http.factory });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const accepted = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(accepted.kind).toBe('action');
    const gapEnvelope = JSON.stringify(
      await encryptAction(crypto, sessionKey, pairingId, 2, { type: 'session.list' }),
    );
    const request = new FakeRequest('POST', '/envelope', '127.0.0.1');
    const recorder = createResponseRecorder();
    http.invoke(request, recorder.response);
    request.emit('data', Buffer.from(gapEnvelope));
    request.emit('end');
    await recorder.finished();
    expect(recorder.status()).toBe(409);
    expect(JSON.parse(recorder.body())).toStrictEqual({ resync: 'session.messages' });
  });

  it('caps /pair attempts with a bounded rate limit', async () => {
    const http = createFakeHttp();
    let currentNow = 1_000_000;
    const gateway = createGateway({ serverFactory: http.factory, now: () => currentNow });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;

    for (let attempt = 0; attempt < MAX_PAIR_ATTEMPTS; attempt += 1) {
      const request = new FakeRequest('POST', '/pair', '127.0.0.1');
      const recorder = createResponseRecorder();
      http.invoke(request, recorder.response);
      request.emit('data', Buffer.from('{}'));
      request.emit('end');
      await recorder.finished();
      expect(recorder.status()).toBe(400);
    }

    const blockedRequest = new FakeRequest('POST', '/pair', '127.0.0.1');
    const blocked = createResponseRecorder();
    http.invoke(blockedRequest, blocked.response);
    blockedRequest.emit('data', Buffer.from('{}'));
    blockedRequest.emit('end');
    await blocked.finished();
    expect(blocked.status()).toBe(429);

    currentNow += PAIR_RATE_WINDOW_MS + 1;
    const afterWindowRequest = new FakeRequest('POST', '/pair', '127.0.0.1');
    const afterWindow = createResponseRecorder();
    http.invoke(afterWindowRequest, afterWindow.response);
    afterWindowRequest.emit('data', Buffer.from('{}'));
    afterWindowRequest.emit('end');
    await afterWindow.finished();
    expect(afterWindow.status()).toBe(400);
  });

  it('caps /envelope requests with a bounded rate limit', async () => {
    const http = createFakeHttp();
    let currentNow = 1_000_000;
    const gateway = createGateway({ serverFactory: http.factory, now: () => currentNow });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;

    for (let attempt = 0; attempt < MAX_ENVELOPE_ATTEMPTS; attempt += 1) {
      const request = new FakeRequest('POST', '/envelope', '127.0.0.1');
      const recorder = createResponseRecorder();
      http.invoke(request, recorder.response);
      request.emit('data', Buffer.from('{}'));
      request.emit('end');
      await recorder.finished();
      expect(recorder.status()).toBe(400);
    }

    const blockedRequest = new FakeRequest('POST', '/envelope', '127.0.0.1');
    const blocked = createResponseRecorder();
    http.invoke(blockedRequest, blocked.response);
    blockedRequest.emit('data', Buffer.from('{}'));
    blockedRequest.emit('end');
    await blocked.finished();
    expect(blocked.status()).toBe(429);

    currentNow += ENVELOPE_RATE_WINDOW_MS + 1;
    const afterWindowRequest = new FakeRequest('POST', '/envelope', '127.0.0.1');
    const afterWindow = createResponseRecorder();
    http.invoke(afterWindowRequest, afterWindow.response);
    afterWindowRequest.emit('data', Buffer.from('{}'));
    afterWindowRequest.emit('end');
    await afterWindow.finished();
    expect(afterWindow.status()).toBe(400);
  });
});

describe('CodeRelayGateway event delivery', () => {
  it('returns queued allowlisted events sealed under the device session key', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    const queued = gateway.handleEvent({
      type: 'message.updated',
      properties: { info: { id: 'msg-1', path: { cwd: '/host/worktree', root: '/host' } } },
    });
    expect(queued).not.toBeNull();

    const handling = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(handling.kind).toBe('action');
    if (handling.kind !== 'action') throw new Error('expected an action handling');
    expect(handling.events).toHaveLength(1);
    const sealed = handling.events[0];
    if (sealed === undefined) throw new Error('expected one sealed event');
    expect(sealed.direction).toBe('host-to-device');
    expect(sealed.pairingId).toBe(pairingId);
    expect(sealed.sequence).toBe(0);
    // Only ciphertext is returned: the event name cannot survive the encoding.
    expect(JSON.stringify(handling.events)).not.toContain('message.updated');
    await expect(decryptSealedEvent(crypto, sessionKey, pairingId, sealed)).resolves.toEqual({
      name: 'message.updated',
      properties: {},
    });
    expect(gateway.eventCount()).toBe(0);
  });

  it('projects adversarial host events before encrypting them for the device', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    gateway.handleEvent({
      type: 'session.created',
      properties: {
        info: {
          directory: '/host/worktree',
          parentID: 'ses-parent',
          projectID: 'proj-secret',
        },
      },
    });
    gateway.handleEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          type: 'text',
          messageID: 'msg-1',
          sessionID: 'ses-1',
          text: 'Safe text',
          tool: { cwd: '/host/worktree', root: '/host', metadata: 'secret' },
        },
        cwd: '/host/worktree',
        root: '/host',
      },
    });
    gateway.handleEvent({
      type: 'permission.updated',
      properties: {
        info: {
          id: 'perm-1',
          sessionID: 'ses-1',
          title: 'Approve change',
          metadata: { worktree: '/host/worktree' },
        },
        messageID: 'msg-1',
        metadata: { directory: '/host/worktree' },
      },
    });

    const handling = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(handling.kind).toBe('action');
    if (handling.kind !== 'action') throw new Error('expected an action handling');
    const decrypted = await Promise.all(
      handling.events.map((event) => decryptSealedEvent(crypto, sessionKey, pairingId, event)),
    );
    expect(decrypted).toStrictEqual([
      { name: 'session.created', properties: {} },
      {
        name: 'message.part.updated',
        properties: {
          part: { type: 'text', messageID: 'msg-1', sessionID: 'ses-1', text: 'Safe text' },
        },
      },
      {
        name: 'permission.asked',
        properties: { id: 'perm-1', sessionID: 'ses-1', title: 'Approve change' },
      },
    ]);
    const serialized = JSON.stringify(decrypted);
    for (const forbidden of [
      'directory',
      'worktree',
      'parentID',
      'projectID',
      'cwd',
      'root',
      'metadata',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('does not deliver a non-allowlisted event', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);
    expect(gateway.handleEvent({ type: 'file.edited', properties: {} })).toBeNull();

    const handling = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(handling.kind).toBe('action');
    if (handling.kind !== 'action') throw new Error('expected an action handling');
    expect(handling.events).toStrictEqual([]);
  });

  it('returns an empty events array when nothing is queued', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairGateway(gateway, pairing, crypto);

    const handling = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(handling.kind).toBe('action');
    if (handling.kind !== 'action') throw new Error('expected an action handling');
    expect(handling.events).toStrictEqual([]);
  });

  it('drops pre-revoke events before a new device pairs and delivers newly queued events', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    await pairGateway(gateway, pairing, crypto);

    expect(
      gateway.handleEvent({
        type: 'session.status',
        properties: {
          sessionID: 'ses-revoked',
          status: { type: 'busy', directory: '/host/worktree' },
        },
      }),
    ).toStrictEqual({
      name: 'session.status',
      properties: { sessionID: 'ses-revoked', status: { type: 'busy' } },
    });
    gateway.revoke();

    const fresh = await pairGateway(gateway, pairing, crypto);
    const afterRePair = await gateway.handleEnvelope(
      JSON.stringify(
        await encryptAction(crypto, fresh.sessionKey, fresh.pairingId, 0, { type: 'session.list' }),
      ),
    );
    expect(afterRePair.kind).toBe('action');
    if (afterRePair.kind !== 'action') throw new Error('expected an action handling');
    expect(afterRePair.events).toStrictEqual([]);

    expect(
      gateway.handleEvent({
        type: 'session.status',
        properties: { sessionID: 'ses-fresh', status: { type: 'idle' } },
      }),
    ).toStrictEqual({
      name: 'session.status',
      properties: { sessionID: 'ses-fresh', status: { type: 'idle' } },
    });
    const afterFreshEvent = await gateway.handleEnvelope(
      JSON.stringify(
        await encryptAction(crypto, fresh.sessionKey, fresh.pairingId, 1, { type: 'session.list' }),
      ),
    );
    expect(afterFreshEvent.kind).toBe('action');
    if (afterFreshEvent.kind !== 'action') throw new Error('expected an action handling');
    expect(afterFreshEvent.events).toHaveLength(1);
    const sealed = afterFreshEvent.events[0];
    if (sealed === undefined) throw new Error('expected one sealed event');
    expect(sealed.sequence).toBe(0);
    await expect(decryptSealedEvent(crypto, fresh.sessionKey, fresh.pairingId, sealed)).resolves.toEqual({
      name: 'session.status',
      properties: { sessionID: 'ses-fresh', status: { type: 'idle' } },
    });
  });

  it('increases the host-to-device sequence and resets it after revoke', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const gateway = createGateway({ pairing });
    const crypto = createHostPairingCrypto();
    const first = await pairGateway(gateway, pairing, crypto);
    gateway.handleEvent({ type: 'session.created', properties: {} });
    gateway.handleEvent({ type: 'session.updated', properties: {} });

    const firstHandling = await gateway.handleEnvelope(
      JSON.stringify(
        await encryptAction(crypto, first.sessionKey, first.pairingId, 0, { type: 'session.list' }),
      ),
    );
    expect(firstHandling.kind).toBe('action');
    if (firstHandling.kind !== 'action') throw new Error('expected an action handling');
    expect(firstHandling.events.map((event) => event.sequence)).toEqual([0, 1]);

    gateway.revoke();
    const second = await pairGateway(gateway, pairing, crypto);
    gateway.handleEvent({ type: 'session.created', properties: {} });
    const secondHandling = await gateway.handleEnvelope(
      JSON.stringify(
        await encryptAction(crypto, second.sessionKey, second.pairingId, 0, { type: 'session.list' }),
      ),
    );
    expect(secondHandling.kind).toBe('action');
    if (secondHandling.kind !== 'action') throw new Error('expected an action handling');
    expect(secondHandling.events.map((event) => event.sequence)).toEqual([0]);
  });
});

describe('CodeRelayGateway pairing payload route', () => {
  function invoke(
    http: FakeHttp,
    address: string | undefined,
    method = 'GET',
    headers: Record<string, string | string[] | undefined> = {},
  ): { status: () => number; body: () => string; finished: () => Promise<void> } {
    const request = new FakeRequest(method, '/pairing-payload', address, headers);
    const recorder = createResponseRecorder();
    http.invoke(request, recorder.response);
    return recorder;
  }

  it('serves the payload to every loopback form while the pairing is waiting', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    const http = createFakeHttp();
    const gateway = createGateway({
      pairing,
      serverFactory: http.factory,
      pairingPayload: () => created.payload,
    });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;

    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      const recorder = invoke(http, address);
      await recorder.finished();
      expect(recorder.status()).toBe(200);
      expect(JSON.parse(recorder.body())).toStrictEqual({ payload: created.payload });
    }
  });

  it('forbids non-loopback peers with 403 and never echoes the secret', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    const http = createFakeHttp();
    const gateway = createGateway({
      pairing,
      serverFactory: http.factory,
      pairingPayload: () => created.payload,
    });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;

    const peers: { address: string | undefined; headers: Record<string, string> }[] = [
      { address: '192.168.1.20', headers: {} },
      // A spoofed forwarding header must not be trusted over the socket peer.
      {
        address: '10.0.0.7',
        headers: { 'x-forwarded-for': '127.0.0.1', 'x-real-ip': '127.0.0.1' },
      },
      { address: undefined, headers: {} },
    ];
    for (const peer of peers) {
      const recorder = invoke(http, peer.address, 'GET', peer.headers);
      await recorder.finished();
      expect(recorder.status()).toBe(403);
      expect(recorder.body()).not.toContain(created.oneTimeSecret);
    }
  });

  it('returns 409 when no pairing is waiting', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const http = createFakeHttp();
    const gateway = createGateway({ pairing, serverFactory: http.factory });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;

    const recorder = invoke(http, '127.0.0.1');
    await recorder.finished();
    expect(recorder.status()).toBe(409);
  });

  it('stops serving the payload once the pairing completes or is revoked', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    const http = createFakeHttp();
    const gateway = createGateway({
      pairing,
      serverFactory: http.factory,
      // Deliberately keeps returning the payload after the state changes, so the
      // 409 proves the gateway's own `waiting` gate rather than the provider.
      pairingPayload: () => created.payload,
    });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;

    const waiting = invoke(http, '127.0.0.1');
    await waiting.finished();
    expect(waiting.status()).toBe(200);

    const device = await createDeviceRequest(created.payload, createHostPairingCrypto());
    const paired = await gateway.handlePairing(device.request);
    expect(paired).not.toBeInstanceOf(GatewayError);

    // The 409 body may only carry the non-secret manager state, never any
    // payload-derived value: secret, pairing id, host key, or host endpoints.
    const forbiddenPayloadFields = [
      created.oneTimeSecret,
      created.pairingId,
      created.payload.hostPublicKey,
      ...created.payload.endpoints,
    ];

    const afterPair = invoke(http, '127.0.0.1');
    await afterPair.finished();
    expect(afterPair.status()).toBe(409);
    expect(JSON.parse(afterPair.body())).toStrictEqual({
      error: 'pairing-not-waiting',
      state: 'paired',
    });
    for (const forbidden of forbiddenPayloadFields) {
      expect(afterPair.body()).not.toContain(forbidden);
    }

    gateway.revoke();
    const afterRevoke = invoke(http, '127.0.0.1');
    await afterRevoke.finished();
    expect(afterRevoke.status()).toBe(409);
    expect(JSON.parse(afterRevoke.body())).toStrictEqual({
      error: 'pairing-not-waiting',
      state: 'revoked',
    });
    for (const forbidden of forbiddenPayloadFields) {
      expect(afterRevoke.body()).not.toContain(forbidden);
    }
  });

  it('rejects non-GET methods from loopback with 405', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    const http = createFakeHttp();
    const gateway = createGateway({
      pairing,
      serverFactory: http.factory,
      pairingPayload: () => created.payload,
    });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;

    const recorder = invoke(http, '127.0.0.1', 'POST');
    await recorder.finished();
    expect(recorder.status()).toBe(405);
  });
});

describe('CodeRelayGateway pairing renew route', () => {
  function invokeRenew(
    http: FakeHttp,
    address: string | undefined,
    method = 'POST',
  ): {
    status: () => number;
    body: () => string;
    headers: () => Record<string, string>;
    finished: () => Promise<void>;
  } {
    const request = new FakeRequest(method, '/pairing-renew', address);
    const recorder = createResponseRecorder();
    http.invoke(request, recorder.response);
    return recorder;
  }

  function freshPayloadFrom(payload: PairingPayload): PairingPayload {
    return {
      ...payload,
      pairingId: 'pairing-renewed',
      oneTimeSecret: toBase64(new Uint8Array(32).fill(3)),
      expiresAt: new Date(TEST_NOW.getTime() + PAIRING_TTL_SECONDS * 1000).toISOString(),
    };
  }

  async function listenRenewGateway(overrides: GatewayOverrides = {}): Promise<{
    http: FakeHttp;
    gateway: CodeRelayGateway;
  }> {
    const http = createFakeHttp();
    const gateway = createGateway({ serverFactory: http.factory, ...overrides });
    const listening = gateway.listen();
    http.emit('listening');
    await listening;
    return { http, gateway };
  }

  it('refuses non-loopback peers with 403 and never invokes the renewal provider', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    let renewed = 0;
    const { http } = await listenRenewGateway({
      pairing,
      pairingPayload: () => created.payload,
      renewPairing: () => {
        renewed += 1;
        return freshPayloadFrom(created.payload);
      },
    });

    const recorder = invokeRenew(http, '192.168.1.20');
    await recorder.finished();
    expect(recorder.status()).toBe(403);
    expect(recorder.body()).not.toContain(created.oneTimeSecret);
    expect(renewed).toBe(0);
  });

  it('refuses renewal with 403 while a device is paired', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    await pairGateway(createGateway({ pairing }), pairing);
    let renewed = 0;
    const { http } = await listenRenewGateway({
      pairing,
      renewPairing: () => {
        renewed += 1;
        return null;
      },
    });

    const recorder = invokeRenew(http, '127.0.0.1');
    await recorder.finished();
    expect(recorder.status()).toBe(403);
    expect(JSON.parse(recorder.body())).toStrictEqual({ error: 'pairing-already-paired' });
    expect(renewed).toBe(0);
  });

  it('re-serves the current payload with no-store while the pairing is waiting', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    let renewed = 0;
    const { http } = await listenRenewGateway({
      pairing,
      pairingPayload: () => created.payload,
      renewPairing: () => {
        renewed += 1;
        return freshPayloadFrom(created.payload);
      },
    });

    const recorder = invokeRenew(http, '127.0.0.1');
    await recorder.finished();
    expect(recorder.status()).toBe(200);
    expect(JSON.parse(recorder.body())).toStrictEqual({ payload: created.payload });
    expect(recorder.headers()['cache-control']).toBe('no-store');
    expect(renewed).toBe(0);
  });

  it('reissues a fresh payload through the provider after the pairing expires', async () => {
    let current = TEST_NOW;
    const pairing = new PairingManager({ now: () => current });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    const fresh = freshPayloadFrom(created.payload);
    let renewed = 0;
    const { http } = await listenRenewGateway({
      pairing,
      pairingPayload: () => created.payload,
      renewPairing: () => {
        renewed += 1;
        return fresh;
      },
    });

    current = new Date(TEST_NOW.getTime() + PAIRING_TTL_SECONDS * 1000);
    expect(pairing.status().state).toBe('expired');

    const recorder = invokeRenew(http, '127.0.0.1');
    await recorder.finished();
    expect(recorder.status()).toBe(200);
    expect(JSON.parse(recorder.body())).toStrictEqual({ payload: fresh });
    expect(recorder.headers()['cache-control']).toBe('no-store');
    expect(renewed).toBe(1);
  });

  it('reissues a fresh payload through the provider after the pairing is revoked', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    const fresh = freshPayloadFrom(created.payload);
    let renewed = 0;
    const { http } = await listenRenewGateway({
      pairing,
      pairingPayload: () => created.payload,
      renewPairing: () => {
        renewed += 1;
        return fresh;
      },
    });

    pairing.revoke();
    expect(pairing.status().state).toBe('revoked');

    const recorder = invokeRenew(http, '127.0.0.1');
    await recorder.finished();
    expect(recorder.status()).toBe(200);
    expect(JSON.parse(recorder.body())).toStrictEqual({ payload: fresh });
    expect(renewed).toBe(1);
  });

  it('rejects non-POST methods from loopback with 405', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const { http } = await listenRenewGateway({ pairing });

    const recorder = invokeRenew(http, '127.0.0.1', 'GET');
    await recorder.finished();
    expect(recorder.status()).toBe(405);
  });

  it('answers 503 when renewal is requested without a configured provider', async () => {
    let current = TEST_NOW;
    const pairing = new PairingManager({ now: () => current });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    const { http } = await listenRenewGateway({ pairing });

    current = new Date(TEST_NOW.getTime() + PAIRING_TTL_SECONDS * 1000);

    const recorder = invokeRenew(http, '127.0.0.1');
    await recorder.finished();
    expect(recorder.status()).toBe(503);
    expect(JSON.parse(recorder.body())).toStrictEqual({ error: 'pairing-renew-unavailable' });
  });

  it('shares the pairing-payload rate-limit budget with the payload route', async () => {
    const pairing = new PairingManager({ now: () => TEST_NOW });
    const created = pairing.createPairing({ endpoints: ENDPOINTS });
    if (created instanceof Error) throw created;
    let currentNow = 1_000_000;
    const { http } = await listenRenewGateway({
      pairing,
      now: () => currentNow,
      pairingPayload: () => created.payload,
    });

    for (let attempt = 0; attempt < MAX_PAIRING_PAYLOAD_REQUESTS; attempt += 1) {
      const recorder = invokeRenew(http, '127.0.0.1');
      await recorder.finished();
      expect(recorder.status()).toBe(200);
    }

    const blocked = invokeRenew(http, '127.0.0.1');
    await blocked.finished();
    expect(blocked.status()).toBe(429);

    // The renew route shares the pairing-payload budget, so the GET route is
    // throttled too once the combined requests exhaust the window.
    const payloadRequest = new FakeRequest('GET', '/pairing-payload', '127.0.0.1');
    const payloadRecorder = createResponseRecorder();
    http.invoke(payloadRequest, payloadRecorder.response);
    await payloadRecorder.finished();
    expect(payloadRecorder.status()).toBe(429);
  });
});
