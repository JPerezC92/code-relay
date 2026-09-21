import { sessionService } from '@/modules/session/services/session.service';
import type {
  SessionListResult,
  SessionPollResult,
} from '@/modules/session/domain/entities/session';
import { SessionServiceError } from '@/modules/session/domain/errors/session-service.error';
import type { Action } from '@coderelay/protocol';
import type { ActionOutcome, GatewayClientError } from '@/shared/transport/gateway-client';

const mockSendAction = jest.fn<Promise<ActionOutcome | GatewayClientError>, [Action]>();

jest.mock('@/shared/transport/gateway-client', () => {
  class GatewayClientError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'GatewayClientError';
      this.code = code;
    }
  }
  return {
    GatewayClientError,
    getGatewayClient: () => ({
      sendAction: (action: Action) => mockSendAction(action),
    }),
  };
});

function expectListResult(
  result: SessionListResult | SessionServiceError,
): SessionListResult {
  if (result instanceof SessionServiceError) {
    throw new Error(`Unexpected SessionServiceError: ${result.message}`);
  }
  return result;
}

function expectPollResult(
  result: SessionPollResult | SessionServiceError,
): SessionPollResult {
  if (result instanceof SessionServiceError) {
    throw new Error(`Unexpected SessionServiceError: ${result.message}`);
  }
  return result;
}

function expectServiceError(
  result: SessionListResult | SessionPollResult | SessionServiceError,
): SessionServiceError {
  if (!(result instanceof SessionServiceError)) {
    throw new Error('Expected listSessions to return a SessionServiceError');
  }
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sessionService.listSessions', () => {
  it('parses valid host summaries with all five mobile-safe fields', async () => {
    mockSendAction.mockResolvedValue({
      result: {
        type: 'session.list',
        value: {
          projects: [
            { key: 'key-alpha', label: 'CodeRelay' },
            { key: 'key-beta', label: 'notes-app' },
            { key: 'key-empty', label: 'Empty project' },
          ],
          sessions: [
            {
              id: 'session-alpha',
              title: 'Harden the pairing handshake',
              updatedAt: 900,
              projectKey: 'key-alpha',
              projectLabel: 'CodeRelay',
            },
            {
              id: 'session-beta',
              title: 'Draft the protocol notes',
              updatedAt: 400,
              projectKey: 'key-beta',
              projectLabel: 'notes-app',
            },
          ],
        },
      },
      events: [],
    });

    const result = expectListResult(await sessionService.listSessions());

    expect(mockSendAction).toHaveBeenCalledTimes(1);
    expect(mockSendAction).toHaveBeenCalledWith({ type: 'session.list' });
    expect(result.events).toEqual([]);
    expect(result.projects).toStrictEqual([
      { key: 'key-alpha', label: 'CodeRelay' },
      { key: 'key-beta', label: 'notes-app' },
      { key: 'key-empty', label: 'Empty project' },
    ]);
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]).toStrictEqual({
      id: 'session-alpha',
      title: 'Harden the pairing handshake',
      updatedAt: 900,
      projectKey: 'key-alpha',
      projectLabel: 'CodeRelay',
    });
    expect(result.sessions[1]).toStrictEqual({
      id: 'session-beta',
      title: 'Draft the protocol notes',
      updatedAt: 400,
      projectKey: 'key-beta',
      projectLabel: 'notes-app',
    });
  });

  it('skips malformed summaries while valid siblings still parse', async () => {
    mockSendAction.mockResolvedValue({
      result: {
        type: 'session.list',
        value: {
          projects: [],
          sessions: [
            'not-a-session-record',
            {
              id: 'session-missing-key',
              title: 'Missing project key',
              updatedAt: 100,
              projectLabel: 'CodeRelay',
            },
            {
              id: 'session-missing-label',
              title: 'Missing project label',
              updatedAt: 110,
              projectKey: 'key-alpha',
            },
            {
              id: 'session-numeric-key',
              title: 'Numeric project key',
              updatedAt: 120,
              projectKey: 12345,
              projectLabel: 'CodeRelay',
            },
            {
              id: 'session-numeric-label',
              title: 'Numeric project label',
              updatedAt: 130,
              projectKey: 'key-alpha',
              projectLabel: 67890,
            },
            {
              title: 'Missing session id',
              updatedAt: 140,
              projectKey: 'key-alpha',
              projectLabel: 'CodeRelay',
            },
            {
              id: 'session-valid',
              title: 'Valid sibling',
              updatedAt: 150,
              projectKey: 'key-alpha',
              projectLabel: 'CodeRelay',
            },
          ],
        },
      },
      events: [],
    });

    const result = expectListResult(await sessionService.listSessions());

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toStrictEqual({
      id: 'session-valid',
      title: 'Valid sibling',
      updatedAt: 150,
      projectKey: 'key-alpha',
      projectLabel: 'CodeRelay',
    });
  });

  it('skips malformed catalog projects while preserving valid safe projects', async () => {
    mockSendAction.mockResolvedValue({
      result: {
        type: 'session.list',
        value: {
          projects: [
            null,
            { label: 'Missing key' },
            { key: 12345, label: 'Numeric key' },
            { key: 'key-missing-label' },
            { key: 'key-numeric-label', label: 67890 },
            { key: 'key-valid', label: 'Safe project' },
          ],
          sessions: [],
        },
      },
      events: [],
    });

    const result = expectListResult(await sessionService.listSessions());

    expect(result.projects).toStrictEqual([
      { key: 'key-valid', label: 'Safe project' },
    ]);
    expect(result.sessions).toStrictEqual([]);
  });

  it.each([
    ['projects are absent', { sessions: [] }],
    ['projects are not an array', { projects: {}, sessions: [] }],
    ['sessions are absent', { projects: [] }],
    ['sessions are not an array', { projects: [], sessions: {} }],
  ])('returns the strict malformed-list error when %s', async (_condition, value) => {
    mockSendAction.mockResolvedValue({
      result: {
        type: 'session.list',
        value,
      },
      events: [],
    });

    const error = expectServiceError(await sessionService.listSessions());

    expect(error.message).toBe('Host session list was malformed');
    expect(error.name).toBe('SessionServiceError');
  });

  it('falls back to the untitled title when a summary has no usable title', async () => {
    mockSendAction.mockResolvedValue({
      result: {
        type: 'session.list',
        value: {
          projects: [],
          sessions: [
            {
              id: 'session-untitled',
              updatedAt: 200,
              projectKey: 'key-alpha',
              projectLabel: 'CodeRelay',
            },
            {
              id: 'session-non-string-title',
              title: 42,
              updatedAt: 210,
              projectKey: 'key-beta',
              projectLabel: 'notes-app',
            },
          ],
        },
      },
      events: [],
    });

    const result = expectListResult(await sessionService.listSessions());

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0].title).toBe('Untitled session');
    expect(result.sessions[1].title).toBe('Untitled session');
  });

  it('returns exact-safe catalog summaries with the five mobile-safe keys', async () => {
    mockSendAction.mockResolvedValue({
      result: {
        type: 'session.list',
        value: {
          projects: [{ key: 'key-gamma', label: 'CodeRelay' }],
          sessions: [
            {
              id: 'session-gamma',
              title: 'Root session',
              updatedAt: 700,
              projectKey: 'key-gamma',
              projectLabel: 'CodeRelay',
            },
            {
              id: 'session-delta',
              title: 'Second root session',
              updatedAt: 650,
              projectKey: 'key-delta',
              projectLabel: 'notes-app',
            },
          ],
        },
      },
      events: [],
    });

    const result = expectListResult(await sessionService.listSessions());

    expect(result.projects).toStrictEqual([{ key: 'key-gamma', label: 'CodeRelay' }]);
    expect(result.sessions).toHaveLength(2);
    for (const summary of result.sessions) {
      expect(Object.keys(summary).sort()).toStrictEqual([
        'id',
        'projectKey',
        'projectLabel',
        'title',
        'updatedAt',
      ]);
    }
    expect(result.sessions[0]).toStrictEqual({
      id: 'session-gamma',
      title: 'Root session',
      updatedAt: 700,
      projectKey: 'key-gamma',
      projectLabel: 'CodeRelay',
    });
    expect(result.sessions[1]).toStrictEqual({
      id: 'session-delta',
      title: 'Second root session',
      updatedAt: 650,
      projectKey: 'key-delta',
      projectLabel: 'notes-app',
    });
  });
});

describe('sessionService.fetchMessages', () => {
  it('maps safe user and assistant messages from info identifiers and text parts only', async () => {
    mockSendAction.mockResolvedValue({
      result: {
        type: 'session.messages',
        value: [
          {
            info: {
              id: 'message-user',
              sessionID: 'session-alpha',
              role: 'user',
              directory: '/home/dexm76/projects-personal/CodeRelay',
            },
            parts: [
              { type: 'text', text: 'Please review the pairing flow.' },
              { type: 'tool', tool: 'read' },
            ],
          },
          {
            info: {
              id: 'message-assistant',
              sessionID: 'session-alpha',
              role: 'assistant',
              providerID: 'openai',
            },
            parts: [
              { type: 'text', text: 'The pairing flow is ready.' },
              { type: 'text', text: ' It is single-use.' },
            ],
          },
        ],
      },
      events: [],
    });

    const result = expectPollResult(await sessionService.fetchMessages('session-alpha'));

    expect(mockSendAction).toHaveBeenCalledWith({
      type: 'session.messages',
      sessionID: 'session-alpha',
    });
    expect(result.events).toEqual([]);
    expect(result.messages).toStrictEqual([
      {
        id: 'message-user',
        sessionId: 'session-alpha',
        role: 'user',
        text: 'Please review the pairing flow.',
      },
      {
        id: 'message-assistant',
        sessionId: 'session-alpha',
        role: 'assistant',
        text: 'The pairing flow is ready. It is single-use.',
      },
    ]);
  });

  it('skips malformed message entries, roles, and parts', async () => {
    mockSendAction.mockResolvedValue({
      result: {
        type: 'session.messages',
        value: [
          'not-a-message-record',
          { info: 'not-a-message-info', parts: [{ type: 'text', text: 'Ignored' }] },
          {
            info: { id: 'message-system', sessionID: 'session-alpha', role: 'system' },
            parts: [{ type: 'text', text: 'Ignored' }],
          },
          {
            info: { id: 'message-no-parts', sessionID: 'session-alpha', role: 'user' },
            parts: [{ type: 'text', text: 42 }],
          },
          {
            info: { id: 'message-valid', sessionID: 'session-alpha', role: 'assistant' },
            parts: ['not-a-part', { type: 'tool', tool: 'read' }, { type: 'text', text: 'Kept' }],
          },
        ],
      },
      events: [],
    });

    const result = expectPollResult(await sessionService.fetchMessages('session-alpha'));

    expect(result.messages).toStrictEqual([
      {
        id: 'message-valid',
        sessionId: 'session-alpha',
        role: 'assistant',
        text: 'Kept',
      },
    ]);
  });

  it('returns the strict malformed-message error when the payload is not an array', async () => {
    mockSendAction.mockResolvedValue({
      result: {
        type: 'session.messages',
        value: { messages: [] },
      },
      events: [],
    });

    const error = expectServiceError(await sessionService.fetchMessages('session-alpha'));

    expect(error.message).toBe('Host message list was malformed');
    expect(error.name).toBe('SessionServiceError');
  });
});
