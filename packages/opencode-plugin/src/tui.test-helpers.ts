import { vi } from 'vitest';
import { PROTOCOL_VERSION } from '@coderelay/protocol';
import type { PairingPayload } from '@coderelay/protocol';
import type { Context as CliPluginContext, KeymapLayer } from '@opencode/plugin/tui/context';
import { toBase64 } from './crypto';
import type { Endpoint } from './endpoints';
import type { PairingState } from './pairing';
import { startPairingTui } from './tui';
import type {
  PairingCommandLayer,
  PairingFetchLike,
  PairingPayloadFetchResult,
  PairingPollTimer,
  PairingTuiHost,
  PairingViewStatus,
} from './tui';

export const ENDPOINTS: Endpoint[] = [{ kind: 'lan', url: 'http://192.168.1.20:47821' }];

export const NOW_ISO = '2026-09-19T00:00:00.000Z';

export function createPayload(overrides: Partial<PairingPayload> = {}): PairingPayload {
  return {
    version: PROTOCOL_VERSION,
    endpoints: [ENDPOINTS[0]?.url ?? 'http://192.168.1.20:47821'],
    pairingId: 'pairing-1',
    oneTimeSecret: toBase64(new Uint8Array(32).fill(7)),
    hostPublicKey: toBase64(new Uint8Array(32).fill(9)),
    expiresAt: '2026-09-19T00:02:00.000Z',
    ...overrides,
  };
}

export function createClock(startIso: string): {
  now: () => Date;
  advance: (milliseconds: number) => void;
} {
  let current = new Date(startIso);
  return {
    now: (): Date => current,
    advance: (milliseconds: number): void => {
      current = new Date(current.getTime() + milliseconds);
    },
  };
}

/**
 * Manual interval harness following the `pairing.test.ts` convention: the
 * returned handle is a fixed token, scheduling is recorded, and tests drive
 * the callback by hand so no platform timer or wall-clock time is needed.
 */
export function createIntervalHarness(): {
  setTimer: (callback: () => void, _intervalMs: number) => PairingPollTimer;
  clearTimer: (handle: PairingPollTimer) => void;
  tick: () => void;
  isStopped: () => boolean;
  timesCleared: () => number;
} {
  const handle: PairingPollTimer = { id: 1 };
  let active: PairingPollTimer | null = null;
  let callback: (() => void) | null = null;
  let cleared = 0;
  return {
    setTimer: (cb, _intervalMs) => {
      callback = cb;
      active = handle;
      return handle;
    },
    clearTimer: (value) => {
      if (active === value) {
        active = null;
        callback = null;
      }
      cleared += 1;
    },
    tick: () => callback?.(),
    isStopped: () => active === null,
    timesCleared: () => cleared,
  };
}

export async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export interface FakeHost {
  host: PairingTuiHost;
  layers: PairingCommandLayer[];
  routes: string[];
  routeRenders: Array<() => string>;
  dialogRenders: Array<() => string>;
  dialogClose: Array<(() => void) | undefined>;
  navigations: string[];
}

/** Fake `PairingTuiHost` recording operations into a shared order log. */
export function createFakeHost(width: number, calls: string[]): FakeHost {
  const layers: PairingCommandLayer[] = [];
  const routes: string[] = [];
  const routeRenders: Array<() => string> = [];
  const dialogRenders: Array<() => string> = [];
  const dialogClose: Array<(() => void) | undefined> = [];
  const navigations: string[] = [];
  let terminalWidth = width;
  const host: PairingTuiHost = {
    registerLayer: (layer) => {
      layers.push(layer);
      return () => {
        calls.push('keymap.layer.unregister');
      };
    },
    registerRoute: (route) => {
      routes.push(route.name);
      routeRenders.push(route.render);
      return () => {
        calls.push('router.unregister');
      };
    },
    dialogShow: (render, onClose) => {
      calls.push('dialog.show');
      dialogRenders.push(render);
      dialogClose.push(onClose);
    },
    dialogClear: () => {
      calls.push('dialog.clear');
    },
    dialogSet: (options) => {
      calls.push(`dialog.set:${options.size}`);
    },
    navigate: (name) => {
      calls.push(`navigate:${name}`);
      navigations.push(name);
    },
    terminalWidth: () => terminalWidth,
  };
  return {
    host,
    layers,
    routes,
    routeRenders,
    dialogRenders,
    dialogClose,
    navigations,
  };
}

/** Fake loopback fetch for the renew route; records into the shared order log. */
export function createRenewFetch(payload: PairingPayload | null, calls: string[]): PairingFetchLike {
  return async (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    return {
      ok: payload !== null,
      status: payload !== null ? 200 : 403,
      json: async () => ({ payload }),
    };
  };
}

/** Scripted poll results; an empty queue answers `unavailable`. */
export function createFetchPayload(initial: PairingPayloadFetchResult[]): {
  fetchPayload: (url: string) => Promise<PairingPayloadFetchResult>;
  enqueue: (result: PairingPayloadFetchResult) => void;
  urls: string[];
} {
  const queue = [...initial];
  const urls: string[] = [];
  return {
    fetchPayload: async (url) => {
      // The URL is recorded so tests can pin the loopback route the poll hits.
      urls.push(url);
      const next = queue.shift();
      return next ?? { kind: 'unavailable' };
    },
    enqueue: (result) => queue.push(result),
    urls,
  };
}

/**
 * Fake V2 `CliPluginContext` capturing the two seams `createTuiHost` releases
 * through: the reactive `keymap.layer` factory (whose `enabled()` the host
 * flips) and the `ui.router.register` unregister handle.
 */
export function createFakeCliPluginContext(): {
  context: CliPluginContext;
  layers: Array<() => KeymapLayer>;
  unregisterRoute: ReturnType<typeof vi.fn>;
} {
  const layers: Array<() => KeymapLayer> = [];
  const unregisterRoute = vi.fn(() => undefined);
  const context = {
    keymap: {
      layer: vi.fn((factory: () => KeymapLayer): void => {
        layers.push(factory);
      }),
    },
    ui: {
      router: {
        register: vi.fn(() => unregisterRoute),
        navigate: vi.fn(),
      },
      dialog: {
        show: vi.fn(),
        set: vi.fn(),
        clear: vi.fn(),
      },
    },
    renderer: { terminalWidth: 120 },
  };
  return { context: context as unknown as CliPluginContext, layers, unregisterRoute };
}

export async function startPairingTuiHarness(width: number): Promise<{
  fake: FakeHost;
  calls: string[];
  harness: ReturnType<typeof createIntervalHarness>;
  clock: ReturnType<typeof createClock>;
  poll: ReturnType<typeof createFetchPayload>;
  runCommand: () => Promise<void>;
  cleanup: () => void;
}> {
  const clock = createClock(NOW_ISO);
  const harness = createIntervalHarness();
  const calls: string[] = [];
  const fake = createFakeHost(width, calls);
  const poll = createFetchPayload([]);
  const cleanup = await startPairingTui(fake.host, {
    detectEndpoints: async () => ENDPOINTS,
    now: clock.now,
    setTimer: harness.setTimer,
    clearTimer: harness.clearTimer,
    fetchImpl: createRenewFetch(createPayload(), calls),
    fetchPayload: poll.fetchPayload,
  });
  const command = fake.layers[0]?.commands[0];
  if (command === undefined) throw new Error('expected the palette command to be registered');
  return {
    fake,
    calls,
    harness,
    clock,
    poll,
    runCommand: () => Promise.resolve(command.run()),
    cleanup,
  };
}

export interface PollResolutionCase {
  state: PairingState;
  status: PairingViewStatus;
  hint: string;
}

export const pollResolutionCases: PollResolutionCase[] = [
  { state: 'paired', status: 'connected', hint: 'device connected' },
  { state: 'revoked', status: 'revoked', hint: 'device revoked' },
  { state: 'expired', status: 'expired', hint: 'pairing expired — renew available' },
  { state: 'idle', status: 'idle', hint: 'no pairing in progress' },
];
