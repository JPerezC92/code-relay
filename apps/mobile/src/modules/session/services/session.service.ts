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
import type { PermissionDecision } from '@coderelay/protocol';
import { GatewayClientError, getGatewayClient } from '@/shared/transport/gateway-client';
import type { GatewayClient } from '@/shared/transport/gateway-client';
import type {
  ChatMessage,
  ProjectSummary,
  SessionActionResult,
  SessionListResult,
  SessionPollResult,
  SessionSummary,
} from '@/modules/session/domain/entities/session';
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

function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages: ChatMessage[] = [];
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
    if (text.length === 0) continue;
    messages.push({ id, sessionId, role, text });
  }
  return messages;
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
      const messages = parseMessages(outcome.result.value);
      if (messages === null) {
        return new SessionServiceError('Host message list was malformed');
      }
      return { messages, events: outcome.events };
    } catch (error) {
      return toServiceError(error, 'Message fetch failed');
    }
  },

  async sendPrompt(
    sessionID: string,
    text: string,
  ): Promise<SessionActionResult | SessionServiceError> {
    try {
      const outcome = await runExclusive(() =>
        gateway.sendAction({ type: 'session.prompt', sessionID, text }),
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
