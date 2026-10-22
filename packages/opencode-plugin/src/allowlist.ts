import { ActionError, parseAction, permissionDecisionSchema } from '@coderelay/protocol';
import type { Action, ActionType, PermissionDecision } from '@coderelay/protocol';

export const ALLOWED_ACTION_TYPES = [
  'session.list',
  'session.status',
  'session.messages',
  'session.prompt',
  'session.abort',
  'permission.reply',
  'model.list',
] as const;

/**
 * The V2 operations (`@opencode/client@2.0.32`) serving the seven permitted
 * actions. Four actions are composites of two operations each; every name here
 * exists on the V2 client surface. Dispatch is deny-by-default, so no operation
 * outside this list can run: `session.switchModel` joins as an operation serving
 * the already-permitted `session.prompt` action, not as a new action.
 */
export const ALLOWED_SDK_METHODS = [
  'session.list',
  'session.active',
  'session.context',
  'session.switchModel',
  'session.prompt',
  'session.interrupt',
  'permission.reply',
  'model.list',
  'model.default',
] as const;

export type AllowedSdkMethod = (typeof ALLOWED_SDK_METHODS)[number];

/**
 * Host-effect operations (shell, command, file IO, MCP control, credential
 * mutation, generic RPC) and `session.move`, a workspace mutation that is not a
 * scope. Documentation-only: deny-by-default already refuses every name outside
 * `ALLOWED_SDK_METHODS` through `assertAllowedSdkMethod`, so this list adds no
 * second enforcement layer — it records what the security boundary keeps out,
 * and the allowlist tests consume it to hold that record true. Every name
 * exists on the V2 client surface.
 */
export const DENIED_SDK_METHODS = [
  'session.shell',
  'session.command',
  'session.move',
  'file.list',
  'file.read',
  'file.write',
  'mcp.add',
  'mcp.connect',
  'credential.create',
  'credential.update',
  'rpc.call',
] as const;

export class AllowlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllowlistError';
  }
}

/**
 * Boundary failure: the host call failed at the transport — the SDK returned an
 * `error` result or a result without `data` — or it returned a payload shape
 * that violates the operation's contract, such as a non-array list payload. Per
 * the clean-architecture contract a boundary exception and a contract-violating
 * payload shape are not domain errors, so they travel their own channel and are
 * never modeled as `AllowlistError`, which stays reserved for policy denials.
 */
export class HostCallFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostCallFailedError';
  }
}

/**
 * Minimal SDK response shape accepted at the host boundary. Request and
 * response metadata deliberately remain outside the CodeRelay protocol. Each
 * port call carries the V2 operation payload in `data`.
 */
export interface OpenCodeSdkResult {
  data?: unknown;
  error?: unknown;
}

/**
 * `session.list` options. The catalog enumerates one worktree at a time through
 * its established `query.directory` filter and `T2`'s adapter binds that filter
 * to the V2 `SessionListInput.directory` slot. The phone-facing `session.list`
 * action sends `{}` and is served from the catalog in the `session.list` branch
 * of `executeRoutedAction` in `gateway.ts`.
 */
export interface SessionListOptions {
  query?: { directory?: string };
}

/**
 * Session-keyed selection of one `session.active` entry for the status
 * composite. This is a dispatch selection key, not a transport field: V2
 * `session.active` takes no request payload.
 */
export interface SessionActiveOptions {
  sessionID: string;
}

/** V2 `SessionContextInput`. */
export interface SessionContextOptions {
  sessionID: string;
}

/**
 * V2 `Model.Ref`. `id` is the model id carried by `ModelInfo.modelID`; the
 * protocol action's `modelID` binds here.
 */
export interface ModelRef {
  id: string;
  providerID: string;
  variant?: string;
}

/** V2 `SessionSwitchModelInput`. */
export interface SessionSwitchModelOptions {
  sessionID: string;
  model: ModelRef;
}

/**
 * V2 `SessionPromptInput` reduced to the fields the phone sends. V2 has no
 * per-prompt `model`/`variant`: the selection rides `Model.Ref` on
 * `session.switchModel` and persists for later prompts.
 */
export interface SessionPromptOptions {
  sessionID: string;
  text: string;
}

/** V2 `SessionInterruptInput`; the optional `resume` slot is never sent. */
export interface SessionInterruptOptions {
  sessionID: string;
}

/**
 * V2 `PermissionReplyInput`: the protocol action's `permissionID` binds
 * `requestID` and the parsed `once | reject` decision binds `decision`. V2 also
 * parses `always`, which the protocol never produces.
 */
export interface PermissionReplyOptions {
  sessionID: string;
  requestID: string;
  decision: PermissionDecision;
}

/** V2 `ModelListInput` / `ModelDefaultInput` — the configured-provider lookup scope. */
export interface ModelLookupOptions {
  location?: { directory?: string };
}

export interface OpenCodeSessionApi {
  list(options?: SessionListOptions): Promise<OpenCodeSdkResult>;
  /** V2 `session.active` — a sessionID-keyed status map with no request payload. */
  active(): Promise<OpenCodeSdkResult>;
  context(options: SessionContextOptions): Promise<OpenCodeSdkResult>;
  switchModel(options: SessionSwitchModelOptions): Promise<OpenCodeSdkResult>;
  prompt(options: SessionPromptOptions): Promise<OpenCodeSdkResult>;
  interrupt(options: SessionInterruptOptions): Promise<OpenCodeSdkResult>;
}

export interface OpenCodeModelApi {
  list(options?: ModelLookupOptions): Promise<OpenCodeSdkResult>;
  default(options?: ModelLookupOptions): Promise<OpenCodeSdkResult>;
}

export interface OpenCodePermissionApi {
  reply(options: PermissionReplyOptions): Promise<OpenCodeSdkResult>;
}

export interface OpenCodeClientLike {
  session: OpenCodeSessionApi;
  model: OpenCodeModelApi;
  permission: OpenCodePermissionApi;
}

export interface AllowedActionResult {
  type: ActionType;
  value: unknown;
}

/** Both requests of the prompt composite; `variant` rides `Model.Ref`. */
export interface SessionPromptRequest {
  switchModel: SessionSwitchModelOptions;
  prompt: SessionPromptOptions;
}

export type SdkCallDescriptor =
  | { actionType: 'session.list'; sdkMethods: ['session.list']; options: SessionListOptions }
  | { actionType: 'session.status'; sdkMethods: ['session.active']; options: SessionActiveOptions }
  | { actionType: 'session.messages'; sdkMethods: ['session.context']; options: SessionContextOptions }
  | {
      actionType: 'session.prompt';
      sdkMethods: ['session.switchModel', 'session.prompt'];
      options: SessionPromptRequest;
    }
  | { actionType: 'session.abort'; sdkMethods: ['session.interrupt']; options: SessionInterruptOptions }
  | { actionType: 'permission.reply'; sdkMethods: ['permission.reply']; options: PermissionReplyOptions }
  | {
      actionType: 'model.list';
      sdkMethods: ['model.list', 'model.default'];
      options: ModelLookupOptions;
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

function toPromptCalls(action: Extract<Action, { type: 'session.prompt' }>): SessionPromptRequest {
  const model: ModelRef = { id: action.model.modelID, providerID: action.model.providerID };
  if (isNonEmptyString(action.model.variant)) model.variant = action.model.variant;
  return {
    switchModel: { sessionID: action.sessionID, model },
    prompt: { sessionID: action.sessionID, text: action.text },
  };
}

/**
 * Maps a permitted action onto the V2 operations that serve it. `directory` is
 * host-derived (in `executeRoutedAction` in `gateway.ts`) and threads only where
 * V2 exposes a slot: `location: { directory }` on `model.list`/`model.default`.
 * The five session-scoped rows and `session.list` carry no directory;
 * containment is enforced before dispatch by the catalog lookup in
 * `resolveSessionDirectory` in `gateway.ts`.
 * Policy denials return `AllowlistError` as a value; they are never thrown.
 */
export function toSdkCall(action: Action, directory?: string): SdkCallDescriptor | AllowlistError {
  switch (action.type) {
    case 'session.list':
      return { actionType: action.type, sdkMethods: ['session.list'], options: {} };
    case 'session.status':
      return {
        actionType: action.type,
        sdkMethods: ['session.active'],
        options: { sessionID: action.sessionID },
      };
    case 'session.messages':
      return {
        actionType: action.type,
        sdkMethods: ['session.context'],
        options: { sessionID: action.sessionID },
      };
    case 'session.prompt':
      return {
        actionType: action.type,
        sdkMethods: ['session.switchModel', 'session.prompt'],
        options: toPromptCalls(action),
      };
    case 'session.abort':
      return {
        actionType: action.type,
        sdkMethods: ['session.interrupt'],
        options: { sessionID: action.sessionID },
      };
    case 'permission.reply': {
      const body = toPermissionReplyBody(action.decision);
      if (body instanceof AllowlistError) {
        // Unreachable for a parsed Action: `decision` is already `once | reject`.
        // The guard keeps `toPermissionReplyBody` the single source of truth and
        // returns the denial as a value, never throws it.
        return body;
      }
      return {
        actionType: action.type,
        sdkMethods: ['permission.reply'],
        options: {
          sessionID: action.sessionID,
          requestID: action.permissionID,
          decision: body.response,
        },
      };
    }
    case 'model.list':
      return {
        actionType: action.type,
        sdkMethods: ['model.list', 'model.default'],
        options: isHostDirectory(directory) ? { location: { directory } } : {},
      };
  }
}

async function invokeSdkCall(
  client: OpenCodeClientLike,
  call: SdkCallDescriptor,
): Promise<OpenCodeSdkResult | HostCallFailedError> {
  switch (call.actionType) {
    case 'session.list':
      return client.session.list(call.options);
    case 'session.status': {
      const result = await client.session.active();
      if (result.error !== undefined || !('data' in result)) return result;
      const selected = selectStatusEntry(result.data, call.options.sessionID);
      if (selected instanceof HostCallFailedError) return selected;
      return { data: selected };
    }
    case 'session.messages': {
      const result = await client.session.context(call.options);
      if (result.error !== undefined || !('data' in result)) return result;
      return { data: composeMessageEnvelopes(result.data, call.options.sessionID) };
    }
    case 'session.prompt': {
      const switched = await client.session.switchModel(call.options.switchModel);
      if (switched.error !== undefined) return switched;
      return client.session.prompt(call.options.prompt);
    }
    case 'session.abort':
      return client.session.interrupt(call.options);
    case 'permission.reply':
      return client.permission.reply(call.options);
    case 'model.list': {
      const listed = await client.model.list(call.options);
      if (listed.error !== undefined || !('data' in listed)) return listed;
      const defaulted = await client.model.default(call.options);
      if (defaulted.error !== undefined || !('data' in defaulted)) return defaulted;
      return { data: { models: listed.data, defaultModel: defaulted.data } };
    }
  }
}

/**
 * Selects one `session.active` entry under the action's session key. A result
 * payload that is not a record violates the `session.active` contract and raises
 * the same boundary failure as its `projectMessages`/`projectModels` siblings;
 * a key absent from a valid record is a tolerated lookup miss and projects the
 * empty status.
 */
function selectStatusEntry(data: unknown, sessionID: string): unknown | HostCallFailedError {
  const record = readRecord(data);
  if (record === null) {
    return new HostCallFailedError('OpenCode session.active result must be a record');
  }
  return record[sessionID];
}

/**
 * V2 `session.context` returns flat `SessionMessageInfo` records: tool parts key
 * `name`/`time.created` and carry no per-message `sessionID`. Compose the
 * `{info, parts}` envelope the consumer projects, binding `sessionID` from the
 * request, and re-key parts onto the `projectActivityPart` vocabulary
 * (`name`→`tool`, `time.created`→`start`, `time.completed`→`end`).
 */
function composeMessageEnvelopes(data: unknown, sessionID: string): unknown {
  if (!Array.isArray(data)) return data;
  return data.flatMap((message) => composeMessageEnvelope(message, sessionID));
}

function composeMessageEnvelope(message: unknown, sessionID: string): unknown[] {
  const record = readRecord(message);
  if (record === null) return [];
  const id = record['id'];
  if (typeof id !== 'string') return [];
  const role = record['type'];
  if (role === 'user') {
    const text = record['text'];
    if (typeof text !== 'string') return [];
    return [{ info: { id, sessionID, role }, parts: [{ type: 'text', text }] }];
  }
  if (role === 'assistant') {
    const content = record['content'];
    if (!Array.isArray(content)) return [];
    return [{ info: { id, sessionID, role }, parts: content.map(rekeyPart) }];
  }
  return [];
}

function rekeyPart(part: unknown): unknown {
  const record = readRecord(part);
  if (record === null) return part;
  const rekeyed: Record<string, unknown> = { ...record };
  if (typeof record['name'] === 'string') rekeyed['tool'] = record['name'];
  const time = readRecord(record['time']);
  if (time !== null) {
    const next: Record<string, unknown> = {};
    const start = typeof time['start'] === 'number' ? time['start'] : time['created'];
    const end = typeof time['end'] === 'number' ? time['end'] : time['completed'];
    if (typeof start === 'number') next['start'] = start;
    if (typeof end === 'number') next['end'] = end;
    rekeyed['time'] = next;
  }
  return rekeyed;
}

function normalizeSdkResult(result: OpenCodeSdkResult): unknown | HostCallFailedError {
  if (result.error !== undefined) return new HostCallFailedError('OpenCode SDK request failed');
  if (!('data' in result)) {
    return new HostCallFailedError('OpenCode SDK result did not include data');
  }
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

function projectMessages(data: unknown): unknown | HostCallFailedError {
  if (!Array.isArray(data)) {
    return new HostCallFailedError('OpenCode session messages result must be an array');
  }
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

interface ModelEntry {
  providerID: string;
  modelID: string;
  name: unknown;
  variants: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function readVariantIds(variants: unknown): string[] {
  if (!Array.isArray(variants)) return [];
  return variants.flatMap((entry) => {
    const record = readRecord(entry);
    if (record === null || !isNonEmptyString(record['id'])) return [];
    return [record['id']];
  });
}

function readModelEntry(model: unknown): ModelEntry | null {
  const record = readRecord(model);
  if (record === null) return null;
  const providerID = record['providerID'];
  const modelID = record['modelID'];
  if (!isNonEmptyString(providerID) || !isNonEmptyString(modelID)) return null;
  return {
    providerID,
    modelID,
    name: record['name'],
    variants: readVariantIds(record['variants']),
  };
}

/**
 * Projects the configured-provider model set from V2 `ModelInfo[]` plus the
 * `model.default` selection. Only `providerID`/`modelID`/`name`/`variants[{id}]`
 * are read, so secrets in `settings`/`headers`/`body` never project. A default
 * outside the listed set projects as null.
 */
function projectModels(
  models: unknown,
  defaultModel: unknown,
): { models: ProjectedModel[]; defaultModel: { providerID: string; modelID: string } | null } | HostCallFailedError {
  if (!Array.isArray(models)) {
    return new HostCallFailedError('OpenCode model list result must be an array');
  }

  const projected: ProjectedModel[] = [];
  for (const model of models) {
    const entry = readModelEntry(model);
    if (entry === null) continue;
    projected.push({
      providerID: entry.providerID,
      modelID: entry.modelID,
      label: isNonEmptyString(entry.name) ? entry.name : entry.modelID,
      variants: entry.variants,
    });
  }

  let defaultPair: { providerID: string; modelID: string } | null = null;
  const defaultEntry = readModelEntry(defaultModel);
  if (defaultEntry !== null) {
    const listed = projected.some(
      (model) =>
        model.providerID === defaultEntry.providerID && model.modelID === defaultEntry.modelID,
    );
    if (listed) defaultPair = { providerID: defaultEntry.providerID, modelID: defaultEntry.modelID };
  }

  return { models: projected, defaultModel: defaultPair };
}

/**
 * Projects the non-`session.list` payloads onto the consumer shapes. The
 * projection never denies — policy denials happen on the request path before
 * dispatch — so this boundary returns only a projected value or the
 * `HostCallFailedError` raised when a payload violates its shape contract.
 */
function projectNonListActionResult(
  actionType: Exclude<ActionType, 'session.list'>,
  data: unknown,
): unknown | HostCallFailedError {
  switch (actionType) {
    case 'session.messages':
      return projectMessages(data);
    case 'session.status':
      return projectStatus(data);
    case 'session.prompt':
    case 'session.abort':
    case 'permission.reply':
      return null;
    case 'model.list': {
      const composed = readRecord(data);
      return projectModels(
        composed === null ? undefined : composed['models'],
        composed === null ? undefined : composed['defaultModel'],
      );
    }
  }
}

export async function executeAllowedAction(
  client: OpenCodeClientLike,
  action: Action,
  directory?: string,
): Promise<AllowedActionResult | AllowlistError | HostCallFailedError> {
  const call = toSdkCall(action, directory);
  if (call instanceof AllowlistError) return call;
  for (const method of call.sdkMethods) {
    const denied = assertAllowedSdkMethod(method);
    if (denied !== null) return denied;
  }
  const sdkResult = await invokeSdkCall(client, call);
  if (sdkResult instanceof HostCallFailedError) return sdkResult;
  const value = normalizeSdkResult(sdkResult);
  if (value instanceof HostCallFailedError) return value;
  if (call.actionType === 'session.list') return { type: call.actionType, value };
  const projected = projectNonListActionResult(call.actionType, value);
  if (projected instanceof HostCallFailedError) {
    return projected;
  }
  return { type: call.actionType, value: projected };
}

export async function executeRawAction(
  client: OpenCodeClientLike,
  raw: unknown,
  directory?: string,
): Promise<AllowedActionResult | ActionError | AllowlistError | HostCallFailedError> {
  const resolved = resolveRawAction(raw);
  if (resolved instanceof ActionError || resolved instanceof AllowlistError) return resolved;
  return executeAllowedAction(client, resolved, directory);
}
