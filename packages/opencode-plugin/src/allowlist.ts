import { ActionError, parseAction, permissionDecisionSchema } from '@coderelay/protocol';
import type { Action, ActionType, PermissionDecision } from '@coderelay/protocol';
import type { OpencodeClient } from '@opencode-ai/sdk';

export const ALLOWED_ACTION_TYPES = [
  'session.list',
  'session.status',
  'session.messages',
  'session.prompt',
  'session.abort',
  'permission.reply',
] as const;

export type AllowedActionType = (typeof ALLOWED_ACTION_TYPES)[number];

export const ALLOWED_SDK_METHODS = [
  'session.list',
  'session.status',
  'session.messages',
  'session.promptAsync',
  'session.abort',
  'postSessionIdPermissionsPermissionId',
] as const;

export type AllowedSdkMethod = (typeof ALLOWED_SDK_METHODS)[number];

export const DENIED_SDK_METHODS = [
  'session.shell',
  'session.command',
  'session.init',
  'file.list',
  'file.read',
  'file.status',
  'auth.set',
  'mcp.add',
  'mcp.connect',
  'provider.auth',
] as const;

export class AllowlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllowlistError';
  }
}

// Parameter shapes are derived from the real OpencodeClient so a wrong `path`
// or `body` key fails to compile, while the injectable subset stays structural.
type SessionApi = OpencodeClient['session'];

export type SessionListOptions = Parameters<SessionApi['list']>[0];
export type SessionStatusOptions = Parameters<SessionApi['status']>[0];
export type SessionMessagesOptions = Parameters<SessionApi['messages']>[0];
export type SessionPromptAsyncOptions = Parameters<SessionApi['promptAsync']>[0];
export type SessionAbortOptions = Parameters<SessionApi['abort']>[0];
export type PermissionReplyOptions = Parameters<
  OpencodeClient['postSessionIdPermissionsPermissionId']
>[0];

/**
 * Minimal SDK response shape accepted at the host boundary. Request and
 * response metadata deliberately remain outside the CodeRelay protocol.
 */
export interface OpenCodeSdkResult {
  data?: unknown;
  error?: unknown;
}

export interface OpenCodeSessionApi {
  list(options?: SessionListOptions): Promise<OpenCodeSdkResult>;
  status(options?: SessionStatusOptions): Promise<OpenCodeSdkResult>;
  messages(options: SessionMessagesOptions): Promise<OpenCodeSdkResult>;
  promptAsync(options: SessionPromptAsyncOptions): Promise<OpenCodeSdkResult>;
  abort(options: SessionAbortOptions): Promise<OpenCodeSdkResult>;
}

export interface OpenCodeClientLike {
  session: OpenCodeSessionApi;
  postSessionIdPermissionsPermissionId(options: PermissionReplyOptions): Promise<OpenCodeSdkResult>;
}

export interface AllowedActionResult {
  type: ActionType;
  value: unknown;
}

export type SdkCallDescriptor =
  | { actionType: 'session.list'; sdkMethod: 'session.list'; options: SessionListOptions }
  | { actionType: 'session.status'; sdkMethod: 'session.status'; options: SessionStatusOptions }
  | {
      actionType: 'session.messages';
      sdkMethod: 'session.messages';
      options: SessionMessagesOptions;
    }
  | {
      actionType: 'session.prompt';
      sdkMethod: 'session.promptAsync';
      options: SessionPromptAsyncOptions;
    }
  | { actionType: 'session.abort'; sdkMethod: 'session.abort'; options: SessionAbortOptions }
  | {
      actionType: 'permission.reply';
      sdkMethod: 'postSessionIdPermissionsPermissionId';
      options: PermissionReplyOptions;
    };

const ALLOWED_ACTION_TYPE_SET: ReadonlySet<string> = new Set(ALLOWED_ACTION_TYPES);
const ALLOWED_SDK_METHOD_SET: ReadonlySet<string> = new Set(ALLOWED_SDK_METHODS);

export function isAllowedActionType(name: unknown): name is ActionType {
  return typeof name === 'string' && ALLOWED_ACTION_TYPE_SET.has(name);
}

export function isAllowedSdkMethod(name: unknown): name is AllowedSdkMethod {
  return typeof name === 'string' && ALLOWED_SDK_METHOD_SET.has(name);
}

export function assertAllowedSdkMethod(name: unknown): AllowlistError | null {
  return isAllowedSdkMethod(name) ? null : new AllowlistError(`Denied SDK method: ${String(name)}`);
}

export function toPermissionReplyBody(
  decision: unknown,
): { response: PermissionDecision } | AllowlistError {
  const parsed = permissionDecisionSchema.safeParse(decision);
  if (!parsed.success) return new AllowlistError(`Denied permission decision: ${String(decision)}`);
  return { response: parsed.data };
}

export function resolveRawAction(raw: unknown): Action | ActionError | AllowlistError {
  const type = isUnknownRecord(raw) ? raw['type'] : undefined;
  if (!isAllowedActionType(type)) return new AllowlistError(`Denied action: ${String(type)}`);
  return parseAction(raw);
}

function isHostDirectory(directory: string | undefined): directory is string {
  return directory !== undefined && directory !== '';
}

export function toSdkCall(action: Action, directory?: string): SdkCallDescriptor {
  switch (action.type) {
    case 'session.list':
      return { actionType: action.type, sdkMethod: 'session.list', options: {} };
    case 'session.status':
      return {
        actionType: action.type,
        sdkMethod: 'session.status',
        options: {
          ...(isHostDirectory(directory) ? { query: { directory } } : {}),
        },
      };
    case 'session.messages':
      return {
        actionType: action.type,
        sdkMethod: 'session.messages',
        options: {
          path: { id: action.sessionID },
          ...(isHostDirectory(directory) ? { query: { directory } } : {}),
        },
      };
    case 'session.prompt':
      return {
        actionType: action.type,
        sdkMethod: 'session.promptAsync',
        options: {
          path: { id: action.sessionID },
          body: { parts: [{ type: 'text', text: action.text }] },
          ...(isHostDirectory(directory) ? { query: { directory } } : {}),
        },
      };
    case 'session.abort':
      return {
        actionType: action.type,
        sdkMethod: 'session.abort',
        options: {
          path: { id: action.sessionID },
          ...(isHostDirectory(directory) ? { query: { directory } } : {}),
        },
      };
    case 'permission.reply': {
      const body = toPermissionReplyBody(action.decision);
      if (body instanceof AllowlistError) {
        // Unreachable for a parsed Action: `decision` is already `once | reject`.
        // The guard keeps `toPermissionReplyBody` the single source of truth.
        throw body;
      }
      return {
        actionType: action.type,
        sdkMethod: 'postSessionIdPermissionsPermissionId',
        options: {
          path: { id: action.sessionID, permissionID: action.permissionID },
          body,
          ...(isHostDirectory(directory) ? { query: { directory } } : {}),
        },
      };
    }
  }
}

async function invokeSdkCall(
  client: OpenCodeClientLike,
  call: SdkCallDescriptor,
): Promise<OpenCodeSdkResult> {
  switch (call.sdkMethod) {
    case 'session.list':
      return client.session.list(call.options);
    case 'session.status':
      return client.session.status(call.options);
    case 'session.messages':
      return client.session.messages(call.options);
    case 'session.promptAsync':
      return client.session.promptAsync(call.options);
    case 'session.abort':
      return client.session.abort(call.options);
    case 'postSessionIdPermissionsPermissionId':
      return client.postSessionIdPermissionsPermissionId(call.options);
  }
}

function normalizeSdkResult(result: OpenCodeSdkResult): unknown | AllowlistError {
  if (result.error !== undefined) return new AllowlistError('OpenCode SDK request failed');
  if (!('data' in result)) return new AllowlistError('OpenCode SDK result did not include data');
  return result.data;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTextPart(value: unknown): value is { type: 'text'; text: string } {
  return isUnknownRecord(value) && value['type'] === 'text' && typeof value['text'] === 'string';
}

function projectMessages(data: unknown): unknown | AllowlistError {
  if (!Array.isArray(data)) return new AllowlistError('OpenCode session messages result must be an array');
  return data.flatMap((message) => {
    if (!isUnknownRecord(message) || !isUnknownRecord(message['info'])) return [];
    const info = message['info'];
    const id = info['id'];
    const sessionID = info['sessionID'];
    const role = info['role'];
    const parts = message['parts'];
    if (
      typeof id !== 'string' ||
      typeof sessionID !== 'string' ||
      (role !== 'user' && role !== 'assistant') ||
      !Array.isArray(parts)
    ) {
      return [];
    }
    return [
      {
        info: { id, sessionID, role },
        parts: parts.filter(isTextPart).map((part) => ({ type: part.type, text: part.text })),
      },
    ];
  });
}

function projectStatus(data: unknown): { type?: string } {
  if (!isUnknownRecord(data) || typeof data['type'] !== 'string') return {};
  return { type: data['type'] };
}

function projectNonListActionResult(
  actionType: Exclude<ActionType, 'session.list'>,
  data: unknown,
): unknown | AllowlistError {
  switch (actionType) {
    case 'session.messages':
      return projectMessages(data);
    case 'session.status':
      return projectStatus(data);
    case 'session.prompt':
    case 'session.abort':
    case 'permission.reply':
      return null;
  }
}

export async function executeAllowedAction(
  client: OpenCodeClientLike,
  action: Action,
  directory?: string,
): Promise<AllowedActionResult | AllowlistError> {
  const call = toSdkCall(action, directory);
  const denied = assertAllowedSdkMethod(call.sdkMethod);
  if (denied !== null) return denied;
  const value = normalizeSdkResult(await invokeSdkCall(client, call));
  if (value instanceof AllowlistError) return value;
  if (call.actionType === 'session.list') return { type: call.actionType, value };
  const projected = projectNonListActionResult(call.actionType, value);
  if (projected instanceof AllowlistError) return projected;
  return { type: call.actionType, value: projected };
}

export async function executeRawAction(
  client: OpenCodeClientLike,
  raw: unknown,
  directory?: string,
): Promise<AllowedActionResult | ActionError | AllowlistError> {
  const resolved = resolveRawAction(raw);
  if (resolved instanceof ActionError || resolved instanceof AllowlistError) return resolved;
  return executeAllowedAction(client, resolved, directory);
}
