import { EventEmitter } from 'node:events';
import { Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  buildAad,
  buildPairingProof,
  buildTranscript,
  derivePairingKey,
  deriveSessionKey,
} from '@coderelay/protocol';
import type {
  Bytes,
  Envelope,
  PairingCompleteResponse,
  PairingPayload,
  PairingRequest,
} from '@coderelay/protocol';
import type { OpenCodeClientLike, SessionListOptions } from './allowlist';
import { createHostPairingCrypto, fromBase64, toBase64 } from './crypto';
import type { HostPairingCrypto } from './crypto';
import { CodeRelayGateway, GatewayError } from './gateway';
import type { GatewayServerFactory } from './gateway';
import { PairingManager } from './pairing';
import { SessionCatalog } from './session-catalog';
import type { OpenCodeProjectApi } from './session-catalog';

const ENDPOINTS = ['http://192.168.1.20:47821'];

const DEFAULT_WORKTREE = '/home/dev/default';

function createClock(startIso: string): {
  now: () => Date;
  nowMs: () => number;
} {
  const current = new Date(startIso);
  return {
    now: () => current,
    nowMs: () => current.getTime(),
  };
}

interface FakeClient extends OpenCodeClientLike {
  project: OpenCodeProjectApi;
}

function createClient(): { client: FakeClient; calls: { list: number; messages: number } } {
  const calls = { list: 0, messages: 0 };
  const client: FakeClient = {
    project: {
      list: async () => ({
        data: [{ id: 'proj-default', worktree: DEFAULT_WORKTREE }],
        error: undefined,
        request: {},
        response: {},
      }),
    },
    session: {
      list: async (options?: SessionListOptions) => {
        calls.list += 1;
        const directory = options?.query?.directory;
        return {
          data:
            directory === DEFAULT_WORKTREE
              ? [
                  {
                    id: 'session-1',
                    projectID: 'proj-default',
                    directory: DEFAULT_WORKTREE,
                    time: { updated: 400 },
                    title: 'Reconnect session',
                  },
                ]
              : [],
          error: undefined,
          request: {},
          response: {},
        };
      },
      status: async () => ({ data: {}, error: undefined, request: {}, response: {} }),
      messages: async () => {
        calls.messages += 1;
        return { data: [], error: undefined, request: {}, response: {} };
      },
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
  return { client, calls };
}

function createGateway(options: {
  client: FakeClient;
  pairing: PairingManager;
  serverFactory?: GatewayServerFactory;
  now?: () => number;
}): CodeRelayGateway {
  return new CodeRelayGateway({
    client: options.client,
    catalog: new SessionCatalog(options.client),
    pairing: options.pairing,
    serverFactory: options.serverFactory,
    now: options.now,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectSessionCatalog(value: unknown): void {
  if (!isRecord(value)) throw new Error('expected a catalog record');
  expect(Object.keys(value).sort()).toStrictEqual(['projects', 'sessions']);

  const projects = value.projects;
  if (!Array.isArray(projects)) throw new Error('expected a projects array');
  expect(projects).toHaveLength(1);
  const project = projects[0];
  if (!isRecord(project)) throw new Error('expected a project record');
  expect(Object.keys(project).sort()).toStrictEqual(['key', 'label']);
  expect(project.label).toBe('default');
  expect(String(project.key)).toMatch(/^[0-9a-f]{64}$/);

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
  expect(summary.id).toBe('session-1');
  expect(summary.title).toBe('Reconnect session');
  expect(summary.updatedAt).toBe(400);
  expect(summary.projectLabel).toBe('default');
  expect(String(summary.projectKey)).toMatch(/^[0-9a-f]{64}$/);
  // The summary stays bound to its project entry through the shared key.
  expect(summary.projectKey).toBe(project.key);

  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('directory');
  expect(serialized).not.toContain('worktree');
  expect(serialized).not.toContain('parentID');
  expect(serialized).not.toContain('projectID');
}

function bytesEqual(left: Bytes, right: Bytes): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Device-side handshake simulation. The production device uses `@noble/curves`;
 * this test drives the same protocol primitives with the host's node:crypto
 * adapters so the reconnect cases stay self-contained and deterministic.
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

async function pairDevice(
  gateway: CodeRelayGateway,
  pairing: PairingManager,
  crypto: HostPairingCrypto,
): Promise<{ sessionKey: Bytes; pairingId: string }> {
  const created = pairing.createPairing({ endpoints: ENDPOINTS });
  if (created instanceof Error) throw created;
  const device = await createDeviceRequest(created.payload, crypto);
  const result = await gateway.handlePairing(device.request);
  if (result instanceof GatewayError) throw result;
  const sessionKey = await device.finish(result.response);
  return { sessionKey, pairingId: created.pairingId };
}

class FakeRequest extends EventEmitter {
  readonly method: string;
  readonly url: string;
  readonly socket: { remoteAddress: string | undefined };

  constructor(method: string, url: string, remoteAddress: string | undefined) {
    super();
    this.method = method;
    this.url = url;
    this.socket = { remoteAddress };
  }
}

/**
 * Structural views of the `node:http` request/response the gateway touches.
 * Keeping the fakes narrow means the test bodies never cast a fake into the
 * wider `IncomingMessage`/`ServerResponse` types.
 */
interface FakeIncomingMessage {
  method: string;
  url: string;
  socket: { remoteAddress: string | undefined };
  on(event: string, listener: (...args: unknown[]) => void): void;
}

interface FakeServerResponse {
  writeHead(status: number, headers?: Record<string, string>): void;
  end(value?: string): void;
}

interface ResponseRecorder {
  response: FakeServerResponse;
  status: () => number;
  body: () => string;
  finished: () => Promise<void>;
}

function createResponseRecorder(): ResponseRecorder {
  let statusCode = 0;
  let payload = '';
  let resolveFinished: (() => void) | null = null;
  const completion = new Promise<void>((resolve) => {
    resolveFinished = () => resolve();
  });
  const response: FakeServerResponse = {
    writeHead(code: number): void {
      statusCode = code;
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

async function listenGateway(gateway: CodeRelayGateway, http: FakeHttp): Promise<void> {
  const listening = gateway.listen();
  http.emit('listening');
  await listening;
}

async function postEnvelope(http: FakeHttp, envelope: Envelope): Promise<ResponseRecorder> {
  const request = new FakeRequest('POST', '/envelope', '127.0.0.1');
  const recorder = createResponseRecorder();
  http.invoke(request, recorder.response);
  request.emit('data', Buffer.from(JSON.stringify(envelope)));
  request.emit('end');
  await recorder.finished();
  return recorder;
}

describe('gateway reconnect and revocation', () => {
  it('returns a resync instruction for a sequence gap without executing the gapped action', async () => {
    const clock = createClock('2026-09-18T00:00:00.000Z');
    const pairing = new PairingManager({ now: clock.now });
    const { client, calls } = createClient();
    const gateway = createGateway({ client, pairing, now: clock.nowMs });
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairDevice(gateway, pairing, crypto);

    const accepted = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' })),
    );
    expect(accepted.kind).toBe('action');
    if (accepted.kind === 'action') {
      expectSessionCatalog(accepted.result.value);
    }
    expect(calls.list).toBe(1);

    const gap = await gateway.handleEnvelope(
      JSON.stringify(await encryptAction(crypto, sessionKey, pairingId, 2, { type: 'session.list' })),
    );

    expect(gap).toStrictEqual({ kind: 'resync', refetch: 'session.messages' });
    expect(calls.list).toBe(1);
    expect(gateway.highestAccepted('device-to-host')).toBe(0);
  });

  it('answers an HTTP sequence gap with 409 and the resync body', async () => {
    const clock = createClock('2026-09-18T00:00:00.000Z');
    const pairing = new PairingManager({ now: clock.now });
    const { client, calls } = createClient();
    const http = createFakeHttp();
    const gateway = createGateway({
      client,
      pairing,
      now: clock.nowMs,
      serverFactory: http.factory,
    });
    await listenGateway(gateway, http);
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairDevice(gateway, pairing, crypto);

    const accepted = await postEnvelope(
      http,
      await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' }),
    );
    expect(accepted.status()).toBe(200);
    const acceptedBody: unknown = JSON.parse(accepted.body());
    if (!isRecord(acceptedBody)) throw new Error('expected an object body');
    const acceptedResult = acceptedBody.result;
    if (!isRecord(acceptedResult)) throw new Error('expected a result record');
    expectSessionCatalog(acceptedResult.value);
    expect(calls.list).toBe(1);

    const gap = await postEnvelope(
      http,
      await encryptAction(crypto, sessionKey, pairingId, 2, { type: 'session.list' }),
    );
    expect(gap.status()).toBe(409);
    expect(JSON.parse(gap.body())).toStrictEqual({ resync: 'session.messages' });
    expect(calls.list).toBe(1);
    expect(gateway.highestAccepted('device-to-host')).toBe(0);
  });

  it('accepts a contiguous reconnect after the resync request', async () => {
    const clock = createClock('2026-09-18T00:00:00.000Z');
    const pairing = new PairingManager({ now: clock.now });
    const { client, calls } = createClient();
    const http = createFakeHttp();
    const gateway = createGateway({
      client,
      pairing,
      now: clock.nowMs,
      serverFactory: http.factory,
    });
    await listenGateway(gateway, http);
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairDevice(gateway, pairing, crypto);

    await postEnvelope(
      http,
      await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' }),
    );
    const gap = await postEnvelope(
      http,
      await encryptAction(crypto, sessionKey, pairingId, 2, { type: 'session.list' }),
    );
    expect(gap.status()).toBe(409);

    const resumed = await postEnvelope(
      http,
      await encryptAction(crypto, sessionKey, pairingId, 1, {
        type: 'session.messages',
        sessionID: 'session-1',
      }),
    );

    expect(resumed.status()).toBe(200);
    expect(calls.list).toBe(1);
    expect(calls.messages).toBe(1);
    expect(gateway.highestAccepted('device-to-host')).toBe(1);

    const refetched = await postEnvelope(
      http,
      await encryptAction(crypto, sessionKey, pairingId, 2, { type: 'session.list' }),
    );
    expect(refetched.status()).toBe(200);
    const refetchedBody: unknown = JSON.parse(refetched.body());
    if (!isRecord(refetchedBody)) throw new Error('expected an object body');
    const refetchedResult = refetchedBody.result;
    if (!isRecord(refetchedResult)) throw new Error('expected a result record');
    expectSessionCatalog(refetchedResult.value);
    expect(calls.list).toBe(2);
    expect(gateway.highestAccepted('device-to-host')).toBe(2);
  });

  it('refuses a revoked device on reconnect', async () => {
    const clock = createClock('2026-09-18T00:00:00.000Z');
    const pairing = new PairingManager({ now: clock.now });
    const { client, calls } = createClient();
    const http = createFakeHttp();
    const gateway = createGateway({
      client,
      pairing,
      now: clock.nowMs,
      serverFactory: http.factory,
    });
    await listenGateway(gateway, http);
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairDevice(gateway, pairing, crypto);

    gateway.revoke();

    const refused = await postEnvelope(
      http,
      await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' }),
    );

    expect(refused.status()).toBe(400);
    expect(JSON.parse(refused.body())).toStrictEqual({ error: 'Device has been revoked' });
    expect(calls.list).toBe(0);
    expect(gateway.status().state).toBe('revoked');
  });

  it('refuses the device after the gateway is disposed', async () => {
    const clock = createClock('2026-09-18T00:00:00.000Z');
    const pairing = new PairingManager({ now: clock.now });
    const { client, calls } = createClient();
    const http = createFakeHttp();
    const gateway = createGateway({
      client,
      pairing,
      now: clock.nowMs,
      serverFactory: http.factory,
    });
    await listenGateway(gateway, http);
    const crypto = createHostPairingCrypto();
    const { sessionKey, pairingId } = await pairDevice(gateway, pairing, crypto);

    await gateway.dispose();

    const refused = await postEnvelope(
      http,
      await encryptAction(crypto, sessionKey, pairingId, 0, { type: 'session.list' }),
    );

    expect(refused.status()).toBe(400);
    expect(JSON.parse(refused.body())).toStrictEqual({ error: 'Session key is not established' });
    expect(calls.list).toBe(0);
  });

  it('accepts a fresh sequence zero after revoke and re-pair', async () => {
    const clock = createClock('2026-09-18T00:00:00.000Z');
    const pairing = new PairingManager({ now: clock.now });
    const { client, calls } = createClient();
    const http = createFakeHttp();
    const gateway = createGateway({
      client,
      pairing,
      now: clock.nowMs,
      serverFactory: http.factory,
    });
    await listenGateway(gateway, http);
    const crypto = createHostPairingCrypto();

    const first = await pairDevice(gateway, pairing, crypto);
    await postEnvelope(
      http,
      await encryptAction(crypto, first.sessionKey, first.pairingId, 0, { type: 'session.list' }),
    );
    expect(gateway.highestAccepted('device-to-host')).toBe(0);

    gateway.revoke();

    const second = await pairDevice(gateway, pairing, crypto);
    expect(second.pairingId).not.toBe(first.pairingId);

    const reconnect = await postEnvelope(
      http,
      await encryptAction(crypto, second.sessionKey, second.pairingId, 0, { type: 'session.list' }),
    );

    expect(reconnect.status()).toBe(200);
    expect(gateway.highestAccepted('device-to-host')).toBe(0);
    expect(calls.list).toBe(2);
  });
});
