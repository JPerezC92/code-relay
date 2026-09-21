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
  const client: OpenCodeClientLike = {
    session: { list, status, messages, promptAsync, abort },
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
  };
}

describe('allowlist', () => {
  it('allows only the six protocol actions and their SDK methods', () => {
    expect(isAllowedSdkMethod('session.list')).toBe(true);
    expect(isAllowedSdkMethod('session.status')).toBe(true);
    expect(isAllowedSdkMethod('session.messages')).toBe(true);
    expect(isAllowedSdkMethod('session.promptAsync')).toBe(true);
    expect(isAllowedSdkMethod('session.abort')).toBe(true);
    expect(isAllowedSdkMethod('postSessionIdPermissionsPermissionId')).toBe(true);
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
    });
    expect(result).toStrictEqual({ type: 'session.prompt', value: null });
    expect(mocks.promptAsync).toHaveBeenCalledWith({
      path: { id: 's1' },
      body: { parts: [{ type: 'text', text: 'hello' }] },
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
      executeAllowedAction(mocks.client, { type: 'session.prompt', sessionID: 'session-1', text: 'Hello' }),
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
      toSdkCall({ type: 'session.prompt', sessionID: 's1', text: 'hi' }).sdkMethod,
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
      { type: 'session.prompt', sessionID: 'session-1', text: 'hello' },
      ALPHA_DIRECTORY,
    );
    expect(mocks.promptAsync).toHaveBeenCalledWith({
      path: { id: 'session-1' },
      body: { parts: [{ type: 'text', text: 'hello' }] },
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

  it('keeps session.list options empty even when a directory is provided', async () => {
    const mocks = createClient();
    await executeAllowedAction(mocks.client, { type: 'session.list' }, ALPHA_DIRECTORY);
    expect(mocks.list).toHaveBeenCalledWith({});
    const listOptions = mocks.list.mock.calls[0]?.[0];
    expect(listOptions).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(listOptions, 'query')).toBe(false);
  });
});
