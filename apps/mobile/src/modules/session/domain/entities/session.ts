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
