import { describe, expect, it, vi } from 'vitest';
import { ActionError } from '@coderelay/protocol';
import {
  AllowlistError,
  executeAllowedAction,
  executeRawAction,
  isAllowedSdkMethod,
  toPermissionReplyBody,
  toSdkCall,
} from './allowlist';
import type {
  OpenCodeClientLike,
  OpenCodeSdkResult,
  SessionListOptions,
  SessionMessagesOptions,
  SessionStatusOptions,
} from './allowlist';

const ALPHA_DIRECTORY = '/home/user/proj-alpha';
const PROMPT_MODEL = { providerID: 'openai', modelID: 'gpt-test' };

function createClient() {
  const list = vi.fn(async (_options?: SessionListOptions): Promise<OpenCodeSdkResult> => ({
    data: [],
    error: undefined,
  }));
  const status = vi.fn(async (_options?: SessionStatusOptions): Promise<OpenCodeSdkResult> => ({
    data: {},
    error: undefined,
  }));
  const messages = vi.fn(async (_options: SessionMessagesOptions): Promise<OpenCodeSdkResult> => ({
    data: [],
    error: undefined,
  }));
  const promptAsync = vi.fn(async (): Promise<OpenCodeSdkResult> => ({
    data: undefined,
    error: undefined,
  }));
  const abort = vi.fn(async (): Promise<OpenCodeSdkResult> => ({
    data: true,
    error: undefined,
  }));
  const postSessionIdPermissionsPermissionId = vi.fn(async (): Promise<OpenCodeSdkResult> => ({
    data: true,
    error: undefined,
  }));
  const providerList = vi.fn(async (): Promise<OpenCodeSdkResult> => ({
    data: { all: [] },
    error: undefined,
  }));
  const configProviders = vi.fn(async (): Promise<OpenCodeSdkResult> => ({
    data: { providers: [] },
    error: undefined,
  }));
  const client: OpenCodeClientLike = {
    session: { list, status, messages, promptAsync, abort },
    provider: { list: providerList },
    config: { providers: configProviders },
    postSessionIdPermissionsPermissionId,
  };
  return {
    client,
    list,
    status,
    messages,
    promptAsync,
    abort,
    postSessionIdPermissionsPermissionId,
    providerList,
    configProviders,
  };
}

describe('allowlist', () => {
  it('allows only the protocol actions and their SDK methods', () => {
    expect(isAllowedSdkMethod('session.list')).toBe(true);
    expect(isAllowedSdkMethod('session.status')).toBe(true);
    expect(isAllowedSdkMethod('session.messages')).toBe(true);
    expect(isAllowedSdkMethod('session.promptAsync')).toBe(true);
    expect(isAllowedSdkMethod('session.abort')).toBe(true);
    expect(isAllowedSdkMethod('postSessionIdPermissionsPermissionId')).toBe(true);
    expect(isAllowedSdkMethod('provider.list')).toBe(true);
    expect(isAllowedSdkMethod('config.providers')).toBe(true);
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

  it('executes an allowlisted prompt through promptAsync with text parts', async () => {
    const mocks = createClient();
    const result = await executeAllowedAction(mocks.client, {
      type: 'session.prompt',
      sessionID: 's1',
      text: 'hello',
      model: PROMPT_MODEL,
    });
    expect(result).toStrictEqual({ type: 'session.prompt', value: null });
    expect(mocks.promptAsync).toHaveBeenCalledWith({
      path: { id: 's1' },
      body: {
        model: PROMPT_MODEL,
        parts: [{ type: 'text', text: 'hello' }],
      },
    });
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
    mocks.messages.mockResolvedValue({
      data: [
        {
          info: {
            id: 'message-1',
            sessionID: 'session-1',
            role: 'assistant',
            path: { cwd: '/host/project', root: '/host' },
            metadata: { private: true },
            projectID: 'project-1',
            directory: '/host/project',
          },
          parts: [
            { type: 'text', text: 'Safe reply', metadata: { private: true } },
            { type: 'tool', tool: { path: '/host/project' } },
          ],
          path: { cwd: '/host/project', root: '/host' },
          metadata: { private: true },
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
    mocks.messages.mockResolvedValue({
      data: [
        {
          info: { id: 'message-1', sessionID: 'session-1', role: 'assistant' },
          parts: [
            {
              type: 'reasoning',
              id: 'reason-1',
              text: 'Reasoning text',
              time: { start: 5, end: 15, extra: true },
            },
            {
              type: 'tool',
              id: 'edit-1',
              tool: 'edit',
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
              tool: 'task',
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
              tool: 'task',
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
              tool: 'bash',
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
    mocks.messages.mockResolvedValue({
      data: [
        {
          info: { id: 'message-1', sessionID: 'session-1', role: 'assistant' },
          parts: [
            {
              type: 'tool',
              id: 'edit-1',
              tool: 'edit',
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
              tool: 'write',
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
    mocks.messages.mockResolvedValue({
      data: [
        {
          info: { id: 'message-1', sessionID: 'session-1', role: 'assistant' },
          parts: [
            {
              type: 'tool',
              id: 'bash-title',
              tool: 'bash',
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
              tool: 'bash',
              state: {
                status: 'completed',
                input: { command: 'pwd' },
                error: { message: 'LEAKED_ERROR_OBJECT' },
              },
            },
            {
              type: 'tool',
              id: 'bash-error',
              tool: 'bash',
              state: { status: 'error', error: 'command failed' },
            },
            {
              type: 'tool',
              id: 'bash-long',
              tool: 'bash',
              state: { status: 'completed', title: 'cat', output: longOutput },
            },
            {
              type: 'tool',
              id: 'read-1',
              tool: 'read',
              state: { status: 'completed', title: 'Read file' },
            },
            {
              type: 'tool',
              id: 'grep-1',
              tool: 'grep',
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

  it('skips malformed session message records and parts', async () => {
    const mocks = createClient();
    mocks.messages.mockResolvedValue({
      data: [
        null,
        { info: { id: 'missing-session', role: 'assistant' }, parts: [] },
        { info: { id: 'wrong-role', sessionID: 'session-1', role: 'system' }, parts: [] },
        { info: { id: 'invalid-parts', sessionID: 'session-1', role: 'user' }, parts: {} },
        {
          info: { id: 'message-1', sessionID: 'session-1', role: 'user' },
          parts: [null, { type: 'tool' }, { type: 'text' }, { type: 'text', text: 'Safe text' }],
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

  it('returns a static AllowlistError for non-array session messages data', async () => {
    const mocks = createClient();
    mocks.messages.mockResolvedValue({
      data: { path: { cwd: '/host/project', root: '/host' } },
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, {
      type: 'session.messages',
      sessionID: 'session-1',
    });
    expect(result).toBeInstanceOf(AllowlistError);
    if (result instanceof AllowlistError) {
      expect(result.message).toBe('OpenCode session messages result must be an array');
    }
  });

  it('projects session status to its string type only', async () => {
    const mocks = createClient();
    mocks.status.mockResolvedValue({
      data: {
        type: 'busy',
        path: { cwd: '/host/project', root: '/host' },
        metadata: { private: true },
      },
      error: undefined,
    });

    await expect(
      executeAllowedAction(mocks.client, { type: 'session.status', sessionID: 'session-1' }),
    ).resolves.toStrictEqual({ type: 'session.status', value: { type: 'busy' } });

    mocks.status.mockResolvedValue({
      data: { path: { cwd: '/host/project', root: '/host' } },
      error: undefined,
    });
    await expect(
      executeAllowedAction(mocks.client, { type: 'session.status', sessionID: 'session-1' }),
    ).resolves.toStrictEqual({ type: 'session.status', value: {} });
  });

  it('returns null for prompt, abort, and permission replies regardless of SDK data', async () => {
    const mocks = createClient();
    const rawData = {
      path: { cwd: '/host/project', root: '/host' },
      metadata: { private: true },
    };
    mocks.promptAsync.mockResolvedValue({ data: rawData, error: undefined });
    mocks.abort.mockResolvedValue({ data: rawData, error: undefined });
    mocks.postSessionIdPermissionsPermissionId.mockResolvedValue({
      data: rawData,
      error: undefined,
    });

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

  it('returns AllowlistError for SDK errors or absent data without forwarding wrappers', async () => {
    const mocks = createClient();
    mocks.client.session.list = async () => ({
      data: undefined,
      error: { message: 'SDK failed' },
    });

    const errorResult = await executeAllowedAction(mocks.client, { type: 'session.list' });
    expect(errorResult).toBeInstanceOf(AllowlistError);
    if (errorResult instanceof AllowlistError) {
      expect(errorResult.message).toBe('OpenCode SDK request failed');
    }
    expect(errorResult).not.toHaveProperty('value');

    mocks.client.session.list = async () => ({ error: undefined });
    const missingDataResult = await executeAllowedAction(mocks.client, { type: 'session.list' });
    expect(missingDataResult).toBeInstanceOf(AllowlistError);
    if (missingDataResult instanceof AllowlistError) {
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
    expect(mocks.postSessionIdPermissionsPermissionId).toHaveBeenCalledWith({
      path: { id: 's1', permissionID: 'p1' },
      body: { response: 'reject' },
    });
  });

  it('maps protocol actions to allowlisted SDK calls with typed options', () => {
    expect(
      toSdkCall({ type: 'session.prompt', sessionID: 's1', text: 'hi', model: PROMPT_MODEL }).sdkMethod,
    ).toBe('session.promptAsync');
    expect(toSdkCall({ type: 'session.abort', sessionID: 's1' }).sdkMethod).toBe('session.abort');
    expect(
      toSdkCall({
        type: 'permission.reply',
        sessionID: 's1',
        permissionID: 'p1',
        decision: 'once',
      }),
    ).toStrictEqual({
      actionType: 'permission.reply',
      sdkMethod: 'postSessionIdPermissionsPermissionId',
      options: { path: { id: 's1', permissionID: 'p1' }, body: { response: 'once' } },
    });
    expect(
      toSdkCall({ type: 'session.messages', sessionID: 's1' }),
    ).toStrictEqual({
      actionType: 'session.messages',
      sdkMethod: 'session.messages',
      options: { path: { id: 's1' } },
    });
  });

  it('makes the declared SDK allowlist the enforcement path for execution', async () => {
    const mocks = createClient();
    const result = await executeAllowedAction(mocks.client, {
      type: 'session.messages',
      sessionID: 's1',
    });
    expect(result).toStrictEqual({ type: 'session.messages', value: [] });
    expect(mocks.messages).toHaveBeenCalledWith({ path: { id: 's1' } });
    expect(isAllowedSdkMethod(toSdkCall({ type: 'session.messages', sessionID: 's1' }).sdkMethod)).toBe(
      true,
    );
  });

  it('sends the host-derived directory as the session status query', async () => {
    const mocks = createClient();
    await executeAllowedAction(
      mocks.client,
      { type: 'session.status', sessionID: 'session-1' },
      ALPHA_DIRECTORY,
    );
    expect(mocks.status).toHaveBeenCalledWith({ query: { directory: ALPHA_DIRECTORY } });
  });

  it('sends the host-derived directory as the session messages query', async () => {
    const mocks = createClient();
    await executeAllowedAction(
      mocks.client,
      { type: 'session.messages', sessionID: 'session-1' },
      ALPHA_DIRECTORY,
    );
    expect(mocks.messages).toHaveBeenCalledWith({
      path: { id: 'session-1' },
      query: { directory: ALPHA_DIRECTORY },
    });
  });

  it('sends the host-derived directory as the prompt query', async () => {
    const mocks = createClient();
    await executeAllowedAction(
      mocks.client,
      { type: 'session.prompt', sessionID: 'session-1', text: 'hello', model: PROMPT_MODEL },
      ALPHA_DIRECTORY,
    );
    expect(mocks.promptAsync).toHaveBeenCalledWith({
      path: { id: 'session-1' },
      body: {
        model: PROMPT_MODEL,
        parts: [{ type: 'text', text: 'hello' }],
      },
      query: { directory: ALPHA_DIRECTORY },
    });
  });

  it('sends the host-derived directory as the abort query', async () => {
    const mocks = createClient();
    await executeAllowedAction(
      mocks.client,
      { type: 'session.abort', sessionID: 'session-1' },
      ALPHA_DIRECTORY,
    );
    expect(mocks.abort).toHaveBeenCalledWith({
      path: { id: 'session-1' },
      query: { directory: ALPHA_DIRECTORY },
    });
  });

  it('sends the host-derived directory as the permission reply query', async () => {
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
    expect(mocks.postSessionIdPermissionsPermissionId).toHaveBeenCalledWith({
      path: { id: 'session-1', permissionID: 'permission-1' },
      body: { response: 'once' },
      query: { directory: ALPHA_DIRECTORY },
    });
  });

  it('omits the query key when the directory is undefined or empty', async () => {
    for (const directory of [undefined, '']) {
      const mocks = createClient();
      await executeAllowedAction(
        mocks.client,
        { type: 'session.status', sessionID: 'session-1' },
        directory,
      );
      await executeAllowedAction(
        mocks.client,
        { type: 'session.messages', sessionID: 'session-1' },
        directory,
      );
      const statusOptions = mocks.status.mock.calls[0]?.[0];
      const messagesOptions = mocks.messages.mock.calls[0]?.[0];
      expect(statusOptions).toBeDefined();
      expect(messagesOptions).toBeDefined();
      expect(statusOptions).toStrictEqual({});
      expect(messagesOptions).toStrictEqual({ path: { id: 'session-1' } });
      expect(Object.prototype.hasOwnProperty.call(statusOptions, 'query')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(messagesOptions, 'query')).toBe(false);
    }
  });

  it('projects provider payloads to labels and drops secret fields', async () => {
    const mocks = createClient();
    mocks.configProviders.mockResolvedValue({
      data: {
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            key: 'sk-secret',
            env: ['OPENAI_API_KEY'],
            options: { apiKey: 'sk-secret' },
            headers: { Authorization: 'Bearer sk-secret' },
            api: 'https://api.openai.com',
            url: 'https://secret.example',
            npm: '@secret/pkg',
            models: {
              'gpt-4': {
                id: 'gpt-4',
                name: 'GPT-4',
                key: 'sk-model',
                options: { secret: true },
                headers: { Authorization: 'Bearer sk-secret' },
                api: 'https://api.openai.com',
                url: 'https://secret.example',
                variants: {
                  low: {
                    body: { reasoning: 'secret-variant-body' },
                    headers: { Authorization: 'Bearer sk-variant' },
                    options: { secret: 'variant-option' },
                  },
                  high: { name: 'High' },
                },
              },
              blank: { id: 'unnamed-model', name: '', variants: 'not-a-map' },
            },
          },
        ],
        default: { missing: 'nope', openai: 'gpt-4' },
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
    expect(mocks.configProviders).toHaveBeenCalledWith({});
    expect(mocks.providerList).not.toHaveBeenCalled();
    expect(serialized).not.toContain('anthropic');
    expect(serialized).not.toContain('claude-secret');
  });

  it('returns AllowlistError when the provider list omits providers', async () => {
    const mocks = createClient();
    mocks.configProviders.mockResolvedValue({
      data: {
        all: [{ id: 'openai', models: { 'gpt-4': { id: 'gpt-4', name: 'GPT-4' } } }],
        default: { openai: 'gpt-4' },
      },
      error: undefined,
    });

    const result = await executeAllowedAction(mocks.client, { type: 'model.list' });
    expect(result).toBeInstanceOf(AllowlistError);
    if (result instanceof AllowlistError) {
      expect(result.message).toBe('OpenCode provider list result must include a provider array');
    }
    expect(mocks.configProviders).toHaveBeenCalledWith({});
    expect(mocks.providerList).not.toHaveBeenCalled();
  });

  it('projects only configured providers and ignores catalog-only models', async () => {
    const mocks = createClient();
    mocks.configProviders.mockResolvedValue({
      data: {
        all: [
          {
            id: 'nano-gpt',
            models: { 'deepseek-reasoner': { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' } },
          },
        ],
        providers: [
          {
            id: 'openai',
            models: { 'gpt-4': { id: 'gpt-4', name: 'GPT-4' } },
          },
        ],
        default: { openai: 'gpt-4' },
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
    expect(JSON.stringify(result)).not.toContain('nano-gpt');
    expect(JSON.stringify(result)).not.toContain('deepseek-reasoner');
    expect(mocks.configProviders).toHaveBeenCalledWith({});
    expect(mocks.providerList).not.toHaveBeenCalled();
  });

  it('sets defaultModel to null when the default pair is absent from providers', async () => {
    const mocks = createClient();
    mocks.configProviders.mockResolvedValue({
      data: {
        providers: [
          {
            id: 'openai',
            models: { 'gpt-4': { id: 'gpt-4', name: 'GPT-4' } },
          },
        ],
        default: { anthropic: 'claude-test' },
      },
      error: undefined,
    });

    await expect(executeAllowedAction(mocks.client, { type: 'model.list' })).resolves.toStrictEqual({
      type: 'model.list',
      value: {
        models: [{ providerID: 'openai', modelID: 'gpt-4', label: 'GPT-4', variants: [] }],
        defaultModel: null,
      },
    });
    expect(mocks.configProviders).toHaveBeenCalledWith({});
    expect(mocks.providerList).not.toHaveBeenCalled();
  });

  it('projects variant ids from object keys and id arrays without variant bodies', async () => {
    const mocks = createClient();
    mocks.configProviders.mockResolvedValue({
      data: {
        providers: [
          {
            id: 'openai',
            models: [
              {
                id: 'gpt-4',
                name: 'GPT-4',
                variants: [
                  { id: 'low', body: { reasoning: 'array-variant-body' }, headers: { x: 'array-variant-header' } },
                  { id: '', body: { leak: 'empty-id-body' } },
                  { name: 'no-id', headers: { x: 'no-id-header' } },
                  { id: 'high' },
                ],
              },
            ],
          },
        ],
        default: {},
      },
      error: undefined,
    });

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

  it('sends the selected model ref on session.prompt', async () => {
    const mocks = createClient();
    const model = { providerID: 'anthropic', modelID: 'claude-test' };
    await executeAllowedAction(mocks.client, {
      type: 'session.prompt',
      sessionID: 's1',
      text: 'hello',
      model,
    });
    expect(mocks.promptAsync).toHaveBeenCalledWith({
      path: { id: 's1' },
      body: {
        model,
        parts: [{ type: 'text', text: 'hello' }],
      },
    });
    const [promptCall] = mocks.promptAsync.mock.calls as ReadonlyArray<
      readonly [{ body?: object }?]
    >;
    expect(promptCall?.[0]?.body).not.toHaveProperty('variant');
  });

  it('sends a non-empty variant on the prompt_async body and not on the model', async () => {
    const mocks = createClient();
    await executeAllowedAction(mocks.client, {
      type: 'session.prompt',
      sessionID: 's1',
      text: 'hello',
      model: { providerID: 'anthropic', modelID: 'claude-test', variant: 'high' },
    });
    expect(mocks.promptAsync).toHaveBeenCalledWith({
      path: { id: 's1' },
      body: {
        model: { providerID: 'anthropic', modelID: 'claude-test' },
        parts: [{ type: 'text', text: 'hello' }],
        variant: 'high',
      },
    });
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
