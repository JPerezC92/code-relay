import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedEvent, PermissionDecision } from '@coderelay/protocol';
import { SessionServiceError } from '@/modules/session/domain/errors/session-service.error';
import type {
  ChatMessage,
  PermissionRequest,
  ProjectSummary,
  SessionSummary,
} from '@/modules/session/domain/entities/session';
import { sessionService } from '@/modules/session/services/session.service';

/** How often the hook drains host events and refreshes the selected history. */
export const SESSION_POLL_INTERVAL_MS = 2_500;

export type SessionStatus = 'idle' | 'busy';

export interface UseSessionResult {
  sessions: SessionSummary[];
  projects: ProjectSummary[];
  selectedProjectKey: string | null;
  projectSessions: SessionSummary[];
  selectedSessionId: string | null;
  messages: ChatMessage[];
  permissions: PermissionRequest[];
  status: SessionStatus;
  isLoading: boolean;
  error: string | null;
  selectProject: (key: string) => void;
  selectSession: (sessionID: string) => void;
  sendPrompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  replyToPermission: (permissionID: string, decision: PermissionDecision) => Promise<void>;
  refresh: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function readStatus(properties: Record<string, unknown>): SessionStatus | null {
  const status = properties['status'];
  if (!isRecord(status)) return null;
  const type = status['type'];
  if (type === 'busy' || type === 'retry') return 'busy';
  if (type === 'idle') return 'idle';
  return null;
}

function readPartUpdate(
  properties: Record<string, unknown>,
  selectedSessionId: string | null,
): ChatMessage | null {
  if (selectedSessionId === null) return null;
  const part = properties['part'];
  if (!isRecord(part)) return null;
  if (part['type'] !== 'text') return null;
  const id = readString(part, 'messageID');
  const sessionId = readString(part, 'sessionID');
  const text = readString(part, 'text');
  if (id === null || sessionId === null || text === null) return null;
  if (sessionId !== selectedSessionId) return null;
  return { id, sessionId, role: 'assistant', text };
}

function readPermissionRecord(
  record: Record<string, unknown>,
): PermissionRequest | null {
  const id = readString(record, 'id') ?? readString(record, 'permissionID');
  const sessionId = readString(record, 'sessionID');
  if (id === null || sessionId === null) return null;
  const title = readString(record, 'title') ?? 'Permission requested';
  return { id, sessionId, title };
}

function readPermission(properties: Record<string, unknown>): PermissionRequest | null {
  const direct = readPermissionRecord(properties);
  if (direct !== null) return direct;
  const info = properties['info'];
  if (isRecord(info)) return readPermissionRecord(info);
  return null;
}

/**
 * Overlays live event text on top of the authoritative history. History wins
 * unless the event carries more text, which keeps streaming output snappy
 * without ever dropping a message the host already reported.
 */
function mergeMessages(history: ChatMessage[], updates: ChatMessage[]): ChatMessage[] {
  if (updates.length === 0) return history;
  const byId = new Map<string, ChatMessage>();
  for (const message of history) {
    byId.set(message.id, message);
  }
  for (const update of updates) {
    const existing = byId.get(update.id);
    if (existing === undefined || update.text.length > existing.text.length) {
      byId.set(update.id, update);
    }
  }
  return [...byId.values()];
}

/**
 * Use case for the chat screen: loads sessions and the selected history, polls
 * for host events, tracks busy/idle, and exposes the allowlisted actions.
 */
export function useSession(): UseSessionResult {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  // Host-safe project list in host order (newest first): projects with zero
  // root sessions stay selectable instead of being derived away.
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  const projectSessions = useMemo(
    (): SessionSummary[] =>
      sessions.filter((summary) => summary.projectKey === selectedProjectKey),
    [sessions, selectedProjectKey],
  );

  const applyEvents = useCallback((events: NormalizedEvent[]): void => {
    if (events.length === 0) return;
    const selected = selectedSessionIdRef.current;
    const messageUpdates: ChatMessage[] = [];
    const asked: PermissionRequest[] = [];
    const replied: string[] = [];
    let nextStatus: SessionStatus | null = null;

    for (const event of events) {
      switch (event.name) {
        case 'session.status': {
          const sessionID = readString(event.properties, 'sessionID');
          if (selected !== null && sessionID !== null && sessionID !== selected) break;
          nextStatus = readStatus(event.properties) ?? nextStatus;
          break;
        }
        case 'session.idle':
        case 'session.error': {
          const sessionID = readString(event.properties, 'sessionID');
          if (selected !== null && sessionID !== null && sessionID !== selected) break;
          nextStatus = 'idle';
          break;
        }
        case 'permission.asked': {
          const permission = readPermission(event.properties);
          if (permission !== null && (selected === null || permission.sessionId === selected)) {
            asked.push(permission);
          }
          break;
        }
        case 'permission.replied': {
          const permissionID = readString(event.properties, 'permissionID');
          if (permissionID !== null) replied.push(permissionID);
          break;
        }
        case 'message.part.updated': {
          const message = readPartUpdate(event.properties, selected);
          if (message !== null) messageUpdates.push(message);
          break;
        }
        default:
          break;
      }
    }

    if (nextStatus !== null) setStatus(nextStatus);
    if (messageUpdates.length > 0) {
      setMessages((current) => mergeMessages(current, messageUpdates));
    }
    if (asked.length > 0) {
      setPermissions((current) => {
        const known = new Set(current.map((permission) => permission.id));
        const additions = asked.filter((permission) => !known.has(permission.id));
        return additions.length === 0 ? current : [...current, ...additions];
      });
    }
    if (replied.length > 0) {
      const removed = new Set(replied);
      setPermissions((current) => current.filter((permission) => !removed.has(permission.id)));
    }
  }, []);

  const loadSessions = useCallback(
    async (isCancelled?: () => boolean): Promise<void> => {
      setIsLoading(true);
      const result = await sessionService.listSessions();
      if (isCancelled !== undefined && isCancelled()) return;
      setIsLoading(false);
      if (result instanceof SessionServiceError) {
        setError(result.message);
        return;
      }
      setError(null);
      setSessions(result.sessions);
      setProjects(result.projects);
      applyEvents(result.events);
    },
    [applyEvents],
  );

  useEffect(() => {
    let cancelled = false;
    void loadSessions(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  useEffect(() => {
    setSelectedProjectKey((current) => {
      if (projects.length === 0) return null;
      if (projects.some((project) => project.key === current)) return current;
      return projects[0]?.key ?? null;
    });
  }, [projects]);

  useEffect(() => {
    setSelectedSessionId((current) =>
      projectSessions.some((summary) => summary.id === current)
        ? current
        : projectSessions[0]?.id ?? null,
    );
  }, [projectSessions]);

  useEffect(() => {
    if (selectedSessionId === null) return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      const result = await sessionService.fetchMessages(selectedSessionId);
      if (cancelled) return;
      if (result instanceof SessionServiceError) {
        setError(result.message);
        return;
      }
      setError(null);
      // Defensively drop any host message that does not belong to the selected
      // session so a mis-scoped host result can never render as this session.
      setMessages(result.messages.filter((message) => message.sessionId === selectedSessionId));
      applyEvents(result.events);
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, SESSION_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedSessionId, applyEvents]);

  const selectProject = useCallback(
    (key: string): void => {
      if (selectedProjectKey === key) return;
      selectedSessionIdRef.current = null;
      setSelectedSessionId(null);
      setMessages([]);
      setPermissions([]);
      setError(null);
      setStatus('idle');
      setSelectedProjectKey(key);
    },
    [selectedProjectKey],
  );

  const selectSession = useCallback((sessionID: string): void => {
    setSelectedSessionId(sessionID);
    setMessages([]);
    setPermissions([]);
    setError(null);
    setStatus('idle');
  }, []);

  const sendPrompt = useCallback(
    async (text: string): Promise<void> => {
      const sessionID = selectedSessionIdRef.current;
      if (sessionID === null) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      setStatus('busy');
      const result = await sessionService.sendPrompt(sessionID, trimmed);
      if (result instanceof SessionServiceError) {
        setError(result.message);
        setStatus('idle');
        return;
      }
      setError(null);
      applyEvents(result.events);
    },
    [applyEvents],
  );

  const abort = useCallback(async (): Promise<void> => {
    const sessionID = selectedSessionIdRef.current;
    if (sessionID === null) return;
    const result = await sessionService.abort(sessionID);
    if (result instanceof SessionServiceError) {
      setError(result.message);
      return;
    }
    setError(null);
    setStatus('idle');
    applyEvents(result.events);
  }, [applyEvents]);

  const replyToPermission = useCallback(
    async (permissionID: string, decision: PermissionDecision): Promise<void> => {
      const sessionID = selectedSessionIdRef.current;
      if (sessionID === null) return;
      setPermissions((current) =>
        current.filter((permission) => permission.id !== permissionID),
      );
      const result = await sessionService.replyToPermission(sessionID, permissionID, decision);
      if (result instanceof SessionServiceError) {
        setError(result.message);
        return;
      }
      setError(null);
      applyEvents(result.events);
    },
    [applyEvents],
  );

  const refresh = useCallback((): void => {
    void loadSessions();
  }, [loadSessions]);

  return {
    sessions,
    projects,
    selectedProjectKey,
    projectSessions,
    selectedSessionId,
    messages,
    permissions,
    status,
    isLoading,
    error,
    selectProject,
    selectSession,
    sendPrompt,
    abort,
    replyToPermission,
    refresh,
  };
}
