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
} from '@/modules/session/domain/entities/session';
import { SessionServiceError } from '@/modules/session/domain/errors/session-service.error';

const mockListSessions = jest.fn<Promise<SessionListResult | SessionServiceError>, []>();
const mockFetchMessages = jest.fn<Promise<SessionPollResult | SessionServiceError>, [string]>();
const mockListModels = jest.fn<Promise<ModelListResult | SessionServiceError>, []>();
const mockSendPrompt = jest.fn<
  Promise<SessionActionResult | SessionServiceError>,
  [string, string, { providerID: string; modelID: string }]
>();
const mockAbort = jest.fn<Promise<SessionActionResult | SessionServiceError>, [string]>();
const mockReplyToPermission = jest.fn<
  Promise<SessionActionResult | SessionServiceError>,
  [string, string, 'once' | 'reject']
>();

jest.mock('@/modules/session/services/session.service', () => ({
  sessionService: {
    listSessions: () => mockListSessions(),
    listModels: () => mockListModels(),
    fetchMessages: (sessionID: string) => mockFetchMessages(sessionID),
    sendPrompt: (
      sessionID: string,
      text: string,
      model: { providerID: string; modelID: string },
    ) => mockSendPrompt(sessionID, text, model),
    abort: (sessionID: string) => mockAbort(sessionID),
    replyToPermission: (sessionID: string, permissionID: string, decision: 'once' | 'reject') =>
      mockReplyToPermission(sessionID, permissionID, decision),
  },
}));

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
};

const ALT_MODEL: ModelChoice = {
  providerID: 'openai',
  modelID: 'gpt-5',
  label: 'GPT 5',
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

    await fireEvent.press(screen.getByLabelText('Model'));
    expect(screen.getByLabelText('GPT 5').props.accessibilityState).toEqual({ selected: false });
    await fireEvent.press(screen.getByLabelText('GPT 5'));

    await fireEvent.changeText(screen.getByPlaceholderText('Send a prompt'), 'Use the other model');
    await fireEvent.press(screen.getByText('Send'));

    await waitFor(() =>
      expect(mockSendPrompt).toHaveBeenCalledWith(SESSION_ID, 'Use the other model', {
        providerID: ALT_MODEL.providerID,
        modelID: ALT_MODEL.modelID,
      }),
    );
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
});
