import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { NormalizedEvent } from '@coderelay/protocol';
import { AccessibilityInfo, FlatList } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { ChatScreen } from '@/modules/session/components/ChatScreen';
import type {
  ChatMessage,
  ModelChoice,
  ModelListResult,
  ProjectSummary,
  SessionActionResult,
  SessionListResult,
  SessionPollResult,
  SessionSummary,
  TranscriptItem,
} from '@/modules/session/domain/entities/session';
import { SessionServiceError } from '@/modules/session/domain/errors/session-service.error';

const mockListSessions = jest.fn<Promise<SessionListResult | SessionServiceError>, []>();
const mockFetchMessages = jest.fn<Promise<SessionPollResult | SessionServiceError>, [string]>();
const mockListModels = jest.fn<Promise<ModelListResult | SessionServiceError>, []>();
const mockSendPrompt = jest.fn<
  Promise<SessionActionResult | SessionServiceError>,
  [string, string, { providerID: string; modelID: string; variant?: string }]
>();
const mockAbort = jest.fn<Promise<SessionActionResult | SessionServiceError>, [string]>();
const mockReplyToPermission = jest.fn<
  Promise<SessionActionResult | SessionServiceError>,
  [string, string, 'once' | 'reject']
>();

jest.mock('@/modules/session/services/session.service', () => {
  const actual = jest.requireActual('@/modules/session/services/session.service') as {
    sessionService: {
      readTranscriptUpdate: (
        event: NormalizedEvent,
        selectedSessionId: string | null,
      ) => TranscriptItem | null;
    };
  };
  return {
    sessionService: {
      listSessions: () => mockListSessions(),
      listModels: () => mockListModels(),
      fetchMessages: (sessionID: string) => mockFetchMessages(sessionID),
      sendPrompt: (
        sessionID: string,
        text: string,
        model: { providerID: string; modelID: string; variant?: string },
      ) => mockSendPrompt(sessionID, text, model),
      abort: (sessionID: string) => mockAbort(sessionID),
      replyToPermission: (sessionID: string, permissionID: string, decision: 'once' | 'reject') =>
        mockReplyToPermission(sessionID, permissionID, decision),
      readTranscriptUpdate: (event: NormalizedEvent, selectedSessionId: string | null) =>
        actual.sessionService.readTranscriptUpdate(event, selectedSessionId),
    },
  };
});

/** Deterministic insets, deliberately distinct from the container's base 16px
 * padding so the padded composition is provable (top 24 + 16, bottom 48 + 16). */
const mockInsets: EdgeInsets = { top: 24, right: 0, bottom: 48, left: 0 };

/** The subset of the safe-area module a rendered ChatScreen consumes. */
interface MockedSafeAreaContext {
  useSafeAreaInsets: () => EdgeInsets;
}

// Mocked at the module boundary only: the runtime provider lives in App.tsx, so
// a directly rendered ChatScreen needs deterministic insets. react-native is
// never mocked — a module-level react-native mock crashes on the DevMenu
// TurboModule. The factory defers the mockInsets read to hook-call time.
jest.mock(
  'react-native-safe-area-context',
  (): MockedSafeAreaContext => ({
    useSafeAreaInsets: () => mockInsets,
  }),
);

/** One recorded scrollToEnd() call on the chat history list. */
interface RecordedScroll {
  animated: boolean;
}

const mockScrollToEndCalls: RecordedScroll[] = [];

// The real FlatList renders for real. RNTL cannot reach the ref the screen
// hands it, so a prototype spy on scrollToEnd records every call into
// mockScrollToEndCalls instead of running the native scroll machinery.

const DEFAULT_MODEL: ModelChoice = {
  providerID: 'opencode',
  modelID: 'big-pickle',
  label: 'Big Pickle',
  variants: [],
};

const ALT_MODEL: ModelChoice = {
  providerID: 'openai',
  modelID: 'gpt-5',
  label: 'GPT 5',
  variants: [],
};

const VARIANT_MODEL: ModelChoice = {
  providerID: 'anthropic',
  modelID: 'claude-test',
  label: 'Claude Test',
  variants: ['low', 'high'],
};

const SESSION_ID = 'session-1';

const MESSAGES: ChatMessage[] = [
  { id: 'message-user', sessionId: SESSION_ID, role: 'user', text: 'Hello host' },
  { id: 'message-assistant', sessionId: SESSION_ID, role: 'assistant', text: 'Hello phone' },
];

const SECOND_SESSION_ID = 'session-2';

const SECOND_MESSAGES: ChatMessage[] = [
  {
    id: 'message-second-user',
    sessionId: SECOND_SESSION_ID,
    role: 'user',
    text: 'Second session history',
  },
];

const ALPHA_PROJECT_KEY = 'project-alpha';
const BETA_PROJECT_KEY = 'project-beta';

const PROJECTS: ProjectSummary[] = [
  { key: ALPHA_PROJECT_KEY, label: 'Alpha app' },
  { key: BETA_PROJECT_KEY, label: 'Beta app' },
];

const ALPHA_SESSIONS: SessionSummary[] = [
  {
    id: 'session-alpha-new',
    title: 'Alpha newest session',
    updatedAt: 5,
    projectKey: ALPHA_PROJECT_KEY,
    projectLabel: 'Alpha app',
  },
  {
    id: 'session-alpha-old',
    title: 'Alpha older session',
    updatedAt: 4,
    projectKey: ALPHA_PROJECT_KEY,
    projectLabel: 'Alpha app',
  },
];

const BETA_SESSION: SessionSummary = {
  id: 'session-beta-new',
  title: 'Beta newest session',
  updatedAt: 3,
  projectKey: BETA_PROJECT_KEY,
  projectLabel: 'Beta app',
};

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

/** A host event that streams more text onto the assistant reply of the
 * selected session, growing the rendered content of the history list. */
function createStreamedTextEvent(text: string): NormalizedEvent {
  return {
    name: 'message.part.updated',
    properties: {
      part: {
        type: 'text',
        messageID: 'message-assistant',
        sessionID: SESSION_ID,
        text,
      },
    },
  };
}

/** Simulates the host measuring a new content size for the history list. */
function fireHistoryContentSizeChange(height: number): Promise<void> {
  return fireEvent(screen.getByTestId('message-list'), 'contentSizeChange', 320, height);
}

/** Simulates the user resting 400px above the end of a 800px history in a
 * 400px viewport — far beyond the near-bottom follow threshold (48px). */
function scrollAwayFromEnd(): Promise<void> {
  return fireEvent.scroll(screen.getByTestId('message-list'), {
    nativeEvent: {
      contentOffset: { x: 0, y: 0 },
      contentSize: { width: 320, height: 800 },
      layoutMeasurement: { width: 320, height: 400 },
    },
  });
}

/** A drag gesture that stays at the bottom of the viewport. VirtualizedList
 * reads nativeEvent before the screen's drag guard runs. */
function fireHistoryDrag(
  eventName: 'scrollBeginDrag' | 'scrollEndDrag',
  height: number,
): Promise<void> {
  return fireEvent(screen.getByTestId('message-list'), eventName, {
    nativeEvent: {
      contentOffset: { x: 0, y: 0 },
      contentSize: { width: 320, height },
      layoutMeasurement: { width: 320, height: 400 },
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(FlatList.prototype, 'scrollToEnd')
    .mockImplementation((params?: { animated?: boolean | null | undefined }) => {
      mockScrollToEndCalls.push({ animated: params?.animated === true });
    });
  mockScrollToEndCalls.length = 0;
  mockListSessions.mockResolvedValue({
    projects: [{ key: 'project-one', label: 'Project one' }],
    sessions: [
      {
        id: SESSION_ID,
        title: 'Session one',
        updatedAt: 1,
        projectKey: 'project-one',
        projectLabel: 'Project one',
      },
    ],
    events: [],
  });
  mockListModels.mockResolvedValue({
    models: [DEFAULT_MODEL],
    defaultModel: { providerID: DEFAULT_MODEL.providerID, modelID: DEFAULT_MODEL.modelID },
  });
  mockFetchMessages.mockResolvedValue({ messages: MESSAGES, events: [] });
  mockSendPrompt.mockResolvedValue({ events: [] });
  mockAbort.mockResolvedValue({ events: [] });
  mockReplyToPermission.mockResolvedValue({ events: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ChatScreen', () => {
  it('renders the user and assistant messages for the selected session', async () => {
    await render(<ChatScreen />);

    expect(await screen.findByText('Hello host')).toBeTruthy();
    expect(await screen.findByText('Hello phone')).toBeTruthy();
    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Assistant').length).toBeGreaterThan(0);
  });

  it('pads the screen container with the safe-area insets on top of its base padding', async () => {
    await render(<ChatScreen />);
    await screen.findByText('Hello host');

    // Mocked insets (top 24, bottom 48) composed with the base 16px padding.
    expect(screen.getByTestId('chat-screen')).toHaveStyle({
      padding: 16,
      paddingTop: 40,
      paddingBottom: 64,
    });
  });

  it('does not render a message that belongs to another session', async () => {
    const foreignMessage: ChatMessage = {
      id: 'message-foreign',
      sessionId: 'session-2',
      role: 'assistant',
      text: 'Foreign session message',
    };
    mockFetchMessages.mockResolvedValueOnce({
      messages: [...MESSAGES, foreignMessage],
      events: [],
    });

    await render(<ChatScreen />);

    expect(await screen.findByText('Hello host')).toBeTruthy();
    expect(screen.queryByText('Foreign session message')).toBeNull();
    await waitFor(() => expect(mockFetchMessages).toHaveBeenCalledWith(SESSION_ID));
  });

  it('sends the entered prompt through the session service', async () => {
    await render(<ChatScreen />);
    await screen.findByText('Hello host');

    const input = screen.getByPlaceholderText('Send a prompt');
    await fireEvent.changeText(input, 'Please summarize the diff');
    await fireEvent.press(screen.getByText('Send'));

    await waitFor(() =>
      expect(mockSendPrompt).toHaveBeenCalledWith(SESSION_ID, 'Please summarize the diff', {
        providerID: DEFAULT_MODEL.providerID,
        modelID: DEFAULT_MODEL.modelID,
      }),
    );
  });

  it('sends the model chosen from the model select', async () => {
    mockListModels.mockResolvedValue({
      models: [DEFAULT_MODEL, ALT_MODEL],
      defaultModel: { providerID: DEFAULT_MODEL.providerID, modelID: DEFAULT_MODEL.modelID },
    });

    await render(<ChatScreen />);
    await screen.findByText('Hello host');
    expect(screen.getByText('Big Pickle')).toBeTruthy();
    expect(screen.queryByLabelText('GPT 5')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Model'));
    expect(screen.getByLabelText('GPT 5')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search models'), 'openai');
    expect(screen.queryByLabelText('Big Pickle')).toBeNull();
    expect(screen.getByLabelText('GPT 5')).toBeTruthy();
    expect(screen.getByLabelText('GPT 5').props.accessibilityState).toEqual({ selected: false });
    expect(within(screen.getByLabelText('GPT 5')).getByText(ALT_MODEL.providerID)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('GPT 5'));

    await fireEvent.changeText(screen.getByPlaceholderText('Send a prompt'), 'Use the other model');
    await fireEvent.press(screen.getByText('Send'));

    await waitFor(() =>
      expect(mockSendPrompt).toHaveBeenCalledWith(SESSION_ID, 'Use the other model', {
        providerID: ALT_MODEL.providerID,
        modelID: ALT_MODEL.modelID,
      }),
    );

    await fireEvent.press(screen.getByLabelText('Session'));
    expect(screen.queryByLabelText('Search models')).toBeNull();
  });

  it('shows variant ids in a separate select and sends the chosen id', async () => {
    mockListModels.mockResolvedValue({
      models: [VARIANT_MODEL, { ...ALT_MODEL, variants: [] }],
      defaultModel: { providerID: VARIANT_MODEL.providerID, modelID: VARIANT_MODEL.modelID },
    });

    await render(<ChatScreen />);
    await screen.findByText('Hello host');
    expect(screen.queryByText('None')).toBeNull();
    expect(within(screen.getByLabelText('Variant')).getByText('low')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Variant'));
    expect(screen.getByLabelText('Variant options')).toBeTruthy();
    expect(screen.getByLabelText('low')).toBeTruthy();
    expect(screen.getByLabelText('high')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('high'));

    await fireEvent.changeText(screen.getByPlaceholderText('Send a prompt'), 'Use the high variant');
    await fireEvent.press(screen.getByText('Send'));

    await waitFor(() =>
      expect(mockSendPrompt).toHaveBeenCalledWith(SESSION_ID, 'Use the high variant', {
        providerID: VARIANT_MODEL.providerID,
        modelID: VARIANT_MODEL.modelID,
        variant: 'high',
      }),
    );
  });

  it('omits variant when the selected model has an empty variants array', async () => {
    mockListModels.mockResolvedValue({
      models: [{ ...DEFAULT_MODEL, variants: [] }],
      defaultModel: { providerID: DEFAULT_MODEL.providerID, modelID: DEFAULT_MODEL.modelID },
    });

    await render(<ChatScreen />);
    await screen.findByText('Hello host');
    expect(within(screen.getByLabelText('Variant')).getByText('None')).toBeTruthy();

    await fireEvent.changeText(screen.getByPlaceholderText('Send a prompt'), 'No variant');
    await fireEvent.press(screen.getByText('Send'));

    await waitFor(() =>
      expect(mockSendPrompt).toHaveBeenCalledWith(SESSION_ID, 'No variant', {
        providerID: DEFAULT_MODEL.providerID,
        modelID: DEFAULT_MODEL.modelID,
      }),
    );
    const sentModel = mockSendPrompt.mock.calls[0]?.[2];
    expect(sentModel).not.toHaveProperty('variant');
  });

  it('shows the abort control while busy and hides it after aborting', async () => {
    await render(<ChatScreen />);
    await screen.findByText('Hello host');

    expect(screen.queryByText('Abort')).toBeNull();

    const deferred = createDeferred<SessionActionResult>();
    mockSendPrompt.mockReturnValueOnce(deferred.promise);

    await fireEvent.changeText(
      screen.getByPlaceholderText('Send a prompt'),
      'Run a long task',
    );
    await fireEvent.press(screen.getByText('Send'));

    expect(await screen.findByText('Abort')).toBeTruthy();

    deferred.resolve({ events: [] });
    await waitFor(() => expect(mockSendPrompt).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByText('Abort'));
    await waitFor(() => expect(mockAbort).toHaveBeenCalledWith(SESSION_ID));
    await waitFor(() => expect(screen.queryByText('Abort')).toBeNull());
  });

  it('lists every project and renders only the selected project sessions', async () => {
    mockListSessions.mockResolvedValueOnce({
      projects: PROJECTS,
      sessions: [...ALPHA_SESSIONS, BETA_SESSION],
      events: [],
    });

    await render(<ChatScreen />);

    expect(await screen.findByText('Alpha newest session')).toBeTruthy();
    expect(screen.queryByText('Beta newest session')).toBeNull();
    expect(screen.queryByText('Project')).toBeNull();
    expect(screen.queryByText('Sessions')).toBeNull();
    expect(screen.queryByLabelText('Beta app')).toBeNull();
    expect(screen.queryByLabelText('Project list')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Projects'));

    expect(screen.getByLabelText('Project list')).toBeTruthy();
    const alphaProject = screen.getByLabelText('Alpha app');
    expect(alphaProject.props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('Beta app').props.accessibilityState).toEqual({ selected: false });
    await fireEvent.press(screen.getByLabelText('Alpha app'));

    await fireEvent.press(screen.getByLabelText('Session'));

    expect(
      within(screen.getByLabelText('Session options'))
        .getAllByRole('button')
        .map((option) => option.props.accessibilityLabel),
    ).toEqual(['Alpha newest session', 'Alpha older session']);
  });

  it('renders only the safe project sessions and never a hidden subagent summary', async () => {
    // Safe service data grouping: the host-safe projects list carries root
    // projects only, so a subagent-only project key keeps its session out of
    // every selectable project's chip row.
    const hiddenSummary: SessionSummary = {
      id: 'session-hidden',
      title: 'Hidden subagent session',
      updatedAt: 2,
      projectKey: 'project-alpha-agent',
      projectLabel: 'Alpha app',
    };

    mockListSessions.mockResolvedValueOnce({
      projects: [PROJECTS[0]],
      sessions: [...ALPHA_SESSIONS, hiddenSummary],
      events: [],
    });

    await render(<ChatScreen />);

    expect(await screen.findByText('Alpha newest session')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Session'));
    expect(screen.getByLabelText('Alpha older session')).toBeTruthy();
    expect(screen.queryByText('Hidden subagent session')).toBeNull();
  });

  it('switches projects through selectProject and renders the reset chat state', async () => {
    const alphaMessages: ChatMessage[] = [
      {
        id: 'message-alpha',
        sessionId: 'session-alpha-new',
        role: 'user',
        text: 'Alpha history',
      },
    ];
    const alphaPermissionEvent: NormalizedEvent = {
      name: 'permission.asked',
      properties: {
        id: 'permission-alpha',
        sessionID: 'session-alpha-new',
        title: 'Edit a file in Alpha',
      },
    };

    mockListSessions.mockResolvedValue({
      projects: PROJECTS,
      sessions: [...ALPHA_SESSIONS, BETA_SESSION],
      events: [],
    });
    mockFetchMessages.mockResolvedValueOnce({
      messages: alphaMessages,
      events: [alphaPermissionEvent],
    });

    await render(<ChatScreen />);

    expect(await screen.findByText('Alpha history')).toBeTruthy();
    expect(screen.getByText('Edit a file in Alpha')).toBeTruthy();
    expect(screen.getByText('Approve once')).toBeTruthy();
    expect(screen.queryByText('No messages yet.')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Projects'));
    await fireEvent.press(screen.getByLabelText('Beta app'));

    await waitFor(() => expect(mockFetchMessages).toHaveBeenCalledWith('session-beta-new'));

    expect(screen.getByText('Beta newest session')).toBeTruthy();
    expect(screen.queryByText('Alpha newest session')).toBeNull();
    expect(screen.queryByText('Alpha history')).toBeNull();
    expect(screen.queryByText('Edit a file in Alpha')).toBeNull();
    expect(screen.queryByText('Approve once')).toBeNull();
    expect(screen.getByText('No messages yet.')).toBeTruthy();
  });

  it('shows the empty state when the selected project has no sessions', async () => {
    // A zero-root project stays selectable in the host-safe list while its
    // absence from the sessions payload leaves it genuinely empty.
    const emptyProject: ProjectSummary = { key: 'project-empty', label: 'Empty app' };

    mockListSessions.mockResolvedValueOnce({
      projects: [PROJECTS[0], emptyProject],
      sessions: ALPHA_SESSIONS,
      events: [],
    });

    await render(<ChatScreen />);

    expect(await screen.findByText('Alpha newest session')).toBeTruthy();
    expect(screen.queryByLabelText('Empty app')).toBeNull();
    expect(screen.queryByLabelText('Project list')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Projects'));

    expect(screen.getByLabelText('Project list')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Empty app'));

    expect(screen.getByText('No sessions')).toBeTruthy();
    expect(screen.getByText('No sessions in this project.')).toBeTruthy();
    expect(screen.queryByText('Alpha newest session')).toBeNull();
    expect(screen.getByText('No messages yet.')).toBeTruthy();
  });

  it('keeps the project and session pickers operable under the mocked inset provider', async () => {
    mockListSessions.mockResolvedValueOnce({
      projects: PROJECTS,
      sessions: [...ALPHA_SESSIONS, BETA_SESSION],
      events: [],
    });

    await render(<ChatScreen />);

    expect(await screen.findByText('Alpha newest session')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Session'));
    await fireEvent.press(screen.getByLabelText('Alpha older session'));

    await waitFor(() => expect(mockFetchMessages).toHaveBeenCalledWith('session-alpha-old'));
    expect(screen.getByText('Alpha older session')).toBeTruthy();
    expect(screen.queryByText('Alpha newest session')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Projects'));
    await fireEvent.press(screen.getByLabelText('Beta app'));

    await waitFor(() => expect(mockFetchMessages).toHaveBeenCalledWith('session-beta-new'));
    expect(screen.getByText('Beta newest session')).toBeTruthy();
  });

  it('jumps to the end without animation when the session history loads', async () => {
    await render(<ChatScreen />);
    expect(await screen.findByText('Hello host')).toBeTruthy();

    mockScrollToEndCalls.length = 0;
    await fireHistoryContentSizeChange(240);

    expect(mockScrollToEndCalls).toEqual([{ animated: false }]);
  });

  it('follows new content with an animated scroll while near the bottom', async () => {
    mockSendPrompt.mockResolvedValueOnce({
      events: [createStreamedTextEvent('Hello phone, streamed continuation')],
    });

    await render(<ChatScreen />);
    expect(await screen.findByText('Hello phone')).toBeTruthy();
    await fireHistoryContentSizeChange(240);

    mockScrollToEndCalls.length = 0;
    await fireEvent.changeText(screen.getByPlaceholderText('Send a prompt'), 'Stream more');
    await fireEvent.press(screen.getByText('Send'));
    await waitFor(() =>
      expect(screen.getByText('Hello phone, streamed continuation')).toBeTruthy(),
    );

    await fireHistoryContentSizeChange(400);

    expect(mockScrollToEndCalls).toEqual([{ animated: true }]);
  });

  it('follows near-bottom content without animation when reduce motion starts enabled', async () => {
    const reduceMotionPreference = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);

    await render(<ChatScreen />);
    expect(await screen.findByText('Hello phone')).toBeTruthy();
    await waitFor(() => expect(reduceMotionPreference).toHaveBeenCalledTimes(1));

    await fireHistoryContentSizeChange(240);

    mockScrollToEndCalls.length = 0;
    await fireHistoryContentSizeChange(400);

    expect(mockScrollToEndCalls).toEqual([{ animated: false }]);
  });

  it('does not scroll to the end while the user is dragging the history', async () => {
    await render(<ChatScreen />);
    expect(await screen.findByText('Hello host')).toBeTruthy();
    await fireHistoryContentSizeChange(240);

    mockScrollToEndCalls.length = 0;
    await fireHistoryDrag('scrollBeginDrag', 240);
    await fireHistoryContentSizeChange(400);

    expect(mockScrollToEndCalls).toEqual([]);

    await fireHistoryDrag('scrollEndDrag', 400);
    await fireHistoryContentSizeChange(480);

    expect(mockScrollToEndCalls).toEqual([{ animated: false }]);
  });

  it('does not follow new content after the user has scrolled away from the end', async () => {
    mockSendPrompt.mockResolvedValueOnce({
      events: [createStreamedTextEvent('Hello phone, streamed continuation')],
    });

    await render(<ChatScreen />);
    expect(await screen.findByText('Hello phone')).toBeTruthy();
    await fireHistoryContentSizeChange(240);
    await scrollAwayFromEnd();

    mockScrollToEndCalls.length = 0;
    await fireEvent.changeText(screen.getByPlaceholderText('Send a prompt'), 'Stream more');
    await fireEvent.press(screen.getByText('Send'));
    await waitFor(() =>
      expect(screen.getByText('Hello phone, streamed continuation')).toBeTruthy(),
    );

    await fireHistoryContentSizeChange(400);

    expect(mockScrollToEndCalls).toEqual([]);
  });

  it('re-arms the jump to the end when the selected session changes', async () => {
    mockListSessions.mockResolvedValueOnce({
      projects: [{ key: 'project-one', label: 'Project one' }],
      sessions: [
        {
          id: SESSION_ID,
          title: 'Session one',
          updatedAt: 1,
          projectKey: 'project-one',
          projectLabel: 'Project one',
        },
        {
          id: SECOND_SESSION_ID,
          title: 'Session two',
          updatedAt: 2,
          projectKey: 'project-one',
          projectLabel: 'Project one',
        },
      ],
      events: [],
    });
    mockFetchMessages.mockResolvedValueOnce({ messages: MESSAGES, events: [] });
    mockFetchMessages.mockResolvedValueOnce({ messages: SECOND_MESSAGES, events: [] });

    await render(<ChatScreen />);
    expect(await screen.findByText('Hello host')).toBeTruthy();
    await fireHistoryContentSizeChange(240);
    // Consume the initial jump, then leave the end so only a re-armed jump
    // can reach it again.
    await scrollAwayFromEnd();

    await fireEvent.press(screen.getByLabelText('Session'));
    await fireEvent.press(screen.getByLabelText('Session two'));

    expect(await screen.findByText('Second session history')).toBeTruthy();

    mockScrollToEndCalls.length = 0;
    await fireHistoryContentSizeChange(120);

    expect(mockScrollToEndCalls).toEqual([{ animated: false }]);
  });

  it('starts a reasoning row collapsed and reveals the body in the same list', async () => {
    const items: TranscriptItem[] = [
      { kind: 'text', id: 'message-user', sessionId: SESSION_ID, role: 'user', text: 'Hello host' },
      {
        kind: 'reasoning',
        id: 'reason-1',
        sessionId: SESSION_ID,
        text: 'Hidden reasoning body',
        start: 5,
        end: 15,
      },
    ];
    mockFetchMessages.mockResolvedValue({ messages: MESSAGES, items, events: [] });

    await render(<ChatScreen />);

    expect(await screen.findByText('Thought 10ms')).toBeTruthy();
    expect(screen.queryByText('Hidden reasoning body')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Thought 10ms'));

    expect(screen.getByText('Hidden reasoning body')).toBeTruthy();
    expect(screen.getByText('Hello host')).toBeTruthy();
  });

  it('renders an edit card with its path', async () => {
    const items: TranscriptItem[] = [
      { kind: 'text', id: 'message-user', sessionId: SESSION_ID, role: 'user', text: 'Hello host' },
      {
        kind: 'edit',
        id: 'edit-1',
        sessionId: SESSION_ID,
        tool: 'edit',
        status: 'completed',
        path: '/host/project/file.ts',
      },
    ];
    mockFetchMessages.mockResolvedValue({ messages: MESSAGES, items, events: [] });

    await render(<ChatScreen />);

    expect(await screen.findByText('Edit /host/project/file.ts')).toBeTruthy();
    expect(screen.queryByText('completed')).toBeNull();
  });

  it('renders an edit diff hunk inside the card', async () => {
    const items: TranscriptItem[] = [
      {
        kind: 'edit',
        id: 'edit-1',
        sessionId: SESSION_ID,
        tool: 'edit',
        status: 'completed',
        path: '/host/project/file.ts',
        diff: [
          'Index: file.ts',
          '===',
          '--- a/file.ts',
          '+++ b/file.ts',
          '@@ -1 +1 @@',
          '-removed visible line',
          '+added visible line',
        ].join('\n'),
        additions: 1,
        deletions: 1,
      },
    ];
    mockFetchMessages.mockResolvedValue({ messages: MESSAGES, items, events: [] });

    await render(<ChatScreen />);

    expect(await screen.findByText('Edit /host/project/file.ts')).toBeTruthy();
    expect(screen.getByText('+1 -1')).toBeTruthy();
    expect(screen.getByText('+added visible line')).toBeTruthy();
    expect(screen.getByText('-removed visible line')).toBeTruthy();
    expect(screen.queryByText('--- a/file.ts')).toBeNull();
    expect(screen.queryByText('ONLY_IN_OLD_STRING')).toBeNull();
  });

  it('starts a bash tool row collapsed and reveals the output in the same list', async () => {
    const items: TranscriptItem[] = [
      { kind: 'text', id: 'message-user', sessionId: SESSION_ID, role: 'user', text: 'Hello host' },
      {
        kind: 'tool',
        id: 'bash-1',
        sessionId: SESSION_ID,
        tool: 'bash',
        status: 'completed',
        title: 'ls',
        output: 'listed files',
      },
    ];
    mockFetchMessages.mockResolvedValue({ messages: MESSAGES, items, events: [] });

    await render(<ChatScreen />);

    expect(await screen.findByText('ls')).toBeTruthy();
    expect(screen.queryByText('listed files')).toBeNull();

    await fireEvent.press(screen.getByLabelText('ls'));

    expect(screen.getByText('listed files')).toBeTruthy();
    expect(screen.getByText('Hello host')).toBeTruthy();
  });

  it('opens the child transcript when a task press fetches that child session', async () => {
    const items: TranscriptItem[] = [
      { kind: 'text', id: 'message-user', sessionId: SESSION_ID, role: 'user', text: 'Hello host' },
      {
        kind: 'task',
        id: 'task-1',
        sessionId: SESSION_ID,
        label: 'Inspect the child',
        agent: 'forge',
        status: 'completed',
        childSessionId: 'child-ses-1',
      },
    ];
    mockFetchMessages.mockImplementation(async (sessionID: string) => {
      if (sessionID === 'child-ses-1') {
        return {
          messages: [
            {
              id: 'child-message',
              sessionId: 'child-ses-1',
              role: 'assistant',
              text: 'Child session text',
            },
          ],
          events: [],
        };
      }
      return { messages: MESSAGES, items, events: [] };
    });

    await render(<ChatScreen />);

    expect(await screen.findByText('Forge Task – Inspect the child')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Forge Task – Inspect the child'));

    expect(await screen.findByText('Child session text')).toBeTruthy();
    expect(mockFetchMessages).toHaveBeenCalledWith('child-ses-1');
    expect(screen.queryByText('Hello host')).toBeNull();
  });

  it('opens a child session from a task row and restores the parent transcript on Back', async () => {
    const textItem: TranscriptItem = {
      kind: 'text',
      id: 'message-user',
      sessionId: SESSION_ID,
      role: 'user',
      text: 'Hello host',
    };
    const taskWithoutChild: TranscriptItem = {
      kind: 'task',
      id: 'task-1',
      sessionId: SESSION_ID,
      label: 'Fix hook mapping leak',
      agent: 'forge',
      status: 'completed',
    };
    const taskWithChild: TranscriptItem = {
      ...taskWithoutChild,
      childSessionId: 'child-ses-1',
    };
    let parentReads = 0;
    mockFetchMessages.mockImplementation(async (sessionID: string) => {
      if (sessionID === 'child-ses-1') {
        return {
          messages: [
            {
              id: 'child-message',
              sessionId: 'child-ses-1',
              role: 'assistant',
              text: 'Child session text',
            },
          ],
          events: [],
        };
      }
      parentReads += 1;
      return {
        messages: MESSAGES,
        items: [textItem, parentReads > 1 ? taskWithChild : taskWithoutChild],
        events: [],
      };
    });

    await render(<ChatScreen />);

    expect(await screen.findByText('Hello host')).toBeTruthy();
    expect(screen.getByText('Forge Task – Fix hook mapping leak')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Forge Task – Fix hook mapping leak'));

    expect(await screen.findByText('Child session text')).toBeTruthy();
    expect(screen.queryByText('Hello host')).toBeNull();

    await fireEvent.press(screen.getByText('Back'));

    expect(await screen.findByText('Hello host')).toBeTruthy();
    expect(screen.queryByText('Child session text')).toBeNull();
  });
});
