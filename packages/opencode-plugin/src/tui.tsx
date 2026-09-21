/**
 * CodeRelay TUI plugin. Registers the `coderelay-pairing` route and the
 * `CodeRelay: Pair device` palette command, and renders the pairing QR inside
 * an xlarge dialog as compact half-block text — never the ANSI QR string.
 */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from '@opencode-ai/plugin/tui';
import { jsx, type JSX } from '@opentui/solid/jsx-runtime';
import { create as createQrCode } from 'qrcode';
import { createSignal } from 'solid-js';
import { PairingError, parsePairingPayload } from '@coderelay/protocol';
import type { PairingPayload } from '@coderelay/protocol';
import { DEFAULT_GATEWAY_PORT, detectEndpoints, validateEndpoint } from './endpoints';
import type { Endpoint } from './endpoints';
import { PAIRING_TTL_SECONDS } from './pairing';
import type { PairingState } from './pairing';

export const PAIRING_ROUTE_NAME = 'coderelay-pairing';
export const PAIRING_PAYLOAD_PATH = '/pairing-payload';
export const PAIRING_RENEW_PATH = '/pairing-renew';
/** Short poll interval so the QR appears as soon as the gateway publishes it. */
export const PAIRING_PAYLOAD_POLL_INTERVAL_MS = 1000;
/** Bound on polls: roughly the pairing TTL, after which the interval is cleared. */
export const PAIRING_PAYLOAD_POLL_MAX_ATTEMPTS = 120;

/** Palette command entry that opens the pairing dialog. */
export const PAIRING_COMMAND_NAME = 'coderelay.pair';
export const PAIRING_COMMAND_TITLE = 'CodeRelay: Pair device';
export const PAIRING_COMMAND_CATEGORY = 'CodeRelay';

/** Quiet zone around the QR matrix, in module columns, per side. */
export const QR_QUIET_ZONE_MODULES = 4;
/** Glyph for a pair of dark QR modules. */
export const QR_DARK_MODULE_GLYPH = '█';
export const QR_LIGHT_MODULE_GLYPH = ' ';
export const QR_UPPER_DARK_LOWER_LIGHT_GLYPH = '▀';
export const QR_UPPER_LIGHT_LOWER_DARK_GLYPH = '▄';
/** Widest QR matrix the current pairing payload is expected to produce. */
export const PAIRING_QR_MAX_MODULES_PER_SIDE = 69;
export const PAIRING_QR_MAX_WIDTH_COLUMNS =
  PAIRING_QR_MAX_MODULES_PER_SIDE + QR_QUIET_ZONE_MODULES * 2;
/**
 * The xlarge dialog is capped at `terminal width - 2`, so a terminal narrower
 * than this cannot fit the QR plus its quiet zone and falls back to the
 * full-screen route.
 */
export const PAIRING_DIALOG_MIN_TERMINAL_WIDTH = PAIRING_QR_MAX_WIDTH_COLUMNS + 2;

export type PairingViewStatus = 'waiting' | 'connected' | 'revoked' | 'expired' | 'idle';

export interface PairingViewState {
  endpoints: Endpoint[];
  selectedUrl: string | null;
  customUrl: string;
  expiresAt: string;
  /** Pairing resolution driving both renders; terminal values arrive from the poll. */
  status: PairingViewStatus;
  /** Live payload read from the gateway's loopback route, or null until then. */
  payload: PairingPayload | null;
  /** Compact half-block QR rows rendered from `payload`, or null until it arrives. */
  qr: string | null;
}

export function createPairingViewState(
  endpoints: Endpoint[],
  expiresAt: string,
): PairingViewState {
  return {
    endpoints,
    selectedUrl: endpoints[0]?.url ?? null,
    customUrl: '',
    expiresAt,
    status: 'waiting',
    payload: null,
    qr: null,
  };
}

export function selectEndpoint(
  state: PairingViewState,
  url: string,
): PairingViewState | Error {
  const validated = validateEndpoint('custom', url);
  if (validated instanceof Error) return validated;
  return { ...state, selectedUrl: validated.url, customUrl: url };
}

/**
 * Reactive pairing view controller. The status lives in a Solid signal so the
 * route and dialog renders re-read the current value instead of the immutable
 * snapshot they were constructed with. `renderPairingView` and
 * `renderPairingDialogText` stay pure functions of state.
 */
export interface PairingView {
  readonly state: () => PairingViewState;
  /** Poll-driven clock tick (ms epoch); the dialog countdown re-renders from it. */
  readonly tick: () => number;
  readonly setPairingStatus: (status: PairingViewStatus) => void;
  readonly setPairingTick: (now: Date) => void;
  /** Stores a live payload; the gateway only serves one while a pairing waits, so the status returns to `waiting`. */
  readonly setPairingPayload: (payload: PairingPayload, qr: string) => void;
  readonly clearPairingPayload: () => void;
  readonly render: (now: Date) => string;
}

export function createPairingView(endpoints: Endpoint[], expiresAt: string): PairingView {
  const [state, setState] = createSignal<PairingViewState>(
    createPairingViewState(endpoints, expiresAt),
  );
  const [tick, setTick] = createSignal(Date.now());
  return {
    state,
    tick,
    setPairingStatus: (status) => setState((previous) => ({ ...previous, status })),
    setPairingTick: (now) => setTick(now.getTime()),
    setPairingPayload: (payload, qr) =>
      setState((previous) => ({ ...previous, status: 'waiting', payload, qr })),
    clearPairingPayload: () =>
      setState((previous) => ({ ...previous, payload: null, qr: null })),
    render: (now) => renderPairingView(state(), now),
  };
}

export function secondsUntil(expiresAt: string, now: Date): number {
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return 0;
  return Math.max(0, Math.ceil((expires - now.getTime()) / 1000));
}

export function pairingPayloadJson(payload: PairingPayload): string {
  return JSON.stringify(payload);
}

/** Structural view of `qrcode`'s module matrix so tests can feed a fixed one. */
export interface QrModuleMatrix {
  readonly size: number;
  get(row: number, column: number): number;
}

/**
 * Renders a QR module matrix with a quiet zone of blank modules on every side,
 * packing two logical module rows into each terminal row. The rows carry no
 * ANSI escape sequences.
 */
export function renderQrMatrixRows(
  matrix: QrModuleMatrix,
  quietZoneModules: number = QR_QUIET_ZONE_MODULES,
): string[] {
  const width = matrix.size + quietZoneModules * 2;
  const lightRow = Array<boolean>(width).fill(false);
  const logicalRows: boolean[][] = [];
  for (let edge = 0; edge < quietZoneModules; edge += 1) {
    logicalRows.push([...lightRow]);
  }
  for (let row = 0; row < matrix.size; row += 1) {
    const logicalRow = Array<boolean>(quietZoneModules).fill(false);
    for (let column = 0; column < matrix.size; column += 1) {
      logicalRow.push(matrix.get(row, column) !== 0);
    }
    logicalRow.push(...Array<boolean>(quietZoneModules).fill(false));
    logicalRows.push(logicalRow);
  }
  for (let edge = 0; edge < quietZoneModules; edge += 1) {
    logicalRows.push([...lightRow]);
  }

  const terminalRows: string[] = [];
  for (let row = 0; row < logicalRows.length; row += 2) {
    const upper = logicalRows[row] ?? lightRow;
    const lower = logicalRows[row + 1] ?? lightRow;
    let terminalRow = '';
    for (let column = 0; column < width; column += 1) {
      const upperDark = upper[column] ?? false;
      const lowerDark = lower[column] ?? false;
      if (upperDark && lowerDark) {
        terminalRow += QR_DARK_MODULE_GLYPH;
      } else if (upperDark) {
        terminalRow += QR_UPPER_DARK_LOWER_LIGHT_GLYPH;
      } else if (lowerDark) {
        terminalRow += QR_UPPER_LIGHT_LOWER_DARK_GLYPH;
      } else {
        terminalRow += QR_LIGHT_MODULE_GLYPH;
      }
    }
    terminalRows.push(terminalRow);
  }
  return terminalRows;
}

/** Renders the QR rows for a payload's JSON encoding. */
export function renderQrRows(
  json: string,
  quietZoneModules: number = QR_QUIET_ZONE_MODULES,
): string[] {
  return renderQrMatrixRows(createQrCode(json).modules, quietZoneModules);
}

/** Compact half-block QR for a pairing payload as one newline-joined string. */
export function renderPairingQrRows(payload: PairingPayload): string {
  return renderQrRows(pairingPayloadJson(payload)).join('\n');
}

/**
 * Full-screen route view: status, endpoints, countdown, and the compact QR
 * once the loopback payload fetch has succeeded. This pure formatter returns
 * text, not a valid root OpenTUI JSX element.
 */
export function renderPairingView(state: PairingViewState, now: Date): string {
  const expiresAt = state.payload?.expiresAt ?? state.expiresAt;
  const lines = [
    'CodeRelay pairing',
    `status: ${state.status}`,
    `expiresAt: ${expiresAt}`,
    `expiresInSeconds: ${secondsUntil(expiresAt, now)}`,
  ];
  for (const endpoint of state.endpoints) lines.push(`- ${endpoint.kind}: ${endpoint.url}`);
  if (state.qr !== null) lines.push(state.qr);
  if (state.selectedUrl !== null) lines.push(`selected: ${state.selectedUrl}`);
  if (state.customUrl.length > 0) lines.push(`custom: ${state.customUrl}`);
  return lines.join('\n');
}

/**
 * Dialog hint line shown while no live payload is displayed, keyed by status.
 * Terminal states get an explicit non-waiting treatment instead of the
 * waiting-for-payload line.
 */
export function pairingStatusHint(status: PairingViewStatus): string {
  switch (status) {
    case 'waiting':
      return 'waiting for pairing payload…';
    case 'connected':
      return 'device connected';
    case 'revoked':
      return 'device revoked';
    case 'expired':
      return 'pairing expired — renew available';
    case 'idle':
      return 'no pairing in progress';
  }
}

/**
 * Dialog body: title, status, selected endpoint, the live countdown from the
 * payload's `expiresAt`, and the compact QR rows. This pure formatter returns
 * text, not a valid root OpenTUI JSX element.
 */
export function renderPairingDialogText(state: PairingViewState, now: Date): string {
  const lines = [PAIRING_COMMAND_TITLE, `status: ${state.status}`];
  lines.push(state.selectedUrl === null ? 'endpoint: none' : `endpoint: ${state.selectedUrl}`);
  if (state.payload === null) {
    lines.push(pairingStatusHint(state.status));
  } else {
    lines.push(`expiresInSeconds: ${secondsUntil(state.payload.expiresAt, now)}`);
    if (state.qr !== null) {
      lines.push('');
      lines.push(state.qr);
    }
  }
  return lines.join('\n');
}

/** Wraps formatter output in the root OpenTUI text element required by TUI callbacks. */
export function renderPairingText(text: string): JSX.Element {
  return jsx('text', { wrapMode: 'none', children: text });
}

export function pairingPayloadUrl(port: number = DEFAULT_GATEWAY_PORT): string {
  return `http://127.0.0.1:${port}${PAIRING_PAYLOAD_PATH}`;
}

export function pairingRenewUrl(port: number = DEFAULT_GATEWAY_PORT): string {
  return `http://127.0.0.1:${port}${PAIRING_RENEW_PATH}`;
}

/** Narrow fetch port so tests can inject responses without casting fakes. */
export type PairingFetchLike = (
  url: string,
  init?: { method?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const defaultPairingFetch: PairingFetchLike = (url, init) => fetch(url, init);

export type PairingPayloadFetchResult =
  | { kind: 'payload'; payload: PairingPayload }
  /**
   * The gateway answered 409: no pairing is waiting. `state` is the pairing
   * manager state parsed from the 409 body — `waiting` can only appear when
   * the gateway races a fresh pairing into place between its payload read
   * and the 409 write.
   */
  | { kind: 'not-waiting'; state: PairingState }
  /** Any other non-OK response, schema failure, or network error. */
  | { kind: 'unavailable' };

/** Narrows the `state` field of a payload-route 409 body to the manager states. */
function isPairingState(value: unknown): value is PairingState {
  return (
    value === 'idle' ||
    value === 'waiting' ||
    value === 'paired' ||
    value === 'expired' ||
    value === 'revoked'
  );
}

/**
 * Reads the live pairing payload from the gateway's loopback-only route. The
 * 409 case is kept distinct from transient failures and carries the pairing
 * manager state parsed from the 409 body, so the caller can resolve its modal
 * instead of waiting forever. A 409 body without a parsable state is treated
 * as a schema failure: like `unavailable`, it leaves the current QR in place
 * and lets the bounded poll retry.
 */
export async function fetchPairingPayload(
  url: string,
  fetchImpl: PairingFetchLike = defaultPairingFetch,
  now: () => Date = () => new Date(),
): Promise<PairingPayloadFetchResult> {
  try {
    const response = await fetchImpl(url);
    if (response.status === 409) {
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null || !('state' in body)) {
        return { kind: 'unavailable' };
      }
      if (!isPairingState(body.state)) return { kind: 'unavailable' };
      return { kind: 'not-waiting', state: body.state };
    }
    if (!response.ok) return { kind: 'unavailable' };
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return { kind: 'unavailable' };
    const payload = (body as { payload?: unknown }).payload;
    if (typeof payload !== 'object' || payload === null) return { kind: 'unavailable' };
    const parsed = parsePairingPayload(JSON.stringify(payload), { now: now() });
    return parsed instanceof PairingError
      ? { kind: 'unavailable' }
      : { kind: 'payload', payload: parsed };
  } catch {
    return { kind: 'unavailable' };
  }
}

export interface PairingRenewOptions {
  port?: number;
  fetchImpl?: PairingFetchLike;
  now?: () => Date;
}

/**
 * Asks the gateway's loopback-only renew route for a current or fresh pairing
 * payload. Any non-OK response, schema failure, or network error yields null
 * so the caller can fall back to the current view state.
 */
export async function renewPairingPayload(
  options: PairingRenewOptions = {},
): Promise<PairingPayload | null> {
  const fetchImpl = options.fetchImpl ?? defaultPairingFetch;
  const now = options.now ?? (() => new Date());
  try {
    const response = await fetchImpl(pairingRenewUrl(options.port), { method: 'POST' });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    const payload = (body as { payload?: unknown }).payload;
    if (typeof payload !== 'object' || payload === null) return null;
    const parsed = parsePairingPayload(JSON.stringify(payload), { now: now() });
    return parsed instanceof PairingError ? null : parsed;
  } catch {
    return null;
  }
}

/** Opaque timer token that keeps platform interval handles out of callers. */
export interface PairingPollTimer {
  readonly id: number;
}

export interface PairingPayloadPollOptions {
  port?: number;
  intervalMs?: number;
  maxAttempts?: number;
  fetchPayload?: (url: string) => Promise<PairingPayloadFetchResult>;
  now?: () => Date;
  setTimer?: (callback: () => void, intervalMs: number) => PairingPollTimer;
  clearTimer?: (handle: PairingPollTimer) => void;
}

/**
 * Polls the loopback pairing routes while a pairing is active. Each tick
 * drives the dialog's live countdown; a payload (including a renewed one with
 * a new pairing id) refreshes the stored QR and returns the status to
 * `waiting`, a countdown that reached zero clears the payload and QR and
 * stops the poll, and the attempt counter caps the total number of tries so
 * no interval can run unbounded. A 409 resolves the modal through its carried
 * state instead of waiting forever: `paired` shows connected, `revoked`,
 * `expired`, and `idle` their explicit statuses — each clears the payload and
 * QR and stops the poll — while a 409 whose state raced back to `waiting`
 * keeps the waiting display and continues polling. The returned function
 * cancels polling and is wired to dialog close and `api.lifecycle.onDispose`.
 */
export function startPairingPayloadPolling(
  view: PairingView,
  options: PairingPayloadPollOptions = {},
): () => void {
  const url = pairingPayloadUrl(options.port);
  const intervalMs = options.intervalMs ?? PAIRING_PAYLOAD_POLL_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? PAIRING_PAYLOAD_POLL_MAX_ATTEMPTS;
  const fetchPayload =
    options.fetchPayload ?? ((u: string) => fetchPairingPayload(u, defaultPairingFetch, now));
  const now = options.now ?? (() => new Date());
  const platformTimers = new Map<number, ReturnType<typeof setInterval>>();
  let nextTimerId = 0;
  const setTimer =
    options.setTimer ??
    ((callback, ms): PairingPollTimer => {
      const timer = { id: nextTimerId };
      nextTimerId += 1;
      platformTimers.set(timer.id, setInterval(callback, ms));
      return timer;
    });
  const clearTimer =
    options.clearTimer ??
    ((timer: PairingPollTimer): void => {
      const platformTimer = platformTimers.get(timer.id);
      if (platformTimer === undefined) return;
      clearInterval(platformTimer);
      platformTimers.delete(timer.id);
    });

  let attempts = 0;
  let stopped = false;
  let timer: PairingPollTimer | null = null;

  const stop = (): void => {
    stopped = true;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const poll = async (): Promise<void> => {
    if (stopped) return;
    const nowDate = now();
    view.setPairingTick(nowDate);
    const current = view.state().payload;
    if (current !== null && secondsUntil(current.expiresAt, nowDate) === 0) {
      view.clearPairingPayload();
      stop();
      return;
    }
    if (attempts >= maxAttempts) {
      stop();
      return;
    }
    attempts += 1;
    let result: PairingPayloadFetchResult;
    try {
      result = await fetchPayload(url);
    } catch {
      // Keep the status-only fallback and let the bounded poll retry.
      return;
    }
    if (stopped) return;
    if (result.kind === 'not-waiting') {
      if (result.state === 'waiting') {
        // The gateway raced a fresh pairing into place after its payload
        // read; keep the waiting display and let the bounded poll continue.
        return;
      }
      view.setPairingStatus(result.state === 'paired' ? 'connected' : result.state);
      view.clearPairingPayload();
      stop();
      return;
    }
    if (result.kind === 'payload') {
      const previous = view.state().payload;
      if (previous === null || previous.pairingId !== result.payload.pairingId) {
        view.setPairingPayload(result.payload, renderPairingQrRows(result.payload));
      }
    }
  };

  timer = setTimer(() => {
    void poll();
  }, intervalMs);
  void poll();
  return stop;
}

/** Palette command layer handed to the keymap through `PairingTuiHost`. */
export interface PairingCommand {
  namespace: string;
  name: string;
  title: string;
  category: string;
  run: () => void | Promise<void>;
}

export interface PairingCommandLayer {
  commands: PairingCommand[];
  bindings: [];
}

/**
 * Narrow port over `TuiPluginApi` so the pairing flow and its tests stay
 * deterministic: layer registration, the dialog, the route, terminal width,
 * and disposal are all injected through this interface.
 */
export interface PairingTuiHost {
  registerLayer: (layer: PairingCommandLayer) => () => void;
  registerRoute: (name: string, render: () => string) => void;
  dialogReplace: (render: () => string, onClose?: () => void) => void;
  dialogSetSize: (size: 'medium' | 'large' | 'xlarge') => void;
  navigate: (name: string) => void;
  terminalWidth: () => number;
  onDispose: (fn: () => void) => void;
}

/**
 * Adapts the production TUI API onto `PairingTuiHost`. Dialog renders return
 * root OpenTUI text elements, and `dialog.replace` resets the size to medium,
 * so the flow always calls `setSize('xlarge')` after replacing.
 */
export function createTuiHost(api: TuiPluginApi): PairingTuiHost {
  return {
    registerLayer: (layer) =>
      api.keymap.registerLayer({
        commands: layer.commands.map((command) => ({
          namespace: command.namespace,
          name: command.name,
          title: command.title,
          category: command.category,
          run: () => command.run(),
        })),
        bindings: [],
      }),
    registerRoute: (name, render) => {
      api.route.register([{ name, render: () => renderPairingText(render()) }]);
    },
    dialogReplace: (render, onClose) => {
      api.ui.dialog.replace(() => renderPairingText(render()), onClose);
    },
    dialogSetSize: (size) => {
      api.ui.dialog.setSize(size);
    },
    navigate: (name) => {
      api.route.navigate(name);
    },
    terminalWidth: () => api.renderer.terminalWidth,
    onDispose: (fn) => {
      void api.lifecycle.onDispose(fn);
    },
  };
}

export interface PairingTuiOptions {
  detectEndpoints?: typeof detectEndpoints;
  port?: number;
  fetchImpl?: PairingFetchLike;
  fetchPayload?: (url: string) => Promise<PairingPayloadFetchResult>;
  now?: () => Date;
  setTimer?: (callback: () => void, intervalMs: number) => PairingPollTimer;
  clearTimer?: (handle: PairingPollTimer) => void;
}

/**
 * Wires the pairing TUI: the full-screen route, the initial bounded poll, the
 * `CodeRelay: Pair device` palette command, and lifecycle disposal. The
 * command renews the pairing, then opens the xlarge QR dialog — or, when the
 * terminal is too narrow for the QR plus its quiet zone, navigates to the
 * route instead of opening the dialog.
 */
export async function startPairingTui(
  host: PairingTuiHost,
  options: PairingTuiOptions = {},
): Promise<void> {
  const detect = options.detectEndpoints ?? detectEndpoints;
  const now = options.now ?? (() => new Date());
  const endpoints = await detect();
  const expiresAt = new Date(now().getTime() + PAIRING_TTL_SECONDS * 1000).toISOString();
  const view = createPairingView(endpoints, expiresAt);

  let stopPolling: (() => void) | null = null;
  const stopAndClear = (): void => {
    stopPolling?.();
    stopPolling = null;
    view.clearPairingPayload();
  };
  const restartPolling = (): void => {
    stopPolling?.();
    stopPolling = startPairingPayloadPolling(view, {
      port: options.port,
      fetchPayload: options.fetchPayload,
      now: options.now,
      setTimer: options.setTimer,
      clearTimer: options.clearTimer,
    });
  };

  host.registerRoute(PAIRING_ROUTE_NAME, () => view.render(now()));
  restartPolling();

  host.registerLayer({
    commands: [
      {
        namespace: 'palette',
        name: PAIRING_COMMAND_NAME,
        title: PAIRING_COMMAND_TITLE,
        category: PAIRING_COMMAND_CATEGORY,
        run: async () => {
          const payload = await renewPairingPayload({
            port: options.port,
            fetchImpl: options.fetchImpl,
            now: options.now,
          });
          if (payload !== null) {
            view.setPairingPayload(payload, renderPairingQrRows(payload));
          }
          if (host.terminalWidth() < PAIRING_DIALOG_MIN_TERMINAL_WIDTH) {
            host.navigate(PAIRING_ROUTE_NAME);
            restartPolling();
            return;
          }
          host.dialogReplace(
            () => renderPairingDialogText(view.state(), new Date(view.tick())),
            () => stopAndClear(),
          );
          host.dialogSetSize('xlarge');
          restartPolling();
        },
      },
    ],
    bindings: [],
  });

  host.onDispose(() => {
    stopAndClear();
  });
}

export const tui: TuiPlugin = async (api) => {
  await startPairingTui(createTuiHost(api));
};

const coderelayTuiModule: TuiPluginModule = { id: 'coderelay', tui };

export default coderelayTuiModule;
