import { z } from 'zod';

export const ALLOWED_EVENT_NAMES = [
  'session.created',
  'session.updated',
  'session.deleted',
  'session.status',
  'session.idle',
  'session.error',
  'message.updated',
  'message.part.updated',
  'message.part.removed',
  'message.removed',
  'permission.asked',
  'permission.replied',
  'question.asked',
  'question.replied',
] as const;

export const allowedEventNameSchema = z.enum(ALLOWED_EVENT_NAMES);

export type AllowedEventName = z.infer<typeof allowedEventNameSchema>;

const ALLOWED_EVENT_NAME_SET: ReadonlySet<string> = new Set(ALLOWED_EVENT_NAMES);

export interface NormalizedEvent {
  name: AllowedEventName;
  properties: Record<string, unknown>;
}

const rawEventSchema = z.object({
  type: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export function isAllowedEvent(name: unknown): name is AllowedEventName {
  return typeof name === 'string' && ALLOWED_EVENT_NAME_SET.has(name);
}

export function normalizeEvent(raw: unknown): NormalizedEvent | null {
  const parsed = rawEventSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (!isAllowedEvent(parsed.data.type)) return null;
  return {
    name: parsed.data.type,
    properties: parsed.data.properties ?? {},
  };
}
