import { tool } from '@opencode-ai/plugin';
import type { Hooks, Plugin } from '@opencode-ai/plugin';
import { toString as qrToString } from 'qrcode';
import type { PairingPayload } from '@coderelay/protocol';
import { detectEndpoints } from './endpoints';
import { CodeRelayGateway } from './gateway';
import { PAIRING_TTL_SECONDS, PairingManager, PendingPairingSecret } from './pairing';
import { SessionCatalog } from './session-catalog';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === 'string' ? value : undefined;
}

function sessionRouteId(event: unknown): string | null {
  if (!isRecord(event)) return null;
  const properties = event.properties;
  if (!isRecord(properties)) return null;
  const direct = readString(properties, 'sessionID');
  if (direct !== undefined) return direct;
  const info = properties.info;
  if (isRecord(info)) {
    const message = readString(info, 'sessionID');
    if (message !== undefined) return message;
    const session = readString(info, 'id');
    if (session !== undefined) return session;
  }
  const part = properties.part;
  if (isRecord(part)) {
    const partSession = readString(part, 'sessionID');
    if (partSession !== undefined) return partSession;
  }
  return null;
}

const plugin: Plugin = async (input): Promise<Hooks> => {
  const pairing = new PairingManager();
  const endpoints = await detectEndpoints();
  const endpointUrls = endpoints.map((endpoint) => endpoint.url);

  const initial = pairing.createPairing({ endpoints: endpointUrls });
  /**
   * Live holders for the current pairing: the gateway serves whatever these
   * hold, so a renewal is reflected on the loopback routes and the pairing
   * tool immediately instead of serving a startup-captured payload.
   */
  let currentPayload: PairingPayload | null =
    initial instanceof Error ? null : initial.payload;
  let pendingSecret: PendingPairingSecret | null =
    initial instanceof Error
      ? null
      : new PendingPairingSecret(initial.oneTimeSecret, {
          ttlMs: PAIRING_TTL_SECONDS * 1000,
        });

  /** Clears every live holder that can retain the pairing's one-time secret. */
  const clearPairingPayload = (): void => {
    pendingSecret?.clear();
    pendingSecret = null;
    currentPayload = null;
  };

  /** Recreates the pairing for the loopback renew route and swaps the holders. */
  const renewPairing = (): PairingPayload | null => {
    if (currentPayload !== null && pairing.status().state === 'waiting') {
      return currentPayload;
    }
    const created = pairing.createPairing({ endpoints: endpointUrls });
    if (created instanceof Error) return null;
    pendingSecret?.clear();
    pendingSecret = new PendingPairingSecret(created.oneTimeSecret, {
      ttlMs: PAIRING_TTL_SECONDS * 1000,
    });
    currentPayload = created.payload;
    return created.payload;
  };

  const catalog = new SessionCatalog(input.client);
  const gateway = new CodeRelayGateway({
    client: input.client,
    pairing,
    catalog,
    // The TUI runs in a separate process, so it reads the live payload over
    // the loopback-only routes instead of reconstructing the secret itself.
    pairingPayload: () => currentPayload,
    clearPairingPayload,
    renewPairing,
  });
  await gateway.listen();

  const eventStreamAbort = new AbortController();
  const consumeGlobalEvents = async (): Promise<void> => {
    try {
      const { stream } = await input.client.global.event({ signal: eventStreamAbort.signal });
      for await (const globalEvent of stream) {
        const sessionId = sessionRouteId(globalEvent.payload);
        if (sessionId === null) continue;
        if (catalog.lookup(sessionId) === null) continue;
        gateway.handleEvent(globalEvent.payload);
      }
    } catch {
      return;
    }
  };
  void consumeGlobalEvents();

  return {
    event: async () => {
      if (gateway.status().state !== 'waiting') {
        clearPairingPayload();
      }
    },
    dispose: async () => {
      eventStreamAbort.abort();
      clearPairingPayload();
      await gateway.dispose();
    },
    tool: {
      coderelay_pair: tool({
        description:
          'Show CodeRelay pairing status. On the first call while a pairing is waiting, returns the full pairing payload and a terminal QR string; later calls return status only and never the raw one-time secret.',
        args: {},
        execute: async () => {
          const status = gateway.status();
          const secret = pendingSecret?.take(status.state) ?? null;
          const payload = currentPayload;
          if (secret !== null && payload !== null) {
            // The plugin server process owns the live pairing state, so the
            // pairing payload and QR are delivered through this tool. The TUI
            // reads the same payload from the gateway's loopback-only
            // `/pairing-payload` route; this tool remains the first-call
            // delivery path and returns status only afterwards. The secret is
            // taken at most once per pairing, so a consumed or expired secret
            // is never re-served.
            const qr = await qrToString(JSON.stringify(payload), {
              type: 'terminal',
              small: true,
            });
            const currentStatus = gateway.status();
            if (currentStatus.state !== 'waiting' || currentPayload !== payload) {
              return { title: 'CodeRelay pairing', output: JSON.stringify(currentStatus) };
            }
            return {
              title: 'CodeRelay pairing',
              output: JSON.stringify({ ...payload, qr }),
            };
          }
          return { title: 'CodeRelay pairing', output: JSON.stringify(status) };
        },
      }),
    },
  };
};

export default plugin;
