import { OpenCode } from '@opencode/client';
import type { OpenCodeClient } from '@opencode/client';
import { Service, headers } from '@opencode/client/service';
import { Plugin } from '@opencode/plugin';
import { toString as qrToString } from 'qrcode';
import type { PairingPayload } from '@coderelay/protocol';
import type {
  ModelLookupOptions,
  OpenCodeClientLike,
  OpenCodeSdkResult,
  PermissionReplyOptions,
  SessionContextOptions,
  SessionInterruptOptions,
  SessionListOptions,
  SessionPromptOptions,
  SessionSwitchModelOptions,
} from './allowlist';
import { detectEndpoints } from './endpoints';
import { CodeRelayGateway } from './gateway';
import { PAIRING_TTL_SECONDS, PairingManager, PendingPairingSecret } from './pairing';
import { SessionCatalog } from './session-catalog';
import type { OpenCodeCatalogClientLike } from './session-catalog';

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

/**
 * Adapts a V2 stream event to the host event envelope the routing filter and
 * the gateway consume. V2 events carry their payload in `data`; `sessionRouteId`
 * and `CodeRelayGateway.handleEvent` read `properties`. Only the envelope
 * changes — the event name and payload pass through untouched.
 */
function toHostEvent(event: unknown): { type: string; properties: Record<string, unknown> } | null {
  if (!isRecord(event)) return null;
  const type = readString(event, 'type');
  if (type === undefined) return null;
  const data = event.data;
  return { type, properties: isRecord(data) ? data : {} };
}

function hostFailure(error: unknown): OpenCodeSdkResult {
  return { error: error instanceof Error ? error.message : 'Unknown host call failure' };
}

function toLookupInput(options: ModelLookupOptions | undefined): { location?: { directory?: string } } {
  return options === undefined || options.location === undefined ? {} : { location: options.location };
}

function toModelRef(
  model: SessionSwitchModelOptions['model'],
): { id: string; providerID: string; variant?: string } {
  return model.variant === undefined
    ? { id: model.id, providerID: model.providerID }
    : { id: model.id, providerID: model.providerID, variant: model.variant };
}

/**
 * Composition-root adapter over `@opencode/client`: the single place allowed to
 * reference the V2 client surface. It satisfies T1's structural port
 * (`OpenCodeClientLike` / `OpenCodeCatalogClientLike`) with `{data | error}`
 * envelopes, so `gateway.ts`, `allowlist.ts` and `session-catalog.ts` never see
 * a framework type. Transport and discovery failures return `{error}` envelopes
 * on the `HostCallFailedError` boundary path. Forced shape mappings, each owned
 * here: V2 `{location, data}` results are unwrapped to the bare payload; the
 * `SessionsResponse.data` array is flattened onto the envelope and each session
 * record's `location.directory` is flattened to the `directory` field the
 * catalog reads; `Project.canonical` maps to the port's `worktree`.
 */
function createHostPort(): OpenCodeClientLike & OpenCodeCatalogClientLike {
  let client: OpenCodeClient | null = null;

  async function resolveClient(): Promise<OpenCodeClient | null> {
    if (client !== null) return client;
    try {
      const endpoint = await Service.discover();
      if (endpoint === undefined) return null;
      client = OpenCode.make({ baseUrl: endpoint.url, headers: headers(endpoint) });
      return client;
    } catch {
      return null;
    }
  }

  return {
    session: {
      async list(options?: SessionListOptions): Promise<OpenCodeSdkResult> {
        const host = await resolveClient();
        if (host === null) return { error: 'OpenCode service discovery failed' };
        try {
          const directory = options?.query?.directory;
          const response = await host.session.list(directory === undefined ? {} : { directory });
          return {
            data: response.data.map((session) => ({
              ...session,
              directory: session.location.directory,
            })),
          };
        } catch (error) {
          return hostFailure(error);
        }
      },
      async active(): Promise<OpenCodeSdkResult> {
        const host = await resolveClient();
        if (host === null) return { error: 'OpenCode service discovery failed' };
        try {
          return { data: await host.session.active() };
        } catch (error) {
          return hostFailure(error);
        }
      },
      async context(options: SessionContextOptions): Promise<OpenCodeSdkResult> {
        const host = await resolveClient();
        if (host === null) return { error: 'OpenCode service discovery failed' };
        try {
          return { data: await host.session.context({ sessionID: options.sessionID }) };
        } catch (error) {
          return hostFailure(error);
        }
      },
      async switchModel(options: SessionSwitchModelOptions): Promise<OpenCodeSdkResult> {
        const host = await resolveClient();
        if (host === null) return { error: 'OpenCode service discovery failed' };
        try {
          await host.session.switchModel({
            sessionID: options.sessionID,
            model: toModelRef(options.model),
          });
          return { data: null };
        } catch (error) {
          return hostFailure(error);
        }
      },
      async prompt(options: SessionPromptOptions): Promise<OpenCodeSdkResult> {
        const host = await resolveClient();
        if (host === null) return { error: 'OpenCode service discovery failed' };
        try {
          return {
            data: await host.session.prompt({ sessionID: options.sessionID, text: options.text }),
          };
        } catch (error) {
          return hostFailure(error);
        }
      },
      async interrupt(options: SessionInterruptOptions): Promise<OpenCodeSdkResult> {
        const host = await resolveClient();
        if (host === null) return { error: 'OpenCode service discovery failed' };
        try {
          return { data: await host.session.interrupt({ sessionID: options.sessionID }) };
        } catch (error) {
          return hostFailure(error);
        }
      },
    },
    model: {
      async list(options?: ModelLookupOptions): Promise<OpenCodeSdkResult> {
        const host = await resolveClient();
        if (host === null) return { error: 'OpenCode service discovery failed' };
        try {
          return { data: (await host.model.list(toLookupInput(options))).data };
        } catch (error) {
          return hostFailure(error);
        }
      },
      async default(options?: ModelLookupOptions): Promise<OpenCodeSdkResult> {
        const host = await resolveClient();
        if (host === null) return { error: 'OpenCode service discovery failed' };
        try {
          return { data: (await host.model.default(toLookupInput(options))).data };
        } catch (error) {
          return hostFailure(error);
        }
      },
    },
    permission: {
      async reply(options: PermissionReplyOptions): Promise<OpenCodeSdkResult> {
        const host = await resolveClient();
        if (host === null) return { error: 'OpenCode service discovery failed' };
        try {
          await host.permission.reply({
            sessionID: options.sessionID,
            requestID: options.requestID,
            decision: options.decision,
          });
          return { data: null };
        } catch (error) {
          return hostFailure(error);
        }
      },
    },
    project: {
      async list(): Promise<OpenCodeSdkResult> {
        const host = await resolveClient();
        if (host === null) return { error: 'OpenCode service discovery failed' };
        try {
          return {
            data: (await host.project.list()).map((project) => ({
              id: project.id,
              worktree: project.canonical,
            })),
          };
        } catch (error) {
          return hostFailure(error);
        }
      },
    },
  };
}

const plugin = Plugin.define({
  id: 'coderelay.server',
  setup: async (ctx) => {
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

    const client = createHostPort();
    const catalog = new SessionCatalog(client);
    const gateway = new CodeRelayGateway({
      client,
      pairing,
      catalog,
      // The TUI runs in a separate process, so it reads the live payload over
      // the loopback-only routes instead of reconstructing the secret itself.
      pairingPayload: () => currentPayload,
      clearPairingPayload,
      renewPairing,
    });
    await gateway.listen();

    await ctx.tool.transform((editor) => {
      editor.add({
        name: 'coderelay_pair',
        description:
          'Show CodeRelay pairing status. On the first call while a pairing is waiting, returns the full pairing payload and a terminal QR string; later calls return status only and never the raw one-time secret.',
        input: { type: 'object', properties: {}, additionalProperties: false },
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
              return {
                output: JSON.stringify(currentStatus),
                // V1 `title` has no V2 `Tool.Result` member; carried in
                // `metadata` as an approved contract change.
                metadata: { title: 'CodeRelay pairing' },
              };
            }
            return {
              output: JSON.stringify({ ...payload, qr }),
              metadata: { title: 'CodeRelay pairing' },
            };
          }
          return {
            output: JSON.stringify(status),
            metadata: { title: 'CodeRelay pairing' },
          };
        },
      });
    });

    const eventStreamAbort = new AbortController();
    const consumeGlobalEvents = async (): Promise<void> => {
      try {
        for await (const event of ctx.event.subscribe({ signal: eventStreamAbort.signal })) {
          const hostEvent = toHostEvent(event);
          if (hostEvent === null) continue;
          const sessionId = sessionRouteId(hostEvent);
          if (sessionId === null) continue;
          if (
            catalog.lookup(sessionId) === null &&
            catalog.lookupChildRootDirectory(sessionId) === null
          ) {
            continue;
          }
          gateway.handleEvent(hostEvent);
        }
      } catch {
        return;
      }
    };
    void consumeGlobalEvents();

    return async () => {
      eventStreamAbort.abort();
      clearPairingPayload();
      await gateway.dispose();
    };
  },
});

export default plugin;
