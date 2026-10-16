/**
 * Session view models exchanged between the session service, its hook, and the
 * chat components. They are shaped for the UI and never carry host secrets.
 */
import type { NormalizedEvent } from '@coderelay/protocol';

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: number;
  projectKey: string;
  projectLabel: string;
}

export interface ProjectSummary {
  key: string;
  label: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  text: string;
}

/** A text bubble in the activity transcript. Same fields as `ChatMessage`. */
export interface TextTranscriptItem {
  kind: 'text';
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  text: string;
}

/**
 * A collapsed reasoning row. `start` and `end` are host timestamps in
 * milliseconds. `end` is absent while the host is still thinking.
 */
export interface ReasoningRow {
  kind: 'reasoning';
  id: string;
  sessionId: string;
  text: string;
  start?: number;
  end?: number;
}

/** An edit, write, or apply_patch card. Patch parts are not cards. */
export interface EditCard {
  kind: 'edit';
  id: string;
  sessionId: string;
  tool: string;
  status: string;
  path: string;
  diff?: string;
  additions?: number;
  deletions?: number;
}

/** Visible task label. Capitalizes the agent and keeps a title-only label when absent. */
export function formatSubagentLabel(agent: string, title: string): string {
  const name = agent.length === 0 ? agent : agent.charAt(0).toUpperCase() + agent.slice(1);
  return `${name} Task – ${title}`;
}

/**
 * Title portion of a task label. A label already formatted with `agent` is
 * unwrapped so a later merge can reapply a preserved agent without doubling it.
 */
export function subagentTitle(agent: string | undefined, label: string): string {
  if (agent === undefined || agent.length === 0) return label;
  const prefix = formatSubagentLabel(agent, '');
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

/**
 * A non-file tool row. `title` is the visible line. `output` is absent when
 * the host sent none, so the row stays visible and is not expandable.
 */
export interface ToolRow {
  kind: 'tool';
  id: string;
  sessionId: string;
  tool: string;
  status: string;
  title: string;
  output?: string;
}

/** A subagent row. Pressable when it has an agent, a title, or a child session. */
export interface SubagentRow {
  kind: 'task';
  id: string;
  sessionId: string;
  label: string;
  status: string;
  agent?: string;
  title?: string;
  childSessionId?: string;
}

export type TranscriptItem = TextTranscriptItem | ReasoningRow | EditCard | ToolRow | SubagentRow;

export interface PermissionRequest {
  id: string;
  sessionId: string;
  title: string;
}

export interface SessionListResult {
  projects: ProjectSummary[];
  sessions: SessionSummary[];
  events: NormalizedEvent[];
}

export interface SessionPollResult {
  messages: ChatMessage[];
  /**
   * Ordered text, reasoning, edit, tool, and subagent items. Optional so existing
   * callers that only supply text messages still render. The service always
   * sets it.
   */
  items?: TranscriptItem[];
  events: NormalizedEvent[];
}

export interface SessionActionResult {
  events: NormalizedEvent[];
}

/** Host session activity as shown by the chat screen. */
export type SessionStatus = 'idle' | 'busy';

/** A listed host model. Only these fields leave the service. */
export interface ModelChoice {
  providerID: string;
  modelID: string;
  label: string;
  variants: string[];
}

/**
 * A model reference without a label. Host `defaultModel` and `session.prompt`
 * use this shape; labels stay on `ModelChoice` rows.
 */
export interface ModelRef {
  providerID: string;
  modelID: string;
}

export interface ModelListResult {
  models: ModelChoice[];
  defaultModel: ModelRef | null;
}
