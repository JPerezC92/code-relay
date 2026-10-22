import { describe, expect, it, vi } from 'vitest';
import { ActionError } from '@coderelay/protocol';
import type { Action } from '@coderelay/protocol';
import {
  ALLOWED_ACTION_TYPES,
  ALLOWED_SDK_METHODS,
  AllowlistError,
  DENIED_SDK_METHODS,
  HostCallFailedError,
  assertAllowedSdkMethod,
  executeAllowedAction,
  executeRawAction,
  isAllowedSdkMethod,
  toPermissionReplyBody,
  toSdkCall,
} from './allowlist';
import type {
  AllowedActionResult,
  ModelLookupOptions,
  OpenCodeClientLike,
  OpenCodeSdkResult,
  PermissionReplyOptions,
  SessionContextOptions,
  SessionInterruptOptions,
  SessionListOptions,
  SessionPromptOptions,
  SessionSwitchModelOptions,
} from './allowlist';

const ALPHA_DIRECTORY = '/home/user/proj-alpha';
const PROMPT_MODEL = { providerID: 'openai', modelID: 'gpt-test' };

function createClient() {
  const list = vi.fn(async (_options?: SessionListOptions): Promise<OpenCodeSdkResult> => ({
    data: [],
    error: undefined,
  }));
  const active = vi.fn(async (): Promise<OpenCodeSdkResult> => ({
    data: {},
    error: undefined,
  }));
  const context = vi.fn(async (_options: SessionContextOptions): Promise<OpenCodeSdkResult> => ({
    data: [],
    error: undefined,
  }));
  const switchModel = vi.fn(
    async (_options: SessionSwitchModelOptions): Promise<OpenCodeSdkResult> => ({
      data: undefined,
      error: undefined,
    }),
  );
  const prompt = vi.fn(async (_options: SessionPromptOptions): Promise<OpenCodeSdkResult> => ({
    data: undefined,
    error: undefined,
  }));
  const interrupt = vi.fn(async (_options: SessionInterruptOptions): Promise<OpenCodeSdkResult> => ({
    data: true,
    error: undefined,
  }));
  const permissionReply = vi.fn(
    async (_options: PermissionReplyOptions): Promise<OpenCodeSdkResult> => ({
      data: true,
      error: undefined,
    }),
  );
  const modelList = vi.fn(async (_options?: ModelLookupOptions): Promise<OpenCodeSdkResult> => ({
    data: [],
    error: undefined,
  }));
  const modelDefault = vi.fn(async (_options?: ModelLookupOptions): Promise<OpenCodeSdkResult> => ({
    data: null,
    error: undefined,
  }));
  const client: OpenCodeClientLike = {
    session: { list, active, context, switchModel, prompt, interrupt },
    model: { list: modelList, default: modelDefault },
    permission: { reply: permissionReply },
  };
  return {
    client,
    list,
    active,
    context,
    switchModel,
    prompt,
    interrupt,
    permissionReply,
    modelList,
    modelDefault,
  };
}

describe('allowlist', () => {
  it('allows exactly the seven actions and the V2 operations serving them', () => {
    expect(ALLOWED_ACTION_TYPES).toStrictEqual([
      'session.list',
      'session.status',
      'session.messages',
      'session.prompt',
      'session.abort',
      'permission.reply',
      'model.list',
    ]);
    expect(ALLOWED_SDK_METHODS).toStrictEqual([
      'session.list',
      'session.active',
      'session.context',
      'session.switchModel',
      'session.prompt',
      'session.interrupt',
      'permission.reply',
      'model.list',
      'model.default',
    ]);
    for (const method of ALLOWED_SDK_METHODS) {
      expect(isAllowedSdkMethod(method)).toBe(true);
    }
  });

  it('denies the V1 method names and provider.list on the V2 surface', () => {
    for (const method of [
      'session.status',
      'session.messages',
      'session.promptAsync',
      'session.abort',
      'postSessionIdPermissionsPermissionId',
      'provider.list',
      'config.providers',
    ]) {
      expect(isAllowedSdkMethod(method)).toBe(false);
    }
  });

  it('denies shell, file, and auth SDK methods', () => {
    for (const method of [
      'session.shell',
      'session.command',
      'file.read',
      'file.list',
      'file.status',
      'auth.set',
      'mcp.add',
      'provider.auth',
    ]) {
      expect(isAllowedSdkMethod(method)).toBe(false);
    }
  });

  it('keeps the denied SDK method list truthful documentation under deny-by-default', () => {
    for (const method of DENIED_SDK_METHODS) {
      expect(isAllowedSdkMethod(method)).toBe(false);
      expect(assertAllowedSdkMethod(method)).toBeInstanceOf(AllowlistError);
    }
    for (const method of ALLOWED_SDK_METHODS) {
      expect(DENIED_SDK_METHODS).not.toContain(method);
    }
  });

  it('returns a typed deny error for shell, file, and auth actions', async () => {
    const { client } = createClient();
    const denied = [
      { type: 'session.shell', sessionID: 's1', command: 'rm -rf /' },
      { type: 'file.read', path: '/etc/passwd' },
      { type: 'auth.set', providerID: 'openai', key: 'sk-secret' },
      { type: 'mcp.add', name: 'evil' },
    ];
    for (const raw of denied) {
      const result = await executeRawAction(client, raw);
      expect(result).toBeInstanceOf(AllowlistError);
    }
  });

  it('raises AllowlistError for every action type outside the permitted seven', async () => {
    const { client } = createClient();
    const denied = [
      { type: 'session.get', sessionID: 's1' },
      { type: 'session.context', sessionID: 's1' },
      { type: 'session.interrupt', sessionID: 's1' },
      { type: 'session.active', sessionID: 's1' },
      { type: 'session.switchModel', sessionID: 's1' },
      { type: 'model.default' },
      { type: 'session.move', sessionID: 's1', directory: '/host' },
    ];
    for (const raw of denied) {
      expect(await executeRawAction(client, raw)).toBeInstanceOf(AllowlistError);
    }
  });

  it('maps only approve-once and reject permission decisions', () => {
    expect(toPermissionReplyBody('once')).toStrictEqual({ response: 'once' });
    expect(toPermissionReplyBody('reject')).toStrictEqual({ response: 'reject' });
    expect(toPermissionReplyBody('always')).toBeInstanceOf(AllowlistError);
    expect(toPermissionReplyBody('remember')).toBeInstanceOf(AllowlistError);
  });

  it('rejects always at the raw action parse layer', async () => {
    const { client } = createClient();
    const result = await executeRawAction(client, {
      type: 'permission.reply',
      sessionID: 's1',
      permissionID: 'p1',
      decision: 'always',
    });
    expect(result).toBeInstanceOf(ActionError);
  });

  it('executes an allowlisted prompt through switchModel and prompt with text parts', async () => {
    const mocks = createClient();
    const result = await executeAllowedAction(mocks.client, {
      type: 'session.prompt',
      sessionID: 's1',
      text: 'hello',
      model: PROMPT_MODEL,
    });
    expect(result).toStrictEqual({ type: 'session.prompt', value: null });
    expect(mocks.switchModel).toHaveBeenCalledWith({
      sessionID: 's1',
      model: { id: 'gpt-test', providerID: 'openai' },
    });
    expect(mocks.prompt).toHaveBeenCalledWith({ sessionID: 's1', text: 'hello' });
  });

  it('keeps the existing raw session.list result behavior', async () => {
    const mocks = createClient();
    const sessions = [{ id: 'session-1' }];
    mocks.list.mockResolvedValue({ data: sessions, error: undefined });

    await expect(executeAllowedAction(mocks.client, { type: 'session.list' })).resolves.toStrictEqual({
      type: 'session.list',
      value: sessions,
    });
  });

  it('projects session messages to the mobile-safe info and text-part shape', async () => {
    const mocks = createClient();
    mocks.context.mockResolvedValue({
      data: [
        {
          id: 'message-1',
          type: 'assistant',
          sessionID: 'session-1',
          path: { cwd: '/host/project', root: '/host' },
          metadata: { private: true },
          projectID: 'project-1',
          directory: '/host/project',
          content: [
            { type: 'text', text: 'Safe reply', metadata: { private: true } },
            { type: 'tool', path: { cwd: '/host/project' } },
          ],
        },
      ],
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, {
      type: 'session.messages',
      sessionID: 'session-1',
    });
    expect(result).toStrictEqual({
      type: 'session.messages',
      value: [
        {
          info: { id: 'message-1', sessionID: 'session-1', role: 'assistant' },
          parts: [{ type: 'text', text: 'Safe reply' }],
        },
      ],
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of ['cwd', 'root', 'path', 'metadata', 'projectID', 'directory']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('projects reasoning, edit, patch, and task parts without tool output or cwd', async () => {
    const mocks = createClient();
    mocks.context.mockResolvedValue({
      data: [
        {
          id: 'message-1',
          type: 'assistant',
          content: [
            {
              type: 'reasoning',
              id: 'reason-1',
              text: 'Reasoning text',
              time: { created: 5, completed: 15, extra: true },
            },
            {
              type: 'tool',
              id: 'edit-1',
              name: 'edit',
              cwd: '/secret/cwd',
              state: {
                status: 'completed',
                title: 'Update file',
                input: { filePath: '/host/project/file.ts', path: '/ignored.ts' },
                output: 'LEAKED_TOOL_RESULT',
                raw: 'LEAKED_RAW',
                error: 'LEAKED_ERROR',
              },
            },
            {
              type: 'patch',
              id: 'patch-1',
              files: ['/host/project/patched.ts', 1, { path: '/nope' }],
            },
            {
              type: 'tool',
              id: 'task-1',
              name: 'task',
              state: {
                status: 'running',
                title: 'Explore',
                input: {
                  subagent_type: 'explore',
                  agent: 'ignored-agent',
                  description: 'Find files',
                  prompt: 'LEAKED_PROMPT_BODY',
                },
                metadata: { sessionId: 'child-ses-1', sessionID: 'ignored-session' },
                output: 'LEAKED_TOOL_RESULT',
              },
            },
            {
              type: 'tool',
              callID: 'task-call',
              name: 'task',
              state: {
                status: 'completed',
                title: 'Fix hook mapping leak',
                input: { subagent_type: 'forge' },
                metadata: { sessionID: 'child-from-call' },
              },
            },
            {
              type: 'tool',
              id: 'bash-1',
              name: 'bash',
              cwd: '/secret/cwd',
              state: {
                status: 'completed',
                title: 'ls',
                input: { command: 'ls', cwd: '/secret/cwd' },
                output: 'listed files',
                raw: 'LEAKED_RAW',
                error: { message: 'LEAKED_ERROR' },
              },
            },
          ],
        },
      ],
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, {
      type: 'session.messages',
      sessionID: 'session-1',
    });
    expect(result).toStrictEqual({
      type: 'session.messages',
      value: [
        {
          info: { id: 'message-1', sessionID: 'session-1', role: 'assistant' },
          parts: [
            {
              type: 'reasoning',
              id: 'reason-1',
              text: 'Reasoning text',
              time: { start: 5, end: 15 },
            },
            {
              type: 'tool',
              id: 'edit-1',
              tool: 'edit',
              status: 'completed',
              title: 'Update file',
              path: '/host/project/file.ts',
            },
            { type: 'patch', id: 'patch-1', files: ['/host/project/patched.ts'] },
            {
              type: 'tool',
              id: 'task-1',
              tool: 'task',
              status: 'running',
              title: 'Explore',
              agent: 'explore',
              description: 'Find files',
              childSessionId: 'child-ses-1',
            },
            {
              type: 'tool',
              id: 'task-call',
              tool: 'task',
              status: 'completed',
              title: 'Fix hook mapping leak',
              agent: 'forge',
              childSessionId: 'child-from-call',
            },
            {
              type: 'tool',
              id: 'bash-1',
              tool: 'bash',
              status: 'completed',
              title: 'ls',
              output: 'listed files',
            },
          ],
        },
      ],
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      'LEAKED_TOOL_RESULT',
      'LEAKED_RAW',
      'LEAKED_ERROR',
      'LEAKED_PROMPT_BODY',
      '/secret/cwd',
      'cwd',
      'directory',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('projects edit metadata.diff and filediff counts without oldString', async () => {
    const mocks = createClient();
    const diff = '@@ -1 +1 @@\n-removed line\n+added line\n';
    mocks.context.mockResolvedValue({
      data: [
        {
          id: 'message-1',
          type: 'assistant',
          content: [
            {
              type: 'tool',
              id: 'edit-1',
              name: 'edit',
              state: {
                status: 'completed',
                title: 'Update file',
                input: {
                  filePath: '/host/project/file.ts',
                  oldString: 'LEAKED_OLD_STRING',
                  newString: 'LEAKED_NEW_STRING',
                },
                output: 'LEAKED_TOOL_RESULT',
                metadata: {
                  diff,
                  diagnostics: [{ message: 'LEAKED_DIAGNOSTIC' }],
                  filediff: { additions: 1, deletions: 1, patch: 'ignored patch' },
                },
              },
            },
            {
              type: 'tool',
              id: 'write-1',
              name: 'write',
              state: {
                status: 'completed',
                input: { filePath: '/host/project/new.ts', oldString: 'LEAKED_OLD_STRING' },
                metadata: {
                  filediff: {
                    patch: '@@ -0,0 +1 @@\n+created\n',
                    additions: 2,
                    deletions: 0,
                    diagnostics: ['LEAKED_DIAGNOSTIC'],
                  },
                },
              },
            },
          ],
        },
      ],
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, {
      type: 'session.messages',
      sessionID: 'session-1',
    });

    expect(result).toStrictEqual({
      type: 'session.messages',
      value: [
        {
          info: { id: 'message-1', sessionID: 'session-1', role: 'assistant' },
          parts: [
            {
              type: 'tool',
              id: 'edit-1',
              tool: 'edit',
              status: 'completed',
              title: 'Update file',
              path: '/host/project/file.ts',
              diff,
              additions: 1,
              deletions: 1,
            },
            {
              type: 'tool',
              id: 'write-1',
              tool: 'write',
              status: 'completed',
              path: '/host/project/new.ts',
              diff: '@@ -0,0 +1 @@\n+created\n',
              additions: 2,
              deletions: 0,
            },
          ],
        },
      ],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).toContain(JSON.stringify(diff).slice(1, -1));
    expect(serialized).not.toContain('oldString');
    expect(serialized).not.toContain('LEAKED_OLD_STRING');
    expect(serialized).not.toContain('newString');
    expect(serialized).not.toContain('LEAKED_NEW_STRING');
    expect(serialized).not.toContain('LEAKED_DIAGNOSTIC');
    expect(serialized).not.toContain('diagnostics');
  });

  it('projects bash, read, and grep without cwd, raw, or a duplicate command', async () => {
    const mocks = createClient();
    const longOutput = 'x'.repeat(12_001);
    mocks.context.mockResolvedValue({
      data: [
        {
          id: 'message-1',
          type: 'assistant',
          content: [
            {
              type: 'tool',
              id: 'bash-title',
              name: 'bash',
              cwd: '/secret/cwd',
              state: {
                status: 'completed',
                title: 'ls',
                input: { command: 'ls -la', cwd: '/secret/cwd' },
                output: 'listed',
                raw: 'LEAKED_RAW',
              },
            },
            {
              type: 'tool',
              id: 'bash-command',
              name: 'bash',
              state: {
                status: 'completed',
                input: { command: 'pwd' },
                error: { message: 'LEAKED_ERROR_OBJECT' },
              },
            },
            {
              type: 'tool',
              id: 'bash-error',
              name: 'bash',
              state: { status: 'error', error: 'command failed' },
            },
            {
              type: 'tool',
              id: 'bash-long',
              name: 'bash',
              state: { status: 'completed', title: 'cat', output: longOutput },
            },
            {
              type: 'tool',
              id: 'read-1',
              name: 'read',
              state: { status: 'completed', title: 'Read file' },
            },
            {
              type: 'tool',
              id: 'grep-1',
              name: 'grep',
              state: { status: 'completed', output: 'match' },
            },
          ],
        },
      ],
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, {
      type: 'session.messages',
      sessionID: 'session-1',
    });

    expect(result).toStrictEqual({
      type: 'session.messages',
      value: [
        {
          info: { id: 'message-1', sessionID: 'session-1', role: 'assistant' },
          parts: [
            {
              type: 'tool',
              id: 'bash-title',
              tool: 'bash',
              status: 'completed',
              title: 'ls',
              output: 'listed',
            },
            {
              type: 'tool',
              id: 'bash-command',
              tool: 'bash',
              status: 'completed',
              title: 'pwd',
            },
            {
              type: 'tool',
              id: 'bash-error',
              tool: 'bash',
              status: 'error',
              title: 'bash',
              output: 'command failed',
            },
            {
              type: 'tool',
              id: 'bash-long',
              tool: 'bash',
              status: 'completed',
              title: 'cat',
              output: 'x'.repeat(12_000),
            },
            {
              type: 'tool',
              id: 'read-1',
              tool: 'read',
              status: 'completed',
              title: 'Read file',
            },
            {
              type: 'tool',
              id: 'grep-1',
              tool: 'grep',
              status: 'completed',
              title: 'grep',
              output: 'match',
            },
          ],
        },
      ],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('cwd');
    expect(serialized).not.toContain('LEAKED_RAW');
    expect(serialized).not.toContain('LEAKED_ERROR_OBJECT');
    expect(serialized).not.toContain('ls -la');
    expect(serialized).not.toContain(longOutput);
  });

  it('skips malformed session message records and keeps valid ones', async () => {
    const mocks = createClient();
    mocks.context.mockResolvedValue({
      data: [
        null,
        { type: 'assistant', content: [] },
        { id: 'wrong-role', type: 'system', text: 'ignored' },
        { id: 'invalid-text', type: 'user', text: {} },
        { id: 'invalid-content', type: 'assistant', content: {} },
        {
          id: 'message-1',
          type: 'user',
          text: 'Safe text',
        },
      ],
      error: undefined,
    });

    await expect(
      executeAllowedAction(mocks.client, { type: 'session.messages', sessionID: 'session-1' }),
    ).resolves.toStrictEqual({
      type: 'session.messages',
      value: [
        {
          info: { id: 'message-1', sessionID: 'session-1', role: 'user' },
          parts: [{ type: 'text', text: 'Safe text' }],
        },
      ],
    });
  });

  it('returns HostCallFailedError for non-array session messages data, never modeled as a denial', async () => {
    const mocks = createClient();
    mocks.context.mockResolvedValue({
      data: { path: { cwd: '/host/project', root: '/host' } },
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, {
      type: 'session.messages',
      sessionID: 'session-1',
    });
    expect(result).toBeInstanceOf(HostCallFailedError);
    expect(result).not.toBeInstanceOf(AllowlistError);
    if (result instanceof HostCallFailedError) {
      expect(result.message).toBe('OpenCode session messages result must be an array');
    }
  });

  it('projects session status to its string type only', async () => {
    const mocks = createClient();
    mocks.active.mockResolvedValue({
      data: {
        'session-1': {
          type: 'busy',
          path: { cwd: '/host/project', root: '/host' },
          metadata: { private: true },
        },
      },
      error: undefined,
    });

    await expect(
      executeAllowedAction(mocks.client, { type: 'session.status', sessionID: 'session-1' }),
    ).resolves.toStrictEqual({ type: 'session.status', value: { type: 'busy' } });

    mocks.active.mockResolvedValue({
      data: { 'session-1': { path: { cwd: '/host/project', root: '/host' } } },
      error: undefined,
    });
    await expect(
      executeAllowedAction(mocks.client, { type: 'session.status', sessionID: 'session-1' }),
    ).resolves.toStrictEqual({ type: 'session.status', value: {} });
  });

  it('projects the entry under the action session key and ignores other keyed entries', async () => {
    const mocks = createClient();
    mocks.active.mockResolvedValue({
      data: {
        'session-1': {
          type: 'busy',
          path: { cwd: '/host/project', root: '/host' },
          metadata: { private: true },
        },
        'session-2': { type: 'idle' },
      },
      error: undefined,
    });

    await expect(
      executeAllowedAction(mocks.client, { type: 'session.status', sessionID: 'session-2' }),
    ).resolves.toStrictEqual({ type: 'session.status', value: { type: 'idle' } });
  });

  it('returns the empty status when the action session key is absent from the map', async () => {
    const mocks = createClient();
    mocks.active.mockResolvedValue({
      data: {
        'session-2': { type: 'busy', path: { cwd: '/host/project', root: '/host' } },
      },
      error: undefined,
    });

    await expect(
      executeAllowedAction(mocks.client, { type: 'session.status', sessionID: 'session-1' }),
    ).resolves.toStrictEqual({ type: 'session.status', value: {} });
  });

  it('returns HostCallFailedError for non-record session.active data, never modeled as a denial', async () => {
    const mocks = createClient();
    mocks.active.mockResolvedValue({ data: 'not-a-status-map', error: undefined });

    const result = await executeAllowedAction(mocks.client, {
      type: 'session.status',
      sessionID: 'session-1',
    });
    expect(result).toBeInstanceOf(HostCallFailedError);
    expect(result).not.toBeInstanceOf(AllowlistError);
    if (result instanceof HostCallFailedError) {
      expect(result.message).toBe('OpenCode session.active result must be a record');
    }
    expect(mocks.active).toHaveBeenCalledWith();
  });

  it('returns null for prompt, abort, and permission replies regardless of SDK data', async () => {
    const mocks = createClient();
    const rawData = {
      path: { cwd: '/host/project', root: '/host' },
      metadata: { private: true },
    };
    mocks.switchModel.mockResolvedValue({ data: rawData, error: undefined });
    mocks.prompt.mockResolvedValue({ data: rawData, error: undefined });
    mocks.interrupt.mockResolvedValue({ data: rawData, error: undefined });
    mocks.permissionReply.mockResolvedValue({ data: rawData, error: undefined });

    await expect(
      executeAllowedAction(mocks.client, {
        type: 'session.prompt',
        sessionID: 'session-1',
        text: 'Hello',
        model: PROMPT_MODEL,
      }),
    ).resolves.toStrictEqual({ type: 'session.prompt', value: null });
    await expect(
      executeAllowedAction(mocks.client, { type: 'session.abort', sessionID: 'session-1' }),
    ).resolves.toStrictEqual({ type: 'session.abort', value: null });
    await expect(
      executeAllowedAction(mocks.client, {
        type: 'permission.reply',
        sessionID: 'session-1',
        permissionID: 'permission-1',
        decision: 'once',
      }),
    ).resolves.toStrictEqual({ type: 'permission.reply', value: null });
  });

  it('returns HostCallFailedError for SDK errors or absent data, never modeled as a denial', async () => {
    const mocks = createClient();
    mocks.client.session.list = async () => ({
      data: undefined,
      error: { message: 'SDK failed' },
    });

    const errorResult = await executeAllowedAction(mocks.client, { type: 'session.list' });
    expect(errorResult).toBeInstanceOf(HostCallFailedError);
    expect(errorResult).not.toBeInstanceOf(AllowlistError);
    if (errorResult instanceof HostCallFailedError) {
      expect(errorResult.message).toBe('OpenCode SDK request failed');
    }
    expect(errorResult).not.toHaveProperty('value');

    mocks.client.session.list = async () => ({ error: undefined });
    const missingDataResult = await executeAllowedAction(mocks.client, { type: 'session.list' });
    expect(missingDataResult).toBeInstanceOf(HostCallFailedError);
    expect(missingDataResult).not.toBeInstanceOf(AllowlistError);
    if (missingDataResult instanceof HostCallFailedError) {
      expect(missingDataResult.message).toBe('OpenCode SDK result did not include data');
    }
    expect(missingDataResult).not.toHaveProperty('value');
  });

  it('sends a permission reply as an once or reject body only', async () => {
    const mocks = createClient();
    await executeAllowedAction(mocks.client, {
      type: 'permission.reply',
      sessionID: 's1',
      permissionID: 'p1',
      decision: 'reject',
    });
    expect(mocks.permissionReply).toHaveBeenCalledWith({
      sessionID: 's1',
      requestID: 'p1',
      decision: 'reject',
    });
  });

  it('maps protocol actions to allowlisted V2 calls with typed options', () => {
    expect(
      toSdkCall({ type: 'session.prompt', sessionID: 's1', text: 'hi', model: PROMPT_MODEL }),
    ).toStrictEqual({
      actionType: 'session.prompt',
      sdkMethods: ['session.switchModel', 'session.prompt'],
      options: {
        switchModel: { sessionID: 's1', model: { id: 'gpt-test', providerID: 'openai' } },
        prompt: { sessionID: 's1', text: 'hi' },
      },
    });
    expect(toSdkCall({ type: 'session.abort', sessionID: 's1' })).toStrictEqual({
      actionType: 'session.abort',
      sdkMethods: ['session.interrupt'],
      options: { sessionID: 's1' },
    });
    expect(
      toSdkCall({
        type: 'permission.reply',
        sessionID: 's1',
        permissionID: 'p1',
        decision: 'once',
      }),
    ).toStrictEqual({
      actionType: 'permission.reply',
      sdkMethods: ['permission.reply'],
      options: { sessionID: 's1', requestID: 'p1', decision: 'once' },
    });
    expect(toSdkCall({ type: 'session.messages', sessionID: 's1' })).toStrictEqual({
      actionType: 'session.messages',
      sdkMethods: ['session.context'],
      options: { sessionID: 's1' },
    });
    expect(toSdkCall({ type: 'session.status', sessionID: 's1' })).toStrictEqual({
      actionType: 'session.status',
      sdkMethods: ['session.active'],
      options: { sessionID: 's1' },
    });
    expect(toSdkCall({ type: 'session.list' })).toStrictEqual({
      actionType: 'session.list',
      sdkMethods: ['session.list'],
      options: {},
    });
  });

  it('returns the permission denial as a value from toSdkCall and never throws it', () => {
    const poisoned = {
      type: 'permission.reply',
      sessionID: 's1',
      permissionID: 'p1',
      decision: 'always',
    } as unknown as Action;

    expect(() => toSdkCall(poisoned)).not.toThrow();
    const result = toSdkCall(poisoned);
    expect(result).toBeInstanceOf(AllowlistError);
    if (result instanceof AllowlistError) {
      expect(result.message).toBe('Denied permission decision: always');
    }
  });

  it('returns the toSdkCall denial from executeAllowedAction without dispatching', async () => {
    const mocks = createClient();
    const poisoned = {
      type: 'permission.reply',
      sessionID: 's1',
      permissionID: 'p1',
      decision: 'always',
    } as unknown as Action;

    const result = await executeAllowedAction(mocks.client, poisoned);
    expect(result).toBeInstanceOf(AllowlistError);
    expect(mocks.permissionReply).not.toHaveBeenCalled();
  });

  it('makes the declared SDK allowlist the enforcement path for execution', async () => {
    const mocks = createClient();
    const result = await executeAllowedAction(mocks.client, {
      type: 'session.messages',
      sessionID: 's1',
    });
    expect(result).toStrictEqual({ type: 'session.messages', value: [] });
    expect(mocks.context).toHaveBeenCalledWith({ sessionID: 's1' });
    const call = toSdkCall({ type: 'session.messages', sessionID: 's1' });
    expect(call).not.toBeInstanceOf(AllowlistError);
    if (call instanceof AllowlistError) throw new Error('expected a call descriptor');
    for (const method of call.sdkMethods) {
      expect(isAllowedSdkMethod(method)).toBe(true);
    }
  });

  it('sends no directory payload on the session status call', async () => {
    const mocks = createClient();
    await executeAllowedAction(
      mocks.client,
      { type: 'session.status', sessionID: 'session-1' },
      ALPHA_DIRECTORY,
    );
    expect(mocks.active).toHaveBeenCalledWith();
  });

  it('sends no directory payload on the session messages call', async () => {
    const mocks = createClient();
    await executeAllowedAction(
      mocks.client,
      { type: 'session.messages', sessionID: 'session-1' },
      ALPHA_DIRECTORY,
    );
    expect(mocks.context).toHaveBeenCalledWith({ sessionID: 'session-1' });
    const options = mocks.context.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    expect(options).toStrictEqual({ sessionID: 'session-1' });
    expect(Object.prototype.hasOwnProperty.call(options, 'query')).toBe(false);
    expect(JSON.stringify(options)).not.toContain(ALPHA_DIRECTORY);
  });

  it('sends no directory payload on the prompt composite', async () => {
    const mocks = createClient();
    await executeAllowedAction(
      mocks.client,
      { type: 'session.prompt', sessionID: 'session-1', text: 'hello', model: PROMPT_MODEL },
      ALPHA_DIRECTORY,
    );
    expect(mocks.switchModel).toHaveBeenCalledWith({
      sessionID: 'session-1',
      model: { id: 'gpt-test', providerID: 'openai' },
    });
    expect(mocks.prompt).toHaveBeenCalledWith({ sessionID: 'session-1', text: 'hello' });
    for (const call of [...mocks.switchModel.mock.calls, ...mocks.prompt.mock.calls]) {
      const options = call[0];
      expect(Object.prototype.hasOwnProperty.call(options, 'query')).toBe(false);
      expect(JSON.stringify(options)).not.toContain(ALPHA_DIRECTORY);
    }
  });

  it('sends no directory payload on the abort call', async () => {
    const mocks = createClient();
    await executeAllowedAction(
      mocks.client,
      { type: 'session.abort', sessionID: 'session-1' },
      ALPHA_DIRECTORY,
    );
    expect(mocks.interrupt).toHaveBeenCalledWith({ sessionID: 'session-1' });
    const options = mocks.interrupt.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    expect(options).toStrictEqual({ sessionID: 'session-1' });
    expect(JSON.stringify(options)).not.toContain(ALPHA_DIRECTORY);
  });

  it('sends no directory payload on the permission reply call', async () => {
    const mocks = createClient();
    await executeAllowedAction(
      mocks.client,
      {
        type: 'permission.reply',
        sessionID: 'session-1',
        permissionID: 'permission-1',
        decision: 'once',
      },
      ALPHA_DIRECTORY,
    );
    expect(mocks.permissionReply).toHaveBeenCalledWith({
      sessionID: 'session-1',
      requestID: 'permission-1',
      decision: 'once',
    });
    const options = mocks.permissionReply.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    expect(JSON.stringify(options)).not.toContain(ALPHA_DIRECTORY);
  });

  it('threads the host-derived directory to model.list and model.default as the location scope', async () => {
    const mocks = createClient();
    await executeAllowedAction(mocks.client, { type: 'model.list' }, ALPHA_DIRECTORY);
    expect(mocks.modelList).toHaveBeenCalledWith({ location: { directory: ALPHA_DIRECTORY } });
    expect(mocks.modelDefault).toHaveBeenCalledWith({ location: { directory: ALPHA_DIRECTORY } });
  });

  it('omits the location key when the directory is undefined or empty', async () => {
    for (const directory of [undefined, '']) {
      const mocks = createClient();
      await executeAllowedAction(mocks.client, { type: 'model.list' }, directory);
      const listOptions = mocks.modelList.mock.calls[0]?.[0];
      const defaultOptions = mocks.modelDefault.mock.calls[0]?.[0];
      expect(listOptions).toStrictEqual({});
      expect(defaultOptions).toStrictEqual({});
      expect(Object.prototype.hasOwnProperty.call(listOptions ?? {}, 'location')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(defaultOptions ?? {}, 'location')).toBe(false);
    }
  });

  it('projects provider payloads to labels and drops secret fields', async () => {
    const mocks = createClient();
    mocks.modelList.mockResolvedValue({
      data: [
        {
          id: 'openai/gpt-4',
          modelID: 'gpt-4',
          providerID: 'openai',
          name: 'GPT-4',
          key: 'sk-secret',
          env: ['OPENAI_API_KEY'],
          options: { apiKey: 'sk-secret' },
          headers: { Authorization: 'Bearer sk-secret' },
          api: 'https://api.openai.com',
          url: 'https://secret.example',
          npm: '@secret/pkg',
          variants: [
            {
              id: 'low',
              body: { reasoning: 'secret-variant-body' },
              headers: { Authorization: 'Bearer sk-variant' },
              options: { secret: 'variant-option' },
            },
            { id: 'high', name: 'High' },
          ],
        },
        {
          id: 'openai/unnamed-model',
          modelID: 'unnamed-model',
          providerID: 'openai',
          name: '',
          variants: 'not-a-map',
        },
      ],
      error: undefined,
    });
    mocks.modelDefault.mockResolvedValue({
      data: {
        id: 'openai/gpt-4',
        modelID: 'gpt-4',
        providerID: 'openai',
        name: 'GPT-4',
        key: 'sk-model',
      },
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, { type: 'model.list' });
    expect(result).toStrictEqual({
      type: 'model.list',
      value: {
        models: [
          { providerID: 'openai', modelID: 'gpt-4', label: 'GPT-4', variants: ['low', 'high'] },
          { providerID: 'openai', modelID: 'unnamed-model', label: 'unnamed-model', variants: [] },
        ],
        defaultModel: { providerID: 'openai', modelID: 'gpt-4' },
      },
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      'sk-secret',
      'sk-model',
      'OPENAI_API_KEY',
      'Authorization',
      'api.openai.com',
      'secret.example',
      '@secret/pkg',
      '"key"',
      '"env"',
      '"options"',
      '"headers"',
      '"api"',
      '"url"',
      '"npm"',
      'secret-variant-body',
      'sk-variant',
      'variant-option',
      '"body"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(mocks.modelList).toHaveBeenCalledWith({});
    expect(mocks.modelDefault).toHaveBeenCalledWith({});
    expect(serialized).not.toContain('anthropic');
    expect(serialized).not.toContain('claude-secret');
  });

  it('returns HostCallFailedError when the model list result is not an array', async () => {
    const mocks = createClient();
    mocks.modelList.mockResolvedValue({
      data: {
        all: [{ id: 'openai/gpt-4', modelID: 'gpt-4', providerID: 'openai', name: 'GPT-4' }],
      },
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, { type: 'model.list' });
    expect(result).toBeInstanceOf(HostCallFailedError);
    expect(result).not.toBeInstanceOf(AllowlistError);
    if (result instanceof HostCallFailedError) {
      expect(result.message).toBe('OpenCode model list result must be an array');
    }
    expect(mocks.modelList).toHaveBeenCalledWith({});
  });

  it('drops model entries that carry no providerID/modelID pair', async () => {
    const mocks = createClient();
    mocks.modelList.mockResolvedValue({
      data: [
        {
          id: 'openai/gpt-4',
          modelID: 'gpt-4',
          providerID: 'openai',
          name: 'GPT-4',
        },
        {
          id: 'openai/legacy-preview',
          providerID: 'openai',
          name: 'Legacy preview',
          package: 'legacy-preview',
        },
      ],
      error: undefined,
    });
    mocks.modelDefault.mockResolvedValue({
      data: {
        id: 'openai/gpt-4',
        modelID: 'gpt-4',
        providerID: 'openai',
        name: 'GPT-4',
      },
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, { type: 'model.list' });
    expect(result).toStrictEqual({
      type: 'model.list',
      value: {
        models: [{ providerID: 'openai', modelID: 'gpt-4', label: 'GPT-4', variants: [] }],
        defaultModel: { providerID: 'openai', modelID: 'gpt-4' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('legacy-preview');
  });

  it('derives the model list solely from the model.list and model.default output', async () => {
    const mocks = createClient();
    const listOutput = [
      {
        id: 'openai/gpt-4',
        modelID: 'gpt-4',
        providerID: 'openai',
        name: 'GPT-4',
      },
      {
        id: 'anthropic/claude-test',
        modelID: 'claude-test',
        providerID: 'anthropic',
        name: 'Claude Test',
      },
    ];
    const defaultOutput = {
      id: 'openai/gpt-4',
      modelID: 'gpt-4',
      providerID: 'openai',
      name: 'GPT-4',
    };
    mocks.modelList.mockResolvedValue({ data: listOutput, error: undefined });
    mocks.modelDefault.mockResolvedValue({ data: defaultOutput, error: undefined });

    const result = await executeAllowedAction(mocks.client, { type: 'model.list' });

    // (a) the configured-provider lookup is the only source the projection reads.
    expect(mocks.modelList).toHaveBeenCalledWith({});
    expect(mocks.modelDefault).toHaveBeenCalledWith({});

    // (b) every emitted providerID/modelID pair appears in that captured output.
    const sourcePairs = new Set(
      [...listOutput, defaultOutput].map((entry) => `${entry.providerID}/${entry.modelID}`),
    );
    expect(result).not.toBeInstanceOf(AllowlistError);
    expect(result).not.toBeInstanceOf(HostCallFailedError);
    const value = (result as AllowedActionResult).value as {
      models: Array<{ providerID: string; modelID: string }>;
    };
    expect(value.models.length).toBeGreaterThan(0);
    for (const model of value.models) {
      expect(sourcePairs.has(`${model.providerID}/${model.modelID}`)).toBe(true);
    }

    // (c) an id absent from that output is never emitted — concrete absent id,
    // so any leak from a non-output source fails loudly.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('nano-gpt');
    expect(serialized).not.toContain('deepseek-reasoner');
  });

  it('sets defaultModel to null when the default pair is absent from providers', async () => {
    const mocks = createClient();
    mocks.modelList.mockResolvedValue({
      data: [
        {
          id: 'openai/gpt-4',
          modelID: 'gpt-4',
          providerID: 'openai',
          name: 'GPT-4',
        },
      ],
      error: undefined,
    });
    mocks.modelDefault.mockResolvedValue({
      data: {
        id: 'anthropic/claude-test',
        modelID: 'claude-test',
        providerID: 'anthropic',
        name: 'Claude Test',
      },
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, { type: 'model.list' });
    expect(result).toStrictEqual({
      type: 'model.list',
      value: {
        models: [{ providerID: 'openai', modelID: 'gpt-4', label: 'GPT-4', variants: [] }],
        defaultModel: null,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('anthropic');
    expect(serialized).not.toContain('claude-test');
    expect(mocks.modelList).toHaveBeenCalledWith({});
  });

  it('projects variant ids from the variant list without variant bodies', async () => {
    const mocks = createClient();
    mocks.modelList.mockResolvedValue({
      data: [
        {
          id: 'openai/gpt-4',
          modelID: 'gpt-4',
          providerID: 'openai',
          name: 'GPT-4',
          variants: [
            {
              id: 'low',
              body: { reasoning: 'array-variant-body' },
              headers: { x: 'array-variant-header' },
            },
            { id: '', body: { leak: 'empty-id-body' } },
            { name: 'no-id', headers: { x: 'no-id-header' } },
            { id: 'high' },
          ],
        },
      ],
      error: undefined,
    });
    mocks.modelDefault.mockResolvedValue({ data: null, error: undefined });

    const result = await executeAllowedAction(mocks.client, { type: 'model.list' });
    expect(result).toStrictEqual({
      type: 'model.list',
      value: {
        models: [{ providerID: 'openai', modelID: 'gpt-4', label: 'GPT-4', variants: ['low', 'high'] }],
        defaultModel: null,
      },
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of ['array-variant-body', 'array-variant-header', 'empty-id-body', 'no-id-header', '"body"', '"headers"']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('sends the selected model ref before session.prompt', async () => {
    const mocks = createClient();
    const model = { providerID: 'anthropic', modelID: 'claude-test' };
    await executeAllowedAction(mocks.client, {
      type: 'session.prompt',
      sessionID: 's1',
      text: 'hello',
      model,
    });
    expect(mocks.switchModel).toHaveBeenCalledWith({
      sessionID: 's1',
      model: { id: 'claude-test', providerID: 'anthropic' },
    });
    expect(mocks.prompt).toHaveBeenCalledWith({ sessionID: 's1', text: 'hello' });
    const [switchCall] = mocks.switchModel.mock.calls as ReadonlyArray<
      readonly [{ model?: object }?]
    >;
    expect(switchCall?.[0]?.model).not.toHaveProperty('variant');
  });

  it('sends a non-empty variant on the model ref and not on the prompt request', async () => {
    const mocks = createClient();
    await executeAllowedAction(mocks.client, {
      type: 'session.prompt',
      sessionID: 's1',
      text: 'hello',
      model: { providerID: 'anthropic', modelID: 'claude-test', variant: 'high' },
    });
    expect(mocks.switchModel).toHaveBeenCalledWith({
      sessionID: 's1',
      model: { id: 'claude-test', providerID: 'anthropic', variant: 'high' },
    });
    expect(mocks.prompt).toHaveBeenCalledWith({ sessionID: 's1', text: 'hello' });
    const [promptCall] = mocks.prompt.mock.calls as ReadonlyArray<readonly [object?]>;
    expect(promptCall?.[0]).not.toHaveProperty('variant');
    expect(promptCall?.[0]).not.toHaveProperty('model');
  });

  it('keeps provider.auth denied', () => {
    expect(isAllowedSdkMethod('provider.auth')).toBe(false);
  });

  it('keeps session.list options empty even when a directory is provided', async () => {
    const mocks = createClient();
    await executeAllowedAction(mocks.client, { type: 'session.list' }, ALPHA_DIRECTORY);
    expect(mocks.list).toHaveBeenCalledWith({});
    const listOptions = mocks.list.mock.calls[0]?.[0];
    expect(listOptions).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(listOptions, 'query')).toBe(false);
  });
});
