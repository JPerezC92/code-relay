/**
 * Session adapter for the mobile chat screen.
 *
 * Wraps the encrypted gateway transport and exposes only the allowlisted
 * OpenCode operations: list sessions, fetch messages, send a prompt, abort, and
 * reply to a permission. Every action result is narrowed into a typed view
 * model before it leaves this module, and every failure is returned as
 * `SessionServiceError` instead of being thrown.
 *
 * Permission replies are built from the protocol `PermissionDecision` union,
 * which is `once | reject` only. The runtime narrowing below keeps any forged
 * standing-grant value from ever reaching the gateway.
 */
import type { NormalizedEvent, PermissionDecision } from '@coderelay/protocol';
import { GatewayClientError, getGatewayClient } from '@/shared/transport/gateway-client';
import type { GatewayClient } from '@/shared/transport/gateway-client';
import type {
  ChatMessage,
  EditCard,
  ModelChoice,
  ModelListResult,
  ModelRef,
  ProjectSummary,
  ReasoningRow,
  SessionActionResult,
  SessionListResult,
  SessionPollResult,
  SessionSummary,
  SubagentRow,
  TextTranscriptItem,
  ToolRow,
  TranscriptItem,
} from '@/modules/session/domain/entities/session';
import { formatSubagentLabel } from '@/modules/session/domain/entities/session';
import { SessionServiceError } from '@/modules/session/domain/errors/session-service.error';

const gateway: GatewayClient = getGatewayClient();

/**
 * The gateway seals each action with the next device sequence. Two overlapping
 * actions would otherwise read the same sequence and one would be rejected as a
 * replay, so every request runs through this single-flight queue.
 */
let actionQueue: Promise<unknown> = Promise.resolve();

function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result: Promise<T> = actionQueue.then(() => operation());
  actionQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function toServiceError(error: unknown, fallback: string): SessionServiceError {
  return new SessionServiceError(error instanceof Error ? error.message : fallback);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function parseSession(raw: unknown): SessionSummary | null {
  if (!isRecord(raw)) return null;
  const id = readString(raw, 'id');
  if (id === null) return null;
  const projectKey = readString(raw, 'projectKey');
  if (projectKey === null) return null;
  const projectLabel = readString(raw, 'projectLabel');
  if (projectLabel === null) return null;
  const updatedAt = raw['updatedAt'];
  if (typeof updatedAt !== 'number') return null;
  const title = readString(raw, 'title') ?? 'Untitled session';
  return { id, title, updatedAt, projectKey, projectLabel };
}

function parseSessions(value: unknown): SessionSummary[] | null {
  if (!Array.isArray(value)) return null;
  const sessions: SessionSummary[] = [];
  for (const entry of value) {
    const session = parseSession(entry);
    if (session !== null) sessions.push(session);
  }
  return sessions;
}

function readNonEmptyString(record: Record<string, unknown>, key: string): string | null {
  const value = readString(record, key);
  if (value === null || value.length === 0) return null;
  return value;
}

function parseVariantIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) continue;
    ids.push(entry);
  }
  return ids;
}

/**
 * Builds a model row from the projected list shape and drops every other field,
 * including a provider `key` and any variant body, so the UI never sees host
 * catalog extras.
 */
function parseModelChoice(raw: unknown): ModelChoice | null {
  if (!isRecord(raw)) return null;
  const providerID = readNonEmptyString(raw, 'providerID');
  const modelID = readNonEmptyString(raw, 'modelID');
  const label = readNonEmptyString(raw, 'label');
  if (providerID === null || modelID === null || label === null) return null;
  return { providerID, modelID, label, variants: parseVariantIds(raw['variants']) };
}

function parseModelRef(raw: unknown): ModelRef | null {
  if (!isRecord(raw)) return null;
  const providerID = readNonEmptyString(raw, 'providerID');
  const modelID = readNonEmptyString(raw, 'modelID');
  if (providerID === null || modelID === null) return null;
  return { providerID, modelID };
}

function parseModelList(value: unknown): ModelListResult | null {
  if (!isRecord(value) || !Array.isArray(value['models'])) return null;
  const models: ModelChoice[] = [];
  for (const entry of value['models']) {
    const model = parseModelChoice(entry);
    if (model === null) return null;
    models.push(model);
  }
  const rawDefault = value['defaultModel'];
  if (rawDefault === null) return { models, defaultModel: null };
  const defaultModel = parseModelRef(rawDefault);
  if (defaultModel === null) return null;
  return { models, defaultModel };
}

function parseProjects(value: unknown): ProjectSummary[] | null {
  if (!Array.isArray(value)) return null;
  const projects: ProjectSummary[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const key = readString(entry, 'key');
    const label = readString(entry, 'label');
    if (key === null || label === null) continue;
    projects.push({ key, label });
  }
  return projects;
}

function collectText(parts: unknown[]): string {
  let text = '';
  for (const part of parts) {
    if (!isRecord(part)) continue;
    if (part['type'] !== 'text') continue;
    const value = part['text'];
    if (typeof value === 'string') text += value;
  }
  return text;
}

const FILE_ACTIVITY_TOOLS = new Set(['edit', 'write', 'apply_patch']);

function readOptionalNumber(record: Record<string, unknown> | null, key: string): number | undefined {
  if (record === null) return undefined;
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Maps one projected activity part into a chat row. Patch parts are dropped
 * because the edit tool card already shows that file. Other tools become a
 * tool row. Raw, cwd, and error objects are never read.
 */
function parseProjectedActivity(part: unknown, sessionId: string): TranscriptItem | null {
  if (!isRecord(part)) return null;
  const id = readString(part, 'id');
  if (id === null || sessionId.length === 0) return null;
  if (part['type'] === 'reasoning') {
    const text = readString(part, 'text');
    if (text === null) return null;
    const time = isRecord(part['time']) ? part['time'] : null;
    const row: ReasoningRow = { kind: 'reasoning', id, sessionId, text };
    const start = readOptionalNumber(time, 'start');
    const end = readOptionalNumber(time, 'end');
    if (start !== undefined) row.start = start;
    if (end !== undefined) row.end = end;
    return row;
  }
  if (part['type'] === 'patch') return null;
  if (part['type'] !== 'tool') return null;
  const tool = readString(part, 'tool');
  if (tool === null) return null;
  const status = readString(part, 'status') ?? '';
  if (FILE_ACTIVITY_TOOLS.has(tool)) {
    const card: EditCard = {
      kind: 'edit',
      id,
      sessionId,
      tool,
      status,
      path: readString(part, 'path') ?? '',
    };
    const diff = readString(part, 'diff');
    if (diff !== null) card.diff = diff;
    const additions = readOptionalNumber(part, 'additions');
    const deletions = readOptionalNumber(part, 'deletions');
    if (additions !== undefined) card.additions = additions;
    if (deletions !== undefined) card.deletions = deletions;
    return card;
  }
  if (tool !== 'task') {
    const row: ToolRow = {
      kind: 'tool',
      id,
      sessionId,
      tool,
      status,
      title: readString(part, 'title') ?? tool,
    };
    const output = readString(part, 'output');
    if (output !== null && output.length > 0) row.output = output;
    return row;
  }
  const title = readString(part, 'title');
  const description = readString(part, 'description');
  const agent = readString(part, 'agent');
  const titleText = title ?? description ?? agent ?? 'Subagent';
  const label =
    agent !== null && agent.length > 0
      ? formatSubagentLabel(agent, title ?? description ?? 'Subagent')
      : titleText;
  const row: SubagentRow = { kind: 'task', id, sessionId, label, status };
  if (agent !== null && agent.length > 0) row.agent = agent;
  if (title !== null) row.title = title;
  const childSessionId = readString(part, 'childSessionId');
  if (childSessionId !== null) row.childSessionId = childSessionId;
  return row;
}

function parsePartUpdate(properties: Record<string, unknown>): TranscriptItem | null {
  const part = properties['part'];
  if (!isRecord(part)) return null;
  const sessionId = readString(part, 'sessionID');
  if (sessionId === null) return null;
  if (part['type'] === 'text') {
    const id = readString(part, 'messageID');
    const text = readString(part, 'text');
    if (id === null || text === null) return null;
    const item: TextTranscriptItem = { kind: 'text', id, sessionId, role: 'assistant', text };
    return item;
  }
  return parseProjectedActivity(part, sessionId);
}

function parseMessages(value: unknown): { messages: ChatMessage[]; items: TranscriptItem[] } | null {
  if (!Array.isArray(value)) return null;
  const messages: ChatMessage[] = [];
  const items: TranscriptItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const info = entry['info'];
    const parts = entry['parts'];
    if (!isRecord(info)) continue;
    const role = info['role'];
    if (role !== 'user' && role !== 'assistant') continue;
    const id = readString(info, 'id');
    const sessionId = readString(info, 'sessionID');
    if (id === null || sessionId === null) continue;
    const text = Array.isArray(parts) ? collectText(parts) : '';
    if (text.length > 0) {
      const message: ChatMessage = { id, sessionId, role, text };
      messages.push(message);
    }
    if (!Array.isArray(parts)) continue;
    let textInserted = false;
    for (const part of parts) {
      if (!isRecord(part)) continue;
      if (part['type'] === 'text') {
        if (!textInserted && text.length > 0) {
          const textItem: TextTranscriptItem = { kind: 'text', id, sessionId, role, text };
          items.push(textItem);
          textInserted = true;
        }
        continue;
      }
      const activity = parseProjectedActivity(part, sessionId);
      if (activity !== null) items.push(activity);
    }
  }
  return { messages, items };
}

export const sessionService = {
  async listSessions(): Promise<SessionListResult | SessionServiceError> {
    try {
      const outcome = await runExclusive(() => gateway.sendAction({ type: 'session.list' }));
      if (outcome instanceof GatewayClientError) {
        return new SessionServiceError(outcome.message);
      }
      const catalog = outcome.result.value;
      if (!isRecord(catalog)) {
        return new SessionServiceError('Host session list was malformed');
      }
      const projects = parseProjects(catalog['projects']);
      const sessions = parseSessions(catalog['sessions']);
      if (projects === null || sessions === null) {
        return new SessionServiceError('Host session list was malformed');
      }
      return { projects, sessions, events: outcome.events };
    } catch (error) {
      return toServiceError(error, 'Session list failed');
    }
  },

  async fetchMessages(sessionID: string): Promise<SessionPollResult | SessionServiceError> {
    try {
      const outcome = await runExclusive(() =>
        gateway.sendAction({ type: 'session.messages', sessionID }),
      );
      if (outcome instanceof GatewayClientError) {
        return new SessionServiceError(outcome.message);
      }
      const parsed = parseMessages(outcome.result.value);
      if (parsed === null) {
        return new SessionServiceError('Host message list was malformed');
      }
      return { messages: parsed.messages, items: parsed.items, events: outcome.events };
    } catch (error) {
      return toServiceError(error, 'Message fetch failed');
    }
  },

  async listModels(): Promise<ModelListResult | SessionServiceError> {
    try {
      const outcome = await runExclusive(() => gateway.sendAction({ type: 'model.list' }));
      if (outcome instanceof GatewayClientError) {
        return new SessionServiceError(outcome.message);
      }
      const models = parseModelList(outcome.result.value);
      if (models === null) {
        return new SessionServiceError('Host model list was malformed');
      }
      return models;
    } catch (error) {
      return toServiceError(error, 'Model list failed');
    }
  },

  async sendPrompt(
    sessionID: string,
    text: string,
    model: ModelRef & { variant?: string },
  ): Promise<SessionActionResult | SessionServiceError> {
    const promptModel: ModelRef & { variant?: string } = {
      providerID: model.providerID,
      modelID: model.modelID,
    };
    if (typeof model.variant === 'string' && model.variant.length > 0) {
      promptModel.variant = model.variant;
    }
    try {
      const outcome = await runExclusive(() =>
        gateway.sendAction({ type: 'session.prompt', sessionID, text, model: promptModel }),
      );
      if (outcome instanceof GatewayClientError) {
        return new SessionServiceError(outcome.message);
      }
      return { events: outcome.events };
    } catch (error) {
      return toServiceError(error, 'Prompt send failed');
    }
  },

  async abort(sessionID: string): Promise<SessionActionResult | SessionServiceError> {
    try {
      const outcome = await runExclusive(() =>
        gateway.sendAction({ type: 'session.abort', sessionID }),
      );
      if (outcome instanceof GatewayClientError) {
        return new SessionServiceError(outcome.message);
      }
      return { events: outcome.events };
    } catch (error) {
      return toServiceError(error, 'Abort failed');
    }
  },

  /**
   * Maps a live part event into a transcript row. Host part fields stay in this
   * adapter. The selected session is accepted so the hook does not parse parts;
   * rows for other sessions are still returned so a child view can route them.
   */
  readTranscriptUpdate(
    event: NormalizedEvent,
    selectedSessionId: string | null,
  ): TranscriptItem | null {
    if (event.name !== 'message.part.updated') return null;
    const item = parsePartUpdate(event.properties);
    if (item === null) return null;
    if (selectedSessionId !== null && item.sessionId.length === 0) return null;
    return item;
  },

  async replyToPermission(
    sessionID: string,
    permissionID: string,
    decision: PermissionDecision,
  ): Promise<SessionActionResult | SessionServiceError> {
    const safeDecision: PermissionDecision = decision === 'once' ? 'once' : 'reject';
    try {
      const outcome = await runExclusive(() =>
        gateway.sendAction({
          type: 'permission.reply',
          sessionID,
          permissionID,
          decision: safeDecision,
        }),
      );
      if (outcome instanceof GatewayClientError) {
        return new SessionServiceError(outcome.message);
      }
      return { events: outcome.events };
    } catch (error) {
      return toServiceError(error, 'Permission reply failed');
    }
  },
};
