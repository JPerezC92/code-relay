import { PROTOCOL_VERSION } from '@coderelay/protocol';
import type { Plugin } from '@opencode/plugin';
import { toString as qrToString } from 'qrcode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Endpoint } from './endpoints';
import plugin from './index';
import type { SessionCatalog } from './session-catalog';

interface RegisteredTool {
  name: string;
  description: string;
  input: unknown;
  execute: (
    input: unknown,
    context: unknown,
  ) => Promise<{ output?: unknown; content?: unknown; metadata?: unknown }>;
}

interface GatewayDouble {
  deps: {
    client: unknown;
    pairing: { status: () => { state: string } };
    catalog: SessionCatalog;
    pairingPayload: () => unknown;
    clearPairingPayload: () => void;
    renewPairing: () => unknown;
  };
  listen: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  handleEvent: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
}

interface FakeContext {
  tool: {
    transform: (
      callback: (editor: { add: (tool: RegisteredTool) => void }) => void,
    ) => Promise<{ dispose: () => Promise<void> }>;
  };
  event: { subscribe: (options?: { signal?: AbortSignal }) => AsyncIterable<unknown> };
}

/** Raw V2 project record exactly as the port's `project.list` maps it. */
interface ProjectRecord {
  id: string;
  canonical: string;
}

/** Raw V2 session record exactly as the port's `session.list` maps it. */
interface SessionRecord {
  id: string;
  parentID?: string | undefined;
  projectID: string;
  title?: string | undefined;
  time: { created: number; updated: number };
  location: { directory: string };
}

interface SessionListResponse {
  data: SessionRecord[];
  cursor: Record<string, unknown>;
}

interface DiscoveredService {
  url: string;
  auth: unknown;
}

interface SessionStatusEventData {
  sessionID: string;
  status?: { type: string } | undefined;
}

function createProjectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return { id: 'proj-test', canonical: 'C:\\host\\root', ...overrides };
}

function createSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'ses-test',
    projectID: 'proj-test',
    time: { created: 1, updated: 100 },
    location: { directory: 'C:\\host\\root' },
    ...overrides,
  };
}

function createSessionListResponse(data: SessionRecord[] = []): SessionListResponse {
  return { data, cursor: {} };
}

function createEndpointRecord(overrides: Partial<Endpoint> = {}): Endpoint {
  return { kind: 'lan', url: 'http://127.0.0.1:47821', ...overrides };
}

function createDiscoveredService(overrides: Partial<DiscoveredService> = {}): DiscoveredService {
  return { url: 'http://127.0.0.1:47821', auth: undefined, ...overrides };
}

function createSessionStatusEvent(
  overrides: Partial<SessionStatusEventData> = {},
): { type: 'session.status'; data: SessionStatusEventData } {
  return {
    type: 'session.status',
    data: { sessionID: 'ses-test', status: { type: 'running' }, ...overrides },
  };
}

const mocks = vi.hoisted(() => {
  const gatewayInstances: unknown[] = [];
  const host = {
    session: {
      list: vi.fn(),
      active: vi.fn(),
      context: vi.fn(),
      switchModel: vi.fn(),
      prompt: vi.fn(),
      interrupt: vi.fn(),
    },
    model: { list: vi.fn(), default: vi.fn() },
    permission: { reply: vi.fn() },
    project: { list: vi.fn() },
  };
  return {
    gatewayInstances,
    host,
    discover: vi.fn(),
    make: vi.fn(() => host),
    detectEndpoints: vi.fn(),
    headers: vi.fn(() => undefined),
  };
});

vi.mock('./endpoints', () => ({
  detectEndpoints: mocks.detectEndpoints,
}));

vi.mock('./gateway', () => {
  class CodeRelayGatewayDouble {
    readonly deps: GatewayDouble['deps'];
    listen = vi.fn(async () => undefined);
    dispose = vi.fn(async () => undefined);
    handleEvent = vi.fn(() => null);
    status = vi.fn(() => this.deps.pairing.status());

    constructor(deps: GatewayDouble['deps']) {
      this.deps = deps;
      mocks.gatewayInstances.push(this);
    }
  }
  return { CodeRelayGateway: CodeRelayGatewayDouble };
});

vi.mock('@opencode/client', () => ({
  OpenCode: { make: mocks.make },
}));

vi.mock('@opencode/client/service', () => ({
  Service: { discover: mocks.discover },
  headers: mocks.headers,
}));

function lastGateway(): GatewayDouble {
  return mocks.gatewayInstances.at(-1) as GatewayDouble;
}

function createEventFeed(): {
  iterable: AsyncIterable<unknown>;
  captureSignal: (signal: AbortSignal) => void;
  getSignal: () => AbortSignal | undefined;
  push: (event: unknown) => void;
  end: () => void;
} {
  const queue: unknown[] = [];
  let wakeup: (() => void) | null = null;
  let ended = false;
  let capturedSignal: AbortSignal | undefined;

  const iterable: AsyncIterable<unknown> = {
    [Symbol.asyncIterator](): AsyncIterator<unknown> {
      return {
        async next(): Promise<IteratorResult<unknown>> {
          for (;;) {
            const queued = queue.shift();
            if (queued !== undefined) return { done: false, value: queued };
            if (ended || capturedSignal?.aborted === true) {
              return { done: true, value: undefined };
            }
            await new Promise<void>((resolve) => {
              wakeup = resolve;
            });
          }
        },
      };
    },
  };

  return {
    iterable,
    captureSignal: (signal: AbortSignal) => {
      capturedSignal = signal;
    },
    getSignal: () => capturedSignal,
    push: (event: unknown) => {
      queue.push(event);
      const notify = wakeup;
      wakeup = null;
      notify?.();
    },
    end: () => {
      ended = true;
      const notify = wakeup;
      wakeup = null;
      notify?.();
    },
  };
}

function createFakeContext(feed: ReturnType<typeof createEventFeed>): {
  context: FakeContext;
  toolRef: { current: RegisteredTool | null };
} {
  const toolRef: { current: RegisteredTool | null } = { current: null };
  const context: FakeContext = {
    tool: {
      transform: async (callback) => {
        callback({
          add: (tool: RegisteredTool) => {
            toolRef.current = tool;
          },
        });
        return { dispose: async () => undefined };
      },
    },
    event: {
      subscribe: (options?: { signal?: AbortSignal }) => {
        if (options?.signal !== undefined) feed.captureSignal(options.signal);
        return feed.iterable;
      },
    },
  };
  return { context, toolRef };
}

const cleanups: Array<() => Promise<void>> = [];

async function setupPlugin(): Promise<{
  cleanup: () => Promise<void>;
  feed: ReturnType<typeof createEventFeed>;
  tool: RegisteredTool;
  gateway: GatewayDouble;
  catalog: SessionCatalog;
  signal: () => AbortSignal | undefined;
}> {
  const feed = createEventFeed();
  const { context, toolRef } = createFakeContext(feed);
  const cleanup = await plugin.setup(context as unknown as Plugin.Context);
  const run = cleanup ?? (async () => undefined);
  let cleaned = false;
  const safeCleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    await run();
    feed.end();
  };
  cleanups.push(safeCleanup);
  const tool = toolRef.current;
  if (tool === null) throw new Error('coderelay_pair was not registered');
  const gateway = lastGateway();
  return {
    cleanup: safeCleanup,
    feed,
    tool,
    gateway,
    catalog: gateway.deps.catalog,
    signal: feed.getSignal,
  };
}

beforeEach(() => {
  mocks.gatewayInstances.length = 0;
  mocks.discover.mockReset();
  mocks.discover.mockResolvedValue(createDiscoveredService());
  mocks.make.mockClear();
  mocks.detectEndpoints.mockReset();
  mocks.detectEndpoints.mockResolvedValue([createEndpointRecord()]);
  mocks.host.project.list.mockReset();
  mocks.host.project.list.mockResolvedValue([]);
  mocks.host.session.list.mockReset();
  mocks.host.session.list.mockResolvedValue(createSessionListResponse());
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

describe('V2 plugin lifecycle entrypoint', () => {
  it('starts the gateway in setup with the composed host port', async () => {
    const { cleanup, gateway } = await setupPlugin();
    expect(mocks.detectEndpoints).toHaveBeenCalledTimes(1);
    expect(mocks.gatewayInstances).toHaveLength(1);
    expect(gateway.listen).toHaveBeenCalledTimes(1);
    expect(typeof gateway.deps.client).toBe('object');
    expect(typeof gateway.deps.pairingPayload).toBe('function');
    expect(typeof gateway.deps.clearPairingPayload).toBe('function');
    expect(typeof gateway.deps.renewPairing).toBe('function');
    await cleanup();
  });

  it('aborts the subscription and clears the served pairing payload before disposing the gateway', async () => {
    const orderLog: string[] = [];
    const { cleanup, tool, gateway, signal } = await setupPlugin();
    const subscriptionSignal = signal();
    gateway.dispose.mockImplementationOnce(async () => {
      orderLog.push(
        subscriptionSignal?.aborted === true ? 'aborted-before-dispose' : 'aborted-after-dispose',
      );
      orderLog.push(
        gateway.deps.pairingPayload() === null
          ? 'holders-cleared-before-dispose'
          : 'holders-live-at-dispose',
      );
    });
    await cleanup();
    expect(subscriptionSignal).toBeDefined();
    expect(subscriptionSignal?.aborted).toBe(true);
    expect(gateway.dispose).toHaveBeenCalledTimes(1);
    expect(orderLog).toEqual(['aborted-before-dispose', 'holders-cleared-before-dispose']);
    // The one-time-secret holder has no black-box probe: `pendingSecret` is a
    // closure variable reachable only through the served path, and the served
    // path cannot tell a cleared secret holder from a cleared payload holder
    // (a null payload routes to status only either way). Probing the holder
    // itself would need a test seam in index.ts, outside this phase's
    // footprint. What the served path proves is asserted here: after cleanup
    // the tool serves status only and never the payload or the secret.
    const result = await tool.execute({}, {});
    const status = JSON.parse(String(result.output));
    expect(status).not.toHaveProperty('qr');
    expect(status).not.toHaveProperty('oneTimeSecret');
  });

  it('preserves the tool name and description exactly', async () => {
    const { cleanup, tool } = await setupPlugin();
    expect(tool.name).toBe('coderelay_pair');
    expect(tool.description).toBe(
      'Show CodeRelay pairing status. On the first call while a pairing is waiting, returns the full pairing payload and a terminal QR string; later calls return status only and never the raw one-time secret.',
    );
    await cleanup();
  });

  it('returns the payload with a terminal QR on the first call and status only afterwards', async () => {
    const { cleanup, tool } = await setupPlugin();
    const first = await tool.execute({}, {});
    expect(first.metadata).toEqual({ title: 'CodeRelay pairing' });
    const payloadResult = JSON.parse(String(first.output));
    // Byte-identity pin: the exact payload key set and order (JSON.stringify
    // insertion order, pairing.ts:124-131) with `qr` appended last. Dropping,
    // adding or reordering a key — or writing `title` into `output` — fails.
    expect(Object.keys(payloadResult)).toEqual([
      'version',
      'endpoints',
      'pairingId',
      'oneTimeSecret',
      'hostPublicKey',
      'expiresAt',
      'qr',
    ]);
    expect(payloadResult).not.toHaveProperty('title');
    expect(payloadResult.version).toBe(PROTOCOL_VERSION);
    expect(payloadResult.endpoints).toEqual([createEndpointRecord().url]);
    expect(payloadResult.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(payloadResult.expiresAt).toBe(new Date(payloadResult.expiresAt).toISOString());
    expect(payloadResult.hostPublicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(typeof payloadResult.qr).toBe('string');
    expect(payloadResult.qr.length).toBeGreaterThan(0);
    expect(typeof payloadResult.oneTimeSecret).toBe('string');
    expect(typeof payloadResult.pairingId).toBe('string');
    // The QR is exactly the terminal, small rendering of the payload JSON.
    const { qr: servedQr, ...payloadFields } = payloadResult;
    const expectedQr = await qrToString(JSON.stringify(payloadFields), {
      type: 'terminal',
      small: true,
    });
    expect(servedQr).toBe(expectedQr);

    const second = await tool.execute({}, {});
    expect(second.metadata).toEqual({ title: 'CodeRelay pairing' });
    const statusResult = JSON.parse(String(second.output));
    // The status branch keeps its exact key set and order the same way.
    expect(Object.keys(statusResult)).toEqual([
      'state',
      'pairingId',
      'expiresAt',
      'expiresInSeconds',
      'deviceCredentialId',
    ]);
    expect(statusResult).not.toHaveProperty('title');
    expect(statusResult.state).toBe('waiting');
    expect(statusResult).not.toHaveProperty('qr');
    expect(statusResult).not.toHaveProperty('oneTimeSecret');
    await cleanup();
  });

  it('never re-serves a taken one-time secret while the pairing waits', async () => {
    const { cleanup, tool } = await setupPlugin();
    const first = JSON.parse(String((await tool.execute({}, {})).output));
    expect(typeof first.oneTimeSecret).toBe('string');
    const later = [
      JSON.parse(String((await tool.execute({}, {})).output)),
      JSON.parse(String((await tool.execute({}, {})).output)),
    ];
    for (const status of later) {
      expect(status.state).toBe('waiting');
      expect(status).not.toHaveProperty('oneTimeSecret');
      expect(status).not.toHaveProperty('qr');
    }
    await cleanup();
  });

  it('routes child-session events by the routed root directory and never stores or publishes the child directory', async () => {
    mocks.host.project.list.mockResolvedValue([
      createProjectRecord({ id: 'proj-alpha', canonical: 'C:\\host\\root' }),
    ]);
    mocks.host.session.list.mockResolvedValue(
      createSessionListResponse([
        createSessionRecord({ id: 'ses-root', projectID: 'proj-alpha', title: 'Root' }),
        createSessionRecord({
          id: 'ses-child',
          parentID: 'ses-root',
          projectID: 'proj-alpha',
          time: { created: 2, updated: 200 },
          location: { directory: 'C:\\host\\child-private' },
        }),
      ]),
    );
    const { cleanup, feed, tool, gateway, catalog } = await setupPlugin();
    expect(tool.name).toBe('coderelay_pair');
    const listed = await catalog.list();
    // The port binds the catalog's worktree query to the V2 directory filter.
    expect(mocks.host.session.list).toHaveBeenCalledWith({ directory: 'C:\\host\\root' });
    // The child routes by its routed root's directory; its own directory is
    // never stored in the catalog and never published on its surface.
    expect(catalog.lookup('ses-root')).toBe('C:\\host\\root');
    expect(catalog.lookup('ses-child')).toBeNull();
    expect(catalog.lookupChildRootDirectory('ses-child')).toBe('C:\\host\\root');
    expect(JSON.stringify(listed)).not.toContain('child-private');

    feed.push(createSessionStatusEvent({ sessionID: 'ses-child' }));
    feed.push(createSessionStatusEvent({ sessionID: 'ses-unknown', status: undefined }));
    feed.push(createSessionStatusEvent({ sessionID: 'ses-root' }));
    feed.end();
    await vi.waitFor(() => expect(gateway.handleEvent).toHaveBeenCalledTimes(2));
    expect(gateway.handleEvent).toHaveBeenCalledWith({
      type: 'session.status',
      properties: { sessionID: 'ses-child', status: { type: 'running' } },
    });
    expect(gateway.handleEvent).toHaveBeenCalledWith({
      type: 'session.status',
      properties: { sessionID: 'ses-root', status: { type: 'running' } },
    });
    await cleanup();
  });
});
