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

function createClient() {
  const list = vi.fn(async (_options?: SessionListOptions): Promise<OpenCodeSdkResult> => ({
    data: [],
    error: undefined,
  }));
  const active = vi.fn(async (): Promise<OpenCodeSdkResult> => ({ data: {}, error: undefined }));
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

    expect(mocks.permissionReply).not.toHaveBeenCalled();
  });

  it('exposes only the mobile-safe acknowledgement and sends the exact once or reject decision', async () => {
    const decisions: PermissionDecision[] = ['once', 'reject'];

    for (const decision of decisions) {
      const mocks = createClient();
      mocks.permissionReply.mockResolvedValue({
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
      expect(mocks.permissionReply).toHaveBeenCalledTimes(1);
      expect(mocks.permissionReply).toHaveBeenCalledWith({
        sessionID: 'session-1',
        requestID: 'permission-1',
        decision,
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
    expect(mocks.active).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.switchModel).not.toHaveBeenCalled();
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(mocks.interrupt).not.toHaveBeenCalled();
    expect(mocks.permissionReply).not.toHaveBeenCalled();
  });
});
