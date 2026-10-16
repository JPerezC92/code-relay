import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedEvent, PermissionDecision } from '@coderelay/protocol';
import { SessionServiceError } from '@/modules/session/domain/errors/session-service.error';
import type {
  ChatMessage,
  EditCard,
  ModelChoice,
  ModelRef,
  PermissionRequest,
  ProjectSummary,
  SessionPollResult,
  SessionStatus,
  SessionSummary,
  SubagentRow,
  TextTranscriptItem,
  ToolRow,
  TranscriptItem,
} from '@/modules/session/domain/entities/session';
import { formatSubagentLabel, subagentTitle } from '@/modules/session/domain/entities/session';
import { sessionService } from '@/modules/session/services/session.service';

/** How often the hook drains host events and refreshes the selected history. */
export const SESSION_POLL_INTERVAL_MS = 2_500;

export interface UseSessionResult {
  sessions: SessionSummary[];
  projects: ProjectSummary[];
  selectedProjectKey: string | null;
  projectSessions: SessionSummary[];
  selectedSessionId: string | null;
  messages: ChatMessage[];
  transcript: TranscriptItem[];
  childSessionId: string | null;
  permissions: PermissionRequest[];
  models: ModelChoice[];
  selectedModel: ModelChoice | null;
  selectedVariant: string | null;
  status: SessionStatus;
  isLoading: boolean;
  error: string | null;
  selectProject: (key: string) => void;
  selectSession: (sessionID: string) => void;
  selectModel: (model: ModelRef) => void;
  selectVariant: (variantID: string) => void;
  sendPrompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  replyToPermission: (permissionID: string, decision: PermissionDecision) => Promise<void>;
  openChildSession: (sessionID: string) => Promise<void>;
  openTaskRow: (row: SubagentRow) => Promise<void>;
  closeChildSession: () => void;
  refresh: () => void;
}

function sameModel(left: ModelRef, right: ModelRef): boolean {
  return left.providerID === right.providerID && left.modelID === right.modelID;
}

function firstVariant(model: ModelChoice | null): string | null {
  if (model === null) return null;
  const first = model.variants[0];
  return first === undefined || first.length === 0 ? null : first;
}

/**
 * Picks the prompt model without reordering rows. A still-valid selection wins.
 * Otherwise the host default wins when it matches a row, then the first row.
 */
function resolveSelectedModel(
  models: ModelChoice[],
  defaultModel: ModelRef | null,
  current: ModelChoice | null,
): ModelChoice | null {
  if (current !== null) {
    const kept = models.find((model) => sameModel(model, current));
    if (kept !== undefined) return kept;
  }
  if (defaultModel !== null) {
    const match = models.find((model) => sameModel(model, defaultModel));
    if (match !== undefined) return match;
  }
  return models[0] ?? null;
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

function toTextItem(message: ChatMessage): TextTranscriptItem {
  return {
    kind: 'text',
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    text: message.text,
  };
}

function readPollTranscript(result: SessionPollResult, sessionId: string): TranscriptItem[] {
  const source = result.items ?? result.messages.map(toTextItem);
  return source.filter((item) => item.sessionId === sessionId);
}

function preserveOmittedTaskFields(
  current: TranscriptItem[],
  incoming: TranscriptItem[],
): TranscriptItem[] {
  const currentById = new Map(current.map((item) => [item.id, item]));
  return incoming.map((item) => {
    const existing = currentById.get(item.id);
    if (item.kind === 'edit') {
      if (existing === undefined || existing.kind !== 'edit') return item;
      return mergeEditCard(existing, item);
    }
    if (item.kind === 'tool') {
      if (existing === undefined || existing.kind !== 'tool') return item;
      return mergeToolRow(existing, item);
    }
    if (item.kind !== 'task') return item;
    if (existing === undefined || existing.kind !== 'task') return item;
    const childSessionId = item.childSessionId ?? existing.childSessionId;
    const agent = item.agent ?? existing.agent;
    if (childSessionId === item.childSessionId && agent === item.agent) return item;
    const preserved: SubagentRow = { ...item };
    if (childSessionId !== undefined) preserved.childSessionId = childSessionId;
    if (agent !== undefined) preserved.agent = agent;
    return preserved;
  });
}

function transcriptItemsEqual(current: TranscriptItem[], next: TranscriptItem[]): boolean {
  if (current.length !== next.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    const left = current[index];
    const right = next[index];
    if (left === undefined || right === undefined) return false;
    if (left.id !== right.id || left.kind !== right.kind) return false;
    if (left.kind === 'text' && right.kind === 'text') {
      if (left.text !== right.text) return false;
      continue;
    }
    if (left.kind === 'reasoning' && right.kind === 'reasoning') {
      if (left.text !== right.text) return false;
      continue;
    }
    if (left.kind === 'edit' && right.kind === 'edit') {
      if (
        left.status !== right.status ||
        left.path !== right.path ||
        left.diff !== right.diff ||
        left.additions !== right.additions ||
        left.deletions !== right.deletions
      ) {
        return false;
      }
      continue;
    }
    if (left.kind === 'tool' && right.kind === 'tool') {
      if (
        left.title !== right.title ||
        left.status !== right.status ||
        left.output !== right.output
      ) {
        return false;
      }
      continue;
    }
    if (left.kind === 'task' && right.kind === 'task') {
      if (
        left.label !== right.label ||
        left.status !== right.status ||
        left.childSessionId !== right.childSessionId ||
        left.agent !== right.agent
      ) {
        return false;
      }
      continue;
    }
    return false;
  }
  return true;
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
function mergeEditCard(existing: EditCard, update: EditCard): EditCard {
  const diff = update.diff ?? existing.diff;
  const additions = update.additions ?? existing.additions;
  const deletions = update.deletions ?? existing.deletions;
  if (
    diff === update.diff &&
    additions === update.additions &&
    deletions === update.deletions
  ) {
    return update;
  }
  const merged: EditCard = { ...update };
  if (diff !== undefined) merged.diff = diff;
  if (additions !== undefined) merged.additions = additions;
  if (deletions !== undefined) merged.deletions = deletions;
  return merged;
}

function mergeToolRow(existing: ToolRow, update: ToolRow): ToolRow {
  const output = update.output ?? existing.output;
  if (output === update.output) return update;
  const merged: ToolRow = { ...update };
  if (output !== undefined) merged.output = output;
  return merged;
}

function mergeTaskRow(existing: SubagentRow, update: SubagentRow): SubagentRow {
  const agent = update.agent ?? existing.agent;
  const childSessionId = update.childSessionId ?? existing.childSessionId;
  const title = update.agent === undefined ? update.label : subagentTitle(update.agent, update.label);
  const label = agent === undefined ? update.label : formatSubagentLabel(agent, title);
  const merged: SubagentRow = {
    kind: 'task',
    id: update.id,
    sessionId: update.sessionId,
    status: update.status,
    label,
  };
  if (agent !== undefined) merged.agent = agent;
  if (update.title !== undefined) merged.title = update.title;
  else if (existing.title !== undefined) merged.title = existing.title;
  if (childSessionId !== undefined) merged.childSessionId = childSessionId;
  return merged;
}

function mergeTranscript(history: TranscriptItem[], updates: TranscriptItem[]): TranscriptItem[] {
  if (updates.length === 0) return history;
  const byId = new Map<string, TranscriptItem>();
  for (const item of history) {
    byId.set(item.id, item);
  }
  for (const update of updates) {
    const existing = byId.get(update.id);
    if (
      existing !== undefined &&
      existing.kind === 'text' &&
      update.kind === 'text' &&
      update.text.length <= existing.text.length
    ) {
      continue;
    }
    if (existing !== undefined && existing.kind === 'task' && update.kind === 'task') {
      byId.set(update.id, mergeTaskRow(existing, update));
      continue;
    }
    if (existing !== undefined && existing.kind === 'edit' && update.kind === 'edit') {
      byId.set(update.id, mergeEditCard(existing, update));
      continue;
    }
    if (existing !== undefined && existing.kind === 'tool' && update.kind === 'tool') {
      byId.set(update.id, mergeToolRow(existing, update));
      continue;
    }
    byId.set(update.id, update);
  }
  return [...byId.values()];
}

function textMessages(items: TranscriptItem[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const item of items) {
    if (item.kind !== 'text') continue;
    messages.push({ id: item.id, sessionId: item.sessionId, role: item.role, text: item.text });
  }
  return messages;
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
  const [parentTranscript, setParentTranscript] = useState<TranscriptItem[]>([]);
  const [childTranscript, setChildTranscript] = useState<TranscriptItem[] | null>(null);
  const [childSessionId, setChildSessionId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelChoice | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSessionIdRef = useRef<string | null>(null);
  const childSessionIdRef = useRef<string | null>(null);
  const childRequestRef = useRef(0);
  const selectedModelRef = useRef<ModelChoice | null>(null);
  const selectedVariantRef = useRef<string | null>(null);
  const modelsRef = useRef<ModelChoice[]>([]);
  selectedModelRef.current = selectedModel;
  selectedVariantRef.current = selectedVariant;
  modelsRef.current = models;

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    childSessionIdRef.current = childSessionId;
  }, [childSessionId]);

  const projectSessions = useMemo(
    (): SessionSummary[] =>
      sessions.filter((summary) => summary.projectKey === selectedProjectKey),
    [sessions, selectedProjectKey],
  );

  const applyEvents = useCallback((events: NormalizedEvent[]): void => {
    if (events.length === 0) return;
    const selected = selectedSessionIdRef.current;
    const parentUpdates: TranscriptItem[] = [];
    const childUpdates: TranscriptItem[] = [];
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
          const item = sessionService.readTranscriptUpdate(event, selected);
          if (item === null) break;
          if (selected !== null && item.sessionId === selected) parentUpdates.push(item);
          const openChild = childSessionIdRef.current;
          if (openChild !== null && item.sessionId === openChild) childUpdates.push(item);
          break;
        }
        default:
          break;
      }
    }

    if (nextStatus !== null) setStatus(nextStatus);
    if (parentUpdates.length > 0) {
      setParentTranscript((current) => mergeTranscript(current, parentUpdates));
    }
    if (childUpdates.length > 0) {
      setChildTranscript((current) => mergeTranscript(current ?? [], childUpdates));
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
      const modelsResult = await sessionService.listModels();
      if (isCancelled !== undefined && isCancelled()) return;
      setError(null);
      setSessions(result.sessions);
      setProjects(result.projects);
      applyEvents(result.events);
      if (modelsResult instanceof SessionServiceError) {
        setModels([]);
        setSelectedModel(null);
        setSelectedVariant(null);
        setError(modelsResult.message);
        return;
      }
      const nextModel = resolveSelectedModel(
        modelsResult.models,
        modelsResult.defaultModel,
        selectedModelRef.current,
      );
      setModels(modelsResult.models);
      setSelectedModel(nextModel);
      setSelectedVariant((currentVariant) => {
        if (nextModel === null) return null;
        const kept =
          selectedModelRef.current !== null && sameModel(selectedModelRef.current, nextModel);
        if (kept && currentVariant !== null && nextModel.variants.includes(currentVariant)) {
          return currentVariant;
        }
        return firstVariant(nextModel);
      });
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
      // An unchanged poll must keep the same array so the list does not reflow.
      setParentTranscript((current) => {
        const next = preserveOmittedTaskFields(
          current,
          readPollTranscript(result, selectedSessionId),
        );
        return transcriptItemsEqual(current, next) ? current : next;
      });
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
      childSessionIdRef.current = null;
      childRequestRef.current += 1;
      setSelectedSessionId(null);
      setParentTranscript([]);
      setChildTranscript(null);
      setChildSessionId(null);
      setPermissions([]);
      setError(null);
      setStatus('idle');
      setSelectedProjectKey(key);
    },
    [selectedProjectKey],
  );

  const selectSession = useCallback((sessionID: string): void => {
    if (sessionID === selectedSessionIdRef.current) return;
    childSessionIdRef.current = null;
    childRequestRef.current += 1;
    setSelectedSessionId(sessionID);
    setParentTranscript([]);
    setChildTranscript(null);
    setChildSessionId(null);
    setPermissions([]);
    setError(null);
    setStatus('idle');
  }, []);

  const selectModel = useCallback((model: ModelRef): void => {
    const match = modelsRef.current.find((row) => sameModel(row, model));
    if (match === undefined) return;
    setSelectedModel(match);
    setSelectedVariant(firstVariant(match));
  }, []);

  const selectVariant = useCallback((variantID: string): void => {
    const model = selectedModelRef.current;
    if (model === null || !model.variants.includes(variantID)) return;
    setSelectedVariant(variantID);
  }, []);

  const sendPrompt = useCallback(
    async (text: string): Promise<void> => {
      const sessionID = selectedSessionIdRef.current;
      const model = selectedModelRef.current;
      if (sessionID === null || model === null) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      setStatus('busy');
      const variant = selectedVariantRef.current;
      const promptModel: ModelRef & { variant?: string } = {
        providerID: model.providerID,
        modelID: model.modelID,
      };
      if (variant !== null && variant.length > 0 && model.variants.includes(variant)) {
        promptModel.variant = variant;
      }
      const result = await sessionService.sendPrompt(sessionID, trimmed, promptModel);
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

  const openChildSession = useCallback(async (sessionID: string): Promise<void> => {
    if (sessionID.length === 0) return;
    const request = childRequestRef.current + 1;
    childRequestRef.current = request;
    const result = await sessionService.fetchMessages(sessionID);
    if (request !== childRequestRef.current) return;
    if (result instanceof SessionServiceError) {
      setError(result.message);
      return;
    }
    setError(null);
    setChildSessionId(sessionID);
    setChildTranscript(readPollTranscript(result, sessionID));
    applyEvents(result.events);
  }, [applyEvents]);

  const openTaskRow = useCallback(async (row: SubagentRow): Promise<void> => {
    const known = row.childSessionId;
    if (known !== undefined && known.length > 0) {
      await openChildSession(known);
      return;
    }
    const ownerId = row.sessionId;
    const request = childRequestRef.current;
    const result = await sessionService.fetchMessages(ownerId);
    if (request !== childRequestRef.current) return;
    if (result instanceof SessionServiceError) {
      setError(result.message);
      return;
    }
    const items = readPollTranscript(result, ownerId);
    if (ownerId === childSessionIdRef.current) {
      setChildTranscript(items);
    } else if (ownerId === selectedSessionIdRef.current) {
      setParentTranscript(items);
    } else {
      return;
    }
    applyEvents(result.events);
    const match = items.find((item) => item.kind === 'task' && item.id === row.id);
    const childId = match !== undefined && match.kind === 'task' ? match.childSessionId : undefined;
    if (childId === undefined || childId.length === 0) return;
    await openChildSession(childId);
  }, [applyEvents, openChildSession]);

  const closeChildSession = useCallback((): void => {
    childRequestRef.current += 1;
    childSessionIdRef.current = null;
    setChildSessionId(null);
    setChildTranscript(null);
  }, []);

  const refresh = useCallback((): void => {
    void loadSessions();
  }, [loadSessions]);

  const transcript = childTranscript ?? parentTranscript;

  return {
    sessions,
    projects,
    selectedProjectKey,
    projectSessions,
    selectedSessionId,
    messages: textMessages(parentTranscript),
    transcript,
    childSessionId,
    permissions,
    models,
    selectedModel,
    selectedVariant,
    status,
    isLoading,
    error,
    selectProject,
    selectSession,
    selectModel,
    selectVariant,
    sendPrompt,
    abort,
    replyToPermission,
    openChildSession,
    openTaskRow,
    closeChildSession,
    refresh,
  };
}
