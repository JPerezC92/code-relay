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
  'model.list',
] as const;

export type AllowedActionType = (typeof ALLOWED_ACTION_TYPES)[number];

export const ALLOWED_SDK_METHODS = [
  'session.list',
  'session.status',
  'session.messages',
  'session.promptAsync',
  'session.abort',
  'postSessionIdPermissionsPermissionId',
  'provider.list',
  'config.providers',
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

/**
 * Local body for `session.promptAsync`. SDK 1.18.31 `SessionPromptAsyncData`
 * omits `variant`; server 1.18.35 `prompt_async` accepts it. This is not
 * `SessionPromptData`.
 */
interface PromptAsyncVariantBody {
  model?: {
    providerID: string;
    modelID: string;
  };
  parts: Array<{ type: 'text'; text: string }>;
  variant?: string;
}

interface PromptAsyncVariantCall {
  path: { id: string };
  body: PromptAsyncVariantBody;
  query?: { directory: string };
}
export type SessionAbortOptions = Parameters<SessionApi['abort']>[0];
export type PermissionReplyOptions = Parameters<
  OpencodeClient['postSessionIdPermissionsPermissionId']
>[0];
export type ProviderListOptions = Parameters<OpencodeClient['provider']['list']>[0];
export type ConfigProvidersOptions = Parameters<OpencodeClient['config']['providers']>[0];

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
  promptAsync(options: SessionPromptAsyncOptions | PromptAsyncVariantCall): Promise<OpenCodeSdkResult>;
  abort(options: SessionAbortOptions): Promise<OpenCodeSdkResult>;
}

export interface OpenCodeProviderApi {
  list(options?: ProviderListOptions): Promise<OpenCodeSdkResult>;
}

export interface OpenCodeConfigApi {
  providers(options?: ConfigProvidersOptions): Promise<OpenCodeSdkResult>;
}

export interface OpenCodeClientLike {
  session: OpenCodeSessionApi;
  provider: OpenCodeProviderApi;
  config: OpenCodeConfigApi;
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
      options: PromptAsyncVariantCall;
    }
  | { actionType: 'session.abort'; sdkMethod: 'session.abort'; options: SessionAbortOptions }
  | {
      actionType: 'permission.reply';
      sdkMethod: 'postSessionIdPermissionsPermissionId';
      options: PermissionReplyOptions;
    }
  | { actionType: 'model.list'; sdkMethod: 'config.providers'; options: ConfigProvidersOptions };

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
        options: toPromptAsyncCall(action, directory),
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
    case 'model.list':
      return { actionType: action.type, sdkMethod: 'config.providers', options: {} };
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
    case 'config.providers':
      return client.config.providers(call.options);
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

const FILE_ACTIVITY_TOOLS = new Set(['edit', 'write', 'apply_patch']);
const TOOL_OUTPUT_LIMIT = 12_000;

function readRecord(value: unknown): Record<string, unknown> | null {
  return isUnknownRecord(value) ? value : null;
}

function projectFileDiff(
  state: Record<string, unknown>,
  projected: Record<string, unknown>,
): void {
  const metadata = readRecord(state['metadata']);
  if (metadata === null) return;
  const filediff = readRecord(metadata['filediff']);
  if (typeof metadata['diff'] === 'string') {
    projected['diff'] = metadata['diff'];
  } else if (filediff !== null && typeof filediff['patch'] === 'string') {
    projected['diff'] = filediff['patch'];
  }
  if (filediff === null) return;
  if (typeof filediff['additions'] === 'number') projected['additions'] = filediff['additions'];
  if (typeof filediff['deletions'] === 'number') projected['deletions'] = filediff['deletions'];
}

function firstString(
  record: Record<string, unknown> | null,
  keys: readonly string[],
): string | undefined {
  if (record === null) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/**
 * Mobile-safe activity part. Text stays on the existing projector. File tools
 * omit output. Other tools keep a title and a string output only. Raw, cwd,
 * error objects, and prompt bodies are omitted.
 */
export function projectActivityPart(part: unknown): Record<string, unknown> | null {
  if (!isUnknownRecord(part)) return null;
  const id = typeof part['id'] === 'string'
    ? part['id']
    : typeof part['callID'] === 'string'
      ? part['callID']
      : null;
  if (id === null) return null;
  if (part['type'] === 'reasoning') {
    if (typeof part['text'] !== 'string') return null;
    const time = readRecord(part['time']);
    if (time === null || typeof time['start'] !== 'number') return null;
    const projectedTime: { start: number; end?: number } = { start: time['start'] };
    if (typeof time['end'] === 'number') projectedTime.end = time['end'];
    return { type: 'reasoning', id, text: part['text'], time: projectedTime };
  }
  if (part['type'] === 'patch') {
    if (!Array.isArray(part['files'])) return null;
    return {
      type: 'patch',
      id,
      files: part['files'].filter((file): file is string => typeof file === 'string'),
    };
  }
  if (part['type'] !== 'tool' || typeof part['tool'] !== 'string') return null;
  const tool = part['tool'];
  const state = readRecord(part['state']);
  if (state === null || typeof state['status'] !== 'string') return null;
  const projected: Record<string, unknown> = {
    type: 'tool',
    id,
    tool,
    status: state['status'],
  };
  if (typeof state['title'] === 'string') projected['title'] = state['title'];
  const input = readRecord(state['input']);
  if (FILE_ACTIVITY_TOOLS.has(tool)) {
    const path = firstString(input, ['filePath', 'path', 'file']);
    if (path !== undefined) projected['path'] = path;
    projectFileDiff(state, projected);
    return projected;
  }
  if (tool === 'task') {
    const agent = firstString(input, ['subagent_type', 'agent']);
    if (agent !== undefined) projected['agent'] = agent;
    const description = firstString(input, ['description']);
    if (description !== undefined) projected['description'] = description;
    const childSessionId = firstString(readRecord(state['metadata']), ['sessionId', 'sessionID']);
    if (childSessionId !== undefined) projected['childSessionId'] = childSessionId;
    return projected;
  }
  const command = firstString(input, ['command']);
  const title = typeof state['title'] === 'string'
    ? state['title']
    : command ?? tool;
  projected['title'] = title;
  const output = typeof state['output'] === 'string'
    ? state['output']
    : typeof state['error'] === 'string'
      ? state['error']
      : undefined;
  if (output !== undefined && output.length > 0) {
    projected['output'] = output.slice(0, TOOL_OUTPUT_LIMIT);
  }
  return projected;
}

function projectMessagePart(part: unknown): Record<string, unknown> | null {
  if (isTextPart(part)) return { type: part.type, text: part.text };
  return projectActivityPart(part);
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
        parts: parts.flatMap((part) => {
          const projected = projectMessagePart(part);
          return projected === null ? [] : [projected];
        }),
      },
    ];
  });
}

function projectStatus(data: unknown): { type?: string } {
  if (!isUnknownRecord(data) || typeof data['type'] !== 'string') return {};
  return { type: data['type'] };
}

interface ProjectedModel {
  providerID: string;
  modelID: string;
  label: string;
  variants: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function readVariantIds(variants: unknown): string[] {
  if (Array.isArray(variants)) {
    return variants.flatMap((entry) => {
      if (!isUnknownRecord(entry) || !isNonEmptyString(entry['id'])) return [];
      return [entry['id']];
    });
  }
  if (isUnknownRecord(variants)) {
    return Object.keys(variants).filter((id) => id.length > 0);
  }
  return [];
}

function readModelObjects(
  models: unknown,
): Array<{ id: string; name: unknown; variants: string[] }> {
  const entries = Array.isArray(models) ? models : isUnknownRecord(models) ? Object.values(models) : [];
  return entries.flatMap((model) => {
    if (!isUnknownRecord(model) || !isNonEmptyString(model['id'])) return [];
    return [{ id: model['id'], name: model['name'], variants: readVariantIds(model['variants']) }];
  });
}

function toPromptAsyncCall(action: Extract<Action, { type: 'session.prompt' }>, directory?: string): PromptAsyncVariantCall {
  const body: PromptAsyncVariantBody = {
    model: { providerID: action.model.providerID, modelID: action.model.modelID },
    parts: [{ type: 'text', text: action.text }],
  };
  if (isNonEmptyString(action.model.variant)) {
    body.variant = action.model.variant;
  }
  return {
    path: { id: action.sessionID },
    body,
    ...(isHostDirectory(directory) ? { query: { directory } } : {}),
  };
}

function projectModels(
  data: unknown,
): { models: ProjectedModel[]; defaultModel: { providerID: string; modelID: string } | null } | AllowlistError {
  if (!isUnknownRecord(data)) {
    return new AllowlistError('OpenCode provider list result must include a provider array');
  }
  const providers = data['providers'];
  if (!Array.isArray(providers)) {
    return new AllowlistError('OpenCode provider list result must include a provider array');
  }

  const models: ProjectedModel[] = [];
  for (const provider of providers) {
    if (!isUnknownRecord(provider) || !isNonEmptyString(provider['id'])) continue;
    const providerID = provider['id'];
    for (const model of readModelObjects(provider['models'])) {
      models.push({
        providerID,
        modelID: model.id,
        label: isNonEmptyString(model.name) ? model.name : model.id,
        variants: model.variants,
      });
    }
  }

  const hostDefault = data['default'];
  let defaultModel: { providerID: string; modelID: string } | null = null;
  if (isUnknownRecord(hostDefault)) {
    for (const [providerID, modelID] of Object.entries(hostDefault)) {
      if (!isNonEmptyString(providerID) || !isNonEmptyString(modelID)) continue;
      const listed = models.some((model) => model.providerID === providerID && model.modelID === modelID);
      if (!listed) continue;
      defaultModel = { providerID, modelID };
      break;
    }
  }

  return { models, defaultModel };
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
    case 'model.list':
      return projectModels(data);
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
