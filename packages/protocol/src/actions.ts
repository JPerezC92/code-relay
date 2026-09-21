import { z } from 'zod';

export const PERMISSION_DECISIONS = ['once', 'reject'] as const;

export const permissionDecisionSchema = z.enum(PERMISSION_DECISIONS);

export type PermissionDecision = z.infer<typeof permissionDecisionSchema>;

const sessionListActionSchema = z.strictObject({
  type: z.literal('session.list'),
});

const sessionStatusActionSchema = z.strictObject({
  type: z.literal('session.status'),
  sessionID: z.string().min(1),
});

const sessionMessagesActionSchema = z.strictObject({
  type: z.literal('session.messages'),
  sessionID: z.string().min(1),
});

const sessionPromptActionSchema = z.strictObject({
  type: z.literal('session.prompt'),
  sessionID: z.string().min(1),
  text: z.string().min(1),
});

const sessionAbortActionSchema = z.strictObject({
  type: z.literal('session.abort'),
  sessionID: z.string().min(1),
});

const permissionReplyActionSchema = z.strictObject({
  type: z.literal('permission.reply'),
  sessionID: z.string().min(1),
  permissionID: z.string().min(1),
  decision: permissionDecisionSchema,
});

export const actionSchema = z.discriminatedUnion('type', [
  sessionListActionSchema,
  sessionStatusActionSchema,
  sessionMessagesActionSchema,
  sessionPromptActionSchema,
  sessionAbortActionSchema,
  permissionReplyActionSchema,
]);

export type Action = z.infer<typeof actionSchema>;

export type ActionType = Action['type'];

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}

function decodeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function parseAction(raw: unknown): Action | ActionError {
  const candidate = typeof raw === 'string' ? decodeJson(raw) : raw;
  const parsed = actionSchema.safeParse(candidate);
  if (!parsed.success) return new ActionError(parsed.error.message);
  return parsed.data;
}
