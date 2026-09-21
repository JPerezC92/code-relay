import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@coderelay/protocol';
import type { PairingPayload } from '@coderelay/protocol';
import { toBase64 } from './crypto';
import type { Endpoint } from './endpoints';
import type { PairingState } from './pairing';
import {
  PAIRING_COMMAND_CATEGORY,
  PAIRING_COMMAND_NAME,
  PAIRING_COMMAND_TITLE,
  PAIRING_DIALOG_MIN_TERMINAL_WIDTH,
  PAIRING_QR_MAX_WIDTH_COLUMNS,
  PAIRING_RENEW_PATH,
  PAIRING_ROUTE_NAME,
  QR_DARK_MODULE_GLYPH,
  QR_QUIET_ZONE_MODULES,
  createPairingView,
  createPairingViewState,
  fetchPairingPayload,
  pairingPayloadJson,
  renderPairingDialogText,
  renderPairingQrRows,
  renderQrMatrixRows,
  renderQrRows,
  startPairingPayloadPolling,
  startPairingTui,
} from './tui';
import type {
  PairingCommandLayer,
  PairingFetchLike,
  PairingPayloadFetchResult,
  PairingPollTimer,
  PairingTuiHost,
  PairingViewStatus,
  QrModuleMatrix,
} from './tui';

const ENDPOINTS: Endpoint[] = [{ kind: 'lan', url: 'http://192.168.1.20:47821' }];

const NOW_ISO = '2026-09-19T00:00:00.000Z';

function createPayload(overrides: Partial<PairingPayload> = {}): PairingPayload {
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

function createClock(startIso: string): {
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
function createIntervalHarness(): {
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

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

interface FakeHost {
  host: PairingTuiHost;
  layers: PairingCommandLayer[];
  routes: string[];
  routeRenders: Array<() => string>;
  dialogRenders: Array<() => string>;
  dialogClose: Array<(() => void) | undefined>;
  navigations: string[];
  disposeHooks: Array<() => void>;
}

/** Fake `PairingTuiHost` recording operations into a shared order log. */
function createFakeHost(width: number, calls: string[]): FakeHost {
  const layers: PairingCommandLayer[] = [];
  const routes: string[] = [];
  const routeRenders: Array<() => string> = [];
  const dialogRenders: Array<() => string> = [];
  const dialogClose: Array<(() => void) | undefined> = [];
  const navigations: string[] = [];
  const disposeHooks: Array<() => void> = [];
  let terminalWidth = width;
  const host: PairingTuiHost = {
    registerLayer: (layer) => {
      layers.push(layer);
      return () => {};
    },
    registerRoute: (name, render) => {
      routes.push(name);
      routeRenders.push(render);
    },
    dialogReplace: (render, onClose) => {
      calls.push('dialog.replace');
      dialogRenders.push(render);
      dialogClose.push(onClose);
    },
    dialogSetSize: (size) => {
      calls.push(`dialog.setSize:${size}`);
    },
    navigate: (name) => {
      calls.push(`navigate:${name}`);
      navigations.push(name);
    },
    terminalWidth: () => terminalWidth,
    onDispose: (fn) => {
      disposeHooks.push(fn);
    },
  };
  return {
    host,
    layers,
    routes,
    routeRenders,
    dialogRenders,
    dialogClose,
    navigations,
    disposeHooks,
  };
}

/** Fake loopback fetch for the renew route; records into the shared order log. */
function createRenewFetch(payload: PairingPayload | null, calls: string[]): PairingFetchLike {
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
function createFetchPayload(initial: PairingPayloadFetchResult[]): {
  fetchPayload: (url: string) => Promise<PairingPayloadFetchResult>;
  enqueue: (result: PairingPayloadFetchResult) => void;
} {
  const queue = [...initial];
  return {
    fetchPayload: async () => {
      const next = queue.shift();
      return next ?? { kind: 'unavailable' };
    },
    enqueue: (result) => queue.push(result),
  };
}

describe('QR row rendering', () => {
  it.each([
    { upper: 0, lower: 0, glyph: ' ', name: 'light over light' },
    { upper: 1, lower: 0, glyph: '▀', name: 'dark over light' },
    { upper: 0, lower: 1, glyph: '▄', name: 'light over dark' },
    { upper: 1, lower: 1, glyph: '█', name: 'dark over dark' },
  ])('packs $name and preserves the 4-module quiet zone', ({ upper, lower, glyph }) => {
    const matrix: QrModuleMatrix = {
      size: 2,
      get: (row, column) => (column === 0 ? (row === 0 ? upper : lower) : 0),
    };
    const rows = renderQrMatrixRows(matrix);

    expect(QR_QUIET_ZONE_MODULES).toBe(4);
    expect(rows).toEqual(['          ', '          ', `    ${glyph}     `, '          ', '          ']);
    for (const row of rows) expect(row).toHaveLength(10);
  });

  it('pins the maximum QR and dialog width constants', () => {
    expect(PAIRING_QR_MAX_WIDTH_COLUMNS).toBe(77);
    expect(PAIRING_DIALOG_MIN_TERMINAL_WIDTH).toBe(79);
  });

  it('renders the real payload QR within the maximum width without ANSI', () => {
    const rows = renderQrRows(pairingPayloadJson(createPayload()));
    const width = rows[0]?.length ?? 0;
    expect(width).toBeLessThanOrEqual(PAIRING_QR_MAX_WIDTH_COLUMNS);
    expect(rows).toHaveLength(Math.ceil(width / 2));
    for (const row of rows) {
      expect(row).toHaveLength(width);
      expect(row).toMatch(/^[ ▀▄█]*$/);
    }
    expect(rows.join('\n')).not.toMatch(/\x1b/);
    expect(rows.some((row) => row.includes(QR_DARK_MODULE_GLYPH))).toBe(true);
  });
});

describe('renderPairingDialogText', () => {
  it('shows status, endpoint, countdown, and QR rows once the payload arrives', () => {
    const state = createPairingViewState(ENDPOINTS, NOW_ISO);
    const payload = createPayload();
    const withPayload = {
      ...state,
      payload,
      qr: renderPairingQrRows(payload),
    };
    const text = renderPairingDialogText(withPayload, new Date(NOW_ISO));
    expect(text).toContain(PAIRING_COMMAND_TITLE);
    expect(text).toContain('status: waiting');
    expect(text).toContain(`endpoint: ${ENDPOINTS[0]?.url}`);
    expect(text).toContain('expiresInSeconds: 120');
    expect(text).toContain(QR_DARK_MODULE_GLYPH);
    expect(text).not.toMatch(/\x1b/);
    expect(renderPairingDialogText(withPayload, new Date('2026-09-19T00:00:05.000Z'))).toContain(
      'expiresInSeconds: 115',
    );
  });

  it('falls back to a waiting line without payload or QR', () => {
    const text = renderPairingDialogText(createPairingViewState(ENDPOINTS, NOW_ISO), new Date(NOW_ISO));
    expect(text).toContain('waiting for pairing payload…');
    expect(text).not.toContain(QR_DARK_MODULE_GLYPH);
  });
});

describe('fetchPairingPayload', () => {
  it('returns the payload for a 200 response with a valid body', async () => {
    // The injected clock keeps the parse-path expiry check deterministic.
    const payload = createPayload();
    const fetchImpl: PairingFetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ payload }),
    });
    expect(
      await fetchPairingPayload('http://127.0.0.1:47821/pairing-payload', fetchImpl, () => new Date(NOW_ISO)),
    ).toEqual({ kind: 'payload', payload });
  });

  it('maps a 409 with a pairing state to not-waiting and a stateless 409 to unavailable', async () => {
    const fetchImpl: PairingFetchLike = async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'pairing-not-waiting', state: 'paired' }),
    });
    expect(await fetchPairingPayload('http://127.0.0.1:47821/pairing-payload', fetchImpl)).toEqual({
      kind: 'not-waiting',
      state: 'paired',
    });

    // The pre-phase-09 body shape: without a parsable state the 409 cannot
    // resolve the modal, so it degrades to a retriable unavailable.
    const stateless: PairingFetchLike = async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'pairing-not-waiting' }),
    });
    expect(
      await fetchPairingPayload('http://127.0.0.1:47821/pairing-payload', stateless),
    ).toEqual({ kind: 'unavailable' });
  });

  it('maps network failures, malformed bodies, and expired payloads to unavailable', async () => {
    const failing: PairingFetchLike = async () => {
      throw new Error('connection refused');
    };
    expect(await fetchPairingPayload('http://127.0.0.1:47821/pairing-payload', failing)).toEqual({
      kind: 'unavailable',
    });

    const malformed: PairingFetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => 'not-an-object',
    });
    expect(await fetchPairingPayload('http://127.0.0.1:47821/pairing-payload', malformed)).toEqual({
      kind: 'unavailable',
    });

    const expired = createPayload({ expiresAt: '2020-01-01T00:00:00.000Z' });
    const expiredFetch: PairingFetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ payload: expired }),
    });
    expect(
      await fetchPairingPayload(
        'http://127.0.0.1:47821/pairing-payload',
        expiredFetch,
        () => new Date(NOW_ISO),
      ),
    ).toEqual({ kind: 'unavailable' });
  });
});

describe('startPairingPayloadPolling', () => {
  it('stores the payload and a block-glyph QR and keeps polling', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const payload = createPayload();
    const poll = createFetchPayload([{ kind: 'payload', payload }]);
    const stop = startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    expect(view.state().payload).toEqual(payload);
    expect(view.state().qr).not.toBeNull();
    expect(view.state().qr ?? '').toContain(QR_DARK_MODULE_GLYPH);
    expect(view.state().qr ?? '').not.toMatch(/\x1b/);
    expect(harness.isStopped()).toBe(false);
    stop();
    expect(harness.isStopped()).toBe(true);
  });

  it('clears the payload and QR when the countdown reaches zero, then stops', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const payload = createPayload({ expiresAt: '2026-09-19T00:00:10.000Z' });
    const poll = createFetchPayload([{ kind: 'payload', payload }]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    expect(view.state().payload).not.toBeNull();

    clock.advance(11_000);
    harness.tick();
    await flush();

    expect(view.state().payload).toBeNull();
    expect(view.state().qr).toBeNull();
    expect(harness.isStopped()).toBe(true);
  });

  it('clears the payload and QR and stops when the route answers 409', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const poll = createFetchPayload([
      { kind: 'payload', payload: createPayload() },
      { kind: 'not-waiting', state: 'paired' },
    ]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    expect(view.state().payload).not.toBeNull();

    harness.tick();
    await flush();

    expect(view.state().payload).toBeNull();
    expect(view.state().qr).toBeNull();
    expect(harness.isStopped()).toBe(true);
  });

  interface PollResolutionCase {
    state: PairingState;
    status: PairingViewStatus;
    hint: string;
  }

  const pollResolutionCases: PollResolutionCase[] = [
    { state: 'paired', status: 'connected', hint: 'device connected' },
    { state: 'revoked', status: 'revoked', hint: 'device revoked' },
    { state: 'expired', status: 'expired', hint: 'pairing expired — renew available' },
    { state: 'idle', status: 'idle', hint: 'no pairing in progress' },
  ];

  it.each(pollResolutionCases)(
    'resolves the dialog to $status when a 409 carries state $state',
    async ({ state, status, hint }) => {
      const clock = createClock(NOW_ISO);
      const harness = createIntervalHarness();
      const view = createPairingView(ENDPOINTS, NOW_ISO);
      const poll = createFetchPayload([
        { kind: 'payload', payload: createPayload() },
        { kind: 'not-waiting', state },
      ]);
      startPairingPayloadPolling(view, {
        fetchPayload: poll.fetchPayload,
        now: clock.now,
        setTimer: harness.setTimer,
        clearTimer: harness.clearTimer,
      });

      await flush();
      expect(view.state().payload).not.toBeNull();

      harness.tick();
      await flush();

      expect(view.state().status).toBe(status);
      expect(view.state().payload).toBeNull();
      expect(view.state().qr).toBeNull();
      expect(harness.isStopped()).toBe(true);
      const text = renderPairingDialogText(view.state(), clock.now());
      expect(text).toContain(`status: ${status}`);
      expect(text).toContain(hint);
      expect(text).not.toContain('waiting for pairing payload…');
    },
  );

  it('keeps polling with the QR when a 409 state races back to waiting', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const payload = createPayload();
    const poll = createFetchPayload([
      { kind: 'payload', payload },
      { kind: 'not-waiting', state: 'waiting' },
    ]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    expect(view.state().payload).not.toBeNull();

    harness.tick();
    await flush();

    expect(view.state().status).toBe('waiting');
    expect(view.state().payload).toEqual(payload);
    expect(view.state().qr).not.toBeNull();
    expect(harness.isStopped()).toBe(false);
    const text = renderPairingDialogText(view.state(), clock.now());
    expect(text).toContain('status: waiting');
    expect(text).toContain(QR_DARK_MODULE_GLYPH);
    expect(text).not.toContain('waiting for pairing payload…');
  });

  it('refreshes the stored QR when a renewal delivers a new pairing id', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const first = createPayload({ pairingId: 'pairing-1' });
    const renewed = createPayload({ pairingId: 'pairing-2' });
    const poll = createFetchPayload([
      { kind: 'payload', payload: first },
      { kind: 'payload', payload: renewed },
    ]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    expect(view.state().payload?.pairingId).toBe('pairing-1');

    harness.tick();
    await flush();

    expect(view.state().payload?.pairingId).toBe('pairing-2');
    expect(view.state().qr).toBe(renderPairingQrRows(renewed));
  });

  it('stops after the bounded attempt count', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const poll = createFetchPayload([]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      maxAttempts: 1,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    // The immediate first poll consumed the single attempt; the next tick stops.
    harness.tick();
    await flush();
    expect(harness.isStopped()).toBe(true);
    expect(view.state().payload).toBeNull();
  });

  it('clears an expired QR before stopping at the attempt cap', async () => {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const view = createPairingView(ENDPOINTS, NOW_ISO);
    const payload = createPayload({ expiresAt: '2026-09-19T00:00:10.000Z' });
    const poll = createFetchPayload([{ kind: 'payload', payload }]);
    startPairingPayloadPolling(view, {
      fetchPayload: poll.fetchPayload,
      now: clock.now,
      maxAttempts: 1,
      setTimer: harness.setTimer,
      clearTimer: harness.clearTimer,
    });

    await flush();
    expect(view.state().payload).toEqual(payload);

    clock.advance(10_000);
    harness.tick();
    await flush();

    expect(view.state().payload).toBeNull();
    expect(view.state().qr).toBeNull();
    expect(harness.isStopped()).toBe(true);
  });
});

describe('startPairingTui', () => {
  async function start(width: number): Promise<{
    fake: FakeHost;
    calls: string[];
    harness: ReturnType<typeof createIntervalHarness>;
    clock: ReturnType<typeof createClock>;
    poll: ReturnType<typeof createFetchPayload>;
    runCommand: () => Promise<void>;
  }> {
    const clock = createClock(NOW_ISO);
    const harness = createIntervalHarness();
    const calls: string[] = [];
    const fake = createFakeHost(width, calls);
    const poll = createFetchPayload([]);
    await startPairingTui(fake.host, {
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
    };
  }

  it('registers the palette command and the pairing route with the required shape', async () => {
    const { fake } = await start(120);

    expect(PAIRING_ROUTE_NAME).toBe('coderelay-pairing');
    expect(fake.routes).toContain('coderelay-pairing');
    const routeRender = fake.routeRenders[0];
    if (routeRender === undefined) throw new Error('expected the pairing route to be registered');
    expect(routeRender()).toContain('CodeRelay pairing');
    const layer = fake.layers[0];
    expect(layer).toBeDefined();
    expect(layer?.bindings).toEqual([]);
    const command = layer?.commands[0];
    expect(command?.namespace).toBe('palette');
    expect(command?.name).toBe(PAIRING_COMMAND_NAME);
    expect(command?.name).toBe('coderelay.pair');
    expect(command?.title).toBe(PAIRING_COMMAND_TITLE);
    expect(command?.title).toBe('CodeRelay: Pair device');
    expect(command?.category).toBe(PAIRING_COMMAND_CATEGORY);
    expect(command?.category).toBe('CodeRelay');
  });

  it('renews, then replaces the dialog, then sets the xlarge size, in that order', async () => {
    const { calls, runCommand } = await start(120);

    await runCommand();

    expect(calls).toEqual([
      `POST http://127.0.0.1:47821${PAIRING_RENEW_PATH}`,
      'dialog.replace',
      'dialog.setSize:xlarge',
    ]);
  });

  it('navigates to the pairing route instead of opening the dialog on narrow terminals', async () => {
    const { calls, fake, runCommand } = await start(PAIRING_DIALOG_MIN_TERMINAL_WIDTH - 1);

    await runCommand();

    expect(calls).toEqual([
      `POST http://127.0.0.1:47821${PAIRING_RENEW_PATH}`,
      `navigate:${PAIRING_ROUTE_NAME}`,
    ]);
    expect(fake.dialogRenders).toHaveLength(0);
  });

  it('renders the live countdown and QR inside the dialog while polling', async () => {
    const { fake, harness, clock, poll, runCommand } = await start(120);

    await runCommand();
    poll.enqueue({ kind: 'payload', payload: createPayload() });
    harness.tick();
    await flush();

    const render = fake.dialogRenders[0];
    if (render === undefined) throw new Error('expected the dialog to be open');
    expect(render()).toContain('expiresInSeconds: 120');
    expect(render()).toContain(QR_DARK_MODULE_GLYPH);

    clock.advance(5_000);
    poll.enqueue({ kind: 'unavailable' });
    harness.tick();
    await flush();
    expect(render()).toContain('expiresInSeconds: 115');
    expect(render()).toContain(QR_DARK_MODULE_GLYPH);
  });

  it('resolves the open dialog to connected when the poll reports a paired 409', async () => {
    const { fake, harness, poll, runCommand } = await start(120);

    await runCommand();
    poll.enqueue({ kind: 'payload', payload: createPayload() });
    harness.tick();
    await flush();
    const render = fake.dialogRenders[0];
    if (render === undefined) throw new Error('expected the dialog to be open');
    expect(render()).toContain(QR_DARK_MODULE_GLYPH);

    poll.enqueue({ kind: 'not-waiting', state: 'paired' });
    harness.tick();
    await flush();

    expect(harness.isStopped()).toBe(true);
    expect(render()).toContain('status: connected');
    expect(render()).toContain('device connected');
    expect(render()).not.toContain('waiting for pairing payload…');
    expect(render()).not.toContain(QR_DARK_MODULE_GLYPH);
  });

  it('dialog close stops polling and clears the payload and QR', async () => {
    const { fake, harness, poll, runCommand } = await start(120);

    await runCommand();
    poll.enqueue({ kind: 'payload', payload: createPayload() });
    harness.tick();
    await flush();
    expect(harness.isStopped()).toBe(false);

    const onClose = fake.dialogClose[0];
    if (onClose === undefined) throw new Error('expected the dialog to register an onClose');
    onClose();

    expect(harness.isStopped()).toBe(true);
    expect(fake.dialogRenders[0]?.()).toContain('waiting for pairing payload…');
  });

  it('lifecycle dispose stops polling and clears the payload and QR', async () => {
    const { fake, harness, poll, runCommand } = await start(120);

    await runCommand();
    poll.enqueue({ kind: 'payload', payload: createPayload() });
    harness.tick();
    await flush();
    expect(harness.isStopped()).toBe(false);

    const dispose = fake.disposeHooks[0];
    if (dispose === undefined) throw new Error('expected a dispose hook to be registered');
    dispose();

    expect(harness.isStopped()).toBe(true);
    expect(fake.dialogRenders[0]?.()).toContain('waiting for pairing payload…');
  });
});
