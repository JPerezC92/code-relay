import { describe, expect, it, vi } from 'vitest';
import { ActionError } from '@coderelay/protocol';
import type { PermissionDecision } from '@coderelay/protocol';
import {
  AllowlistError,
  executeAllowedAction,
  executeRawAction,
  toPermissionReplyBody,
} from './allowlist';
import type {
  OpenCodeClientLike,
  OpenCodeSdkResult,
  SessionListOptions,
  SessionMessagesOptions,
  SessionStatusOptions,
} from './allowlist';

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
  const abort = vi.fn(async (): Promise<OpenCodeSdkResult> => ({ data: true, error: undefined }));
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

function permissionReply(decision: unknown) {
  return {
    type: 'permission.reply',
    sessionID: 'session-1',
    permissionID: 'permission-1',
    decision,
  };
}

describe('permission policy', () => {
  it('maps only approve-once and reject through the reply body layer', () => {
    expect(toPermissionReplyBody('once')).toStrictEqual({ response: 'once' });
    expect(toPermissionReplyBody('reject')).toStrictEqual({ response: 'reject' });
  });

  it('rejects always and remember at the reply body layer', () => {
    expect(toPermissionReplyBody('always')).toBeInstanceOf(AllowlistError);
    expect(toPermissionReplyBody('remember')).toBeInstanceOf(AllowlistError);
  });

  it('rejects always and remember at the parse layer and never reaches the SDK', async () => {
    const mocks = createClient();

    for (const decision of ['always', 'remember']) {
      const result = await executeRawAction(mocks.client, permissionReply(decision));
      expect(result).toBeInstanceOf(ActionError);
    }

    expect(mocks.postSessionIdPermissionsPermissionId).not.toHaveBeenCalled();
  });

  it('exposes only the mobile-safe acknowledgement and sends the exact once or reject SDK body', async () => {
    const decisions: PermissionDecision[] = ['once', 'reject'];

    for (const decision of decisions) {
      const mocks = createClient();
      mocks.postSessionIdPermissionsPermissionId.mockResolvedValue({
        data: { path: { cwd: '/host/project', root: '/host' } },
        error: undefined,
      });

      const result = await executeAllowedAction(mocks.client, {
        type: 'permission.reply',
        sessionID: 'session-1',
        permissionID: 'permission-1',
        decision,
      });

      expect(result).toStrictEqual({ type: 'permission.reply', value: null });
      expect(mocks.postSessionIdPermissionsPermissionId).toHaveBeenCalledTimes(1);
      expect(mocks.postSessionIdPermissionsPermissionId).toHaveBeenCalledWith({
        path: { id: 'session-1', permissionID: 'permission-1' },
        body: { response: decision },
      });
    }
  });

  it('denies shell, file, auth, and mcp actions without invoking any SDK method', async () => {
    const mocks = createClient();

    const denied = [
      { type: 'session.shell', sessionID: 'session-1', command: 'rm -rf /' },
      { type: 'session.command', sessionID: 'session-1', command: 'rm -rf /' },
      { type: 'session.init', sessionID: 'session-1' },
      { type: 'file.list', path: '/' },
      { type: 'file.read', path: '/etc/passwd' },
      { type: 'file.status', path: '/' },
      { type: 'auth.set', providerID: 'openai', key: 'secret' },
      { type: 'mcp.add', name: 'evil' },
      { type: 'mcp.connect', name: 'evil' },
      { type: 'provider.auth', providerID: 'openai' },
    ];

    for (const raw of denied) {
      expect(await executeRawAction(mocks.client, raw)).toBeInstanceOf(AllowlistError);
    }

    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.messages).not.toHaveBeenCalled();
    expect(mocks.promptAsync).not.toHaveBeenCalled();
    expect(mocks.abort).not.toHaveBeenCalled();
    expect(mocks.postSessionIdPermissionsPermissionId).not.toHaveBeenCalled();
  });
});
