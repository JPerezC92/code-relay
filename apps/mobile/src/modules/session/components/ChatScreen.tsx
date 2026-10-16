import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Button,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PermissionCard } from '@/modules/session/components/PermissionCard';
import { useSession } from '@/modules/session/hooks/use-session';
import type {
  ChatMessage,
  EditCard,
  PermissionRequest,
  ReasoningRow,
  SubagentRow,
  ToolRow,
  TranscriptItem,
} from '@/modules/session/domain/entities/session';
import { formatSubagentLabel, subagentTitle } from '@/modules/session/domain/entities/session';

interface SelectOption {
  key: string;
  label: string;
  selected: boolean;
  detail?: string;
}

/** Distance in pixels from the end of the history within which newly arrived
 * content still auto-follows the end. */
export const NEAR_BOTTOM_THRESHOLD_PX = 48;

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      <Text style={styles.role}>{isUser ? 'You' : 'Assistant'}</Text>
      <Text style={styles.messageText}>{message.text}</Text>
    </View>
  );
}

interface ReasoningRowViewProps {
  item: ReasoningRow;
}

function reasoningLabel(item: ReasoningRow): string {
  if (typeof item.start === 'number' && typeof item.end === 'number') {
    return `Thought ${item.end - item.start}ms`;
  }
  return 'Thinking';
}

function ReasoningRowView({ item }: ReasoningRowViewProps) {
  const [expanded, setExpanded] = useState(false);
  const label = reasoningLabel(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => setExpanded((current) => !current)}
      style={styles.activityRow}
    >
      <Text style={styles.activityLabel}>{label}</Text>
      {expanded ? <Text style={styles.messageText}>{item.text}</Text> : null}
    </Pressable>
  );
}

interface EditCardViewProps {
  item: EditCard;
}

function editHeader(item: EditCard): string {
  return item.path.length > 0 ? `Edit ${item.path}` : item.tool;
}

function editStats(item: EditCard): string | null {
  const parts: string[] = [];
  if (typeof item.additions === 'number') parts.push(`+${item.additions}`);
  if (typeof item.deletions === 'number') parts.push(`-${item.deletions}`);
  return parts.length === 0 ? null : parts.join(' ');
}

function skipDiffLine(line: string): boolean {
  return (
    line.startsWith('Index:') ||
    line.startsWith('===') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ')
  );
}

function diffLineStyle(line: string): object {
  if (line.startsWith('+')) return styles.diffAdded;
  if (line.startsWith('-')) return styles.diffRemoved;
  if (line.startsWith('@@')) return styles.diffHunk;
  return styles.diffContext;
}

interface EditDiffProps {
  diff: string;
}

function EditDiff({ diff }: EditDiffProps) {
  const lines = diff.split('\n').filter((line) => line.length > 0 && !skipDiffLine(line));
  return (
    <ScrollView horizontal style={styles.diffBlock}>
      <View style={styles.diffLines}>
        {lines.map((line, index) => (
          <Text
            key={`${index}:${line}`}
            numberOfLines={1}
            style={[styles.diffLine, diffLineStyle(line)]}
          >
            {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

function EditCardView({ item }: EditCardViewProps) {
  const header = editHeader(item);
  const stats = editStats(item);
  const showStatus = item.status.length > 0 && item.status !== 'completed';
  return (
    <View accessibilityLabel={header} style={styles.editCard}>
      <View style={styles.editHeader}>
        <Text style={styles.activityLabel}>{header}</Text>
        {stats !== null ? <Text style={styles.messageText}>{stats}</Text> : null}
      </View>
      {showStatus ? <Text style={styles.messageText}>{item.status}</Text> : null}
      {item.diff !== undefined && item.diff.length > 0 ? <EditDiff diff={item.diff} /> : null}
    </View>
  );
}

interface ToolRowViewProps {
  item: ToolRow;
}

function ToolRowView({ item }: ToolRowViewProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = item.output !== undefined && item.output.length > 0;
  if (!hasOutput) {
    return (
      <View accessibilityLabel={item.title} style={styles.activityRow}>
        <Text style={styles.activityLabel}>{item.title}</Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => setExpanded((current) => !current)}
      style={styles.activityRow}
    >
      <Text style={styles.activityLabel}>{item.title}</Text>
      {expanded ? <Text style={styles.messageText}>{item.output}</Text> : null}
    </Pressable>
  );
}

function visibleTaskLabel(item: SubagentRow): string {
  if (item.agent === undefined || item.agent.length === 0) return item.label;
  return formatSubagentLabel(item.agent, subagentTitle(item.agent, item.label));
}

function isTaskPressable(item: SubagentRow): boolean {
  if (item.childSessionId !== undefined && item.childSessionId.length > 0) return true;
  if (item.agent !== undefined && item.agent.length > 0) return true;
  return item.title !== undefined && item.title.length > 0;
}

interface SubagentRowViewProps {
  item: SubagentRow;
  onOpen: (row: SubagentRow) => void;
}

function SubagentRowView({ item, onOpen }: SubagentRowViewProps) {
  const label = visibleTaskLabel(item);
  if (!isTaskPressable(item)) {
    return (
      <View accessibilityLabel={label} style={styles.activityRow}>
        <Text style={styles.activityLabel}>{label}</Text>
        <Text style={styles.messageText}>{item.status}</Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onOpen(item)}
      style={styles.activityRow}
    >
      <Text style={styles.activityLabel}>{label}</Text>
      <Text style={styles.messageText}>{item.status}</Text>
    </Pressable>
  );
}

interface TranscriptRowProps {
  item: TranscriptItem;
  onOpenChild: (row: SubagentRow) => void;
}

function TranscriptRow({ item, onOpenChild }: TranscriptRowProps) {
  if (item.kind === 'text') {
    const message: ChatMessage = {
      id: item.id,
      sessionId: item.sessionId,
      role: item.role,
      text: item.text,
    };
    return <MessageBubble message={message} />;
  }
  if (item.kind === 'reasoning') return <ReasoningRowView item={item} />;
  if (item.kind === 'edit') return <EditCardView item={item} />;
  if (item.kind === 'tool') return <ToolRowView item={item} />;
  return <SubagentRowView item={item} onOpen={onOpenChild} />;
}

interface ChoiceSelectProps {
  accessibilityLabel: string;
  optionsLabel: string;
  closedLabel: string;
  options: SelectOption[];
  onSelect: (key: string) => void;
  searchable?: boolean;
}

/**
 * Closed select plus a modal option list. Native Pressable keeps a 44px target
 * and an explicit selected state without a picker dependency.
 */
function ChoiceSelect({
  accessibilityLabel,
  optionsLabel,
  closedLabel,
  options,
  onSelect,
  searchable = false,
}: ChoiceSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions =
    !searchable || normalizedQuery.length === 0
      ? options
      : options.filter((option) => {
          const labelMatches = option.label.toLowerCase().includes(normalizedQuery);
          const detailMatches =
            typeof option.detail === 'string' &&
            option.detail.toLowerCase().includes(normalizedQuery);
          return labelMatches || detailMatches;
        });

  const closeSheet = (): void => {
    setQuery('');
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => setOpen(true)}
        style={styles.selectTrigger}
      >
        <Text style={styles.selectTriggerText}>{closedLabel}</Text>
      </Pressable>
      {open ? (
        <Modal visible={open} transparent animationType="none" onRequestClose={closeSheet}>
          <View style={styles.modalBackdrop}>
            <View
              accessibilityLabel={optionsLabel}
              style={[styles.modalSheet, styles.choiceSheet]}
            >
              {searchable ? (
                <TextInput
                  accessibilityLabel="Search models"
                  placeholder="Search models"
                  autoCapitalize="none"
                  value={query}
                  onChangeText={setQuery}
                  style={styles.searchInput}
                />
              ) : null}
              <FlatList
                data={visibleOptions}
                keyExtractor={(option) => option.key}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={12}
                windowSize={5}
                getItemLayout={(_data, index) => ({ length: 68, offset: 68 * index, index })}
                renderItem={({ item: option }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: option.selected }}
                    onPress={() => {
                      onSelect(option.key);
                      closeSheet();
                    }}
                    style={[
                      styles.option,
                      option.selected ? styles.optionSelected : styles.optionIdle,
                    ]}
                  >
                    <Text style={option.selected ? styles.optionTextSelected : styles.optionText}>
                      {option.label}
                    </Text>
                    {typeof option.detail === 'string' && option.detail.length > 0 ? (
                      <Text
                        style={
                          option.selected ? styles.optionDetailSelected : styles.optionDetail
                        }
                      >
                        {option.detail}
                      </Text>
                    ) : null}
                  </Pressable>
                )}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

/**
 * Chat and supervision screen for one session: message history plus live event
 * text, a prompt composer, an abort control while the host is busy, and a
 * two-choice permission card whenever the host asks for one.
 */
export function ChatScreen() {
  const {
    projects,
    selectedProjectKey,
    projectSessions,
    selectedSessionId,
    models,
    selectedModel,
    selectedVariant,
    transcript,
    childSessionId,
    permissions,
    status,
    isLoading,
    error,
    selectProject,
    selectSession,
    selectModel,
    selectVariant,
    sendPrompt,
    abort,
    replyToPermission,
    openTaskRow,
    closeChildSession,
  } = useSession();
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const listRef = useRef<FlatList<TranscriptItem> | null>(null);
  // Whether the user's scroll position is close enough to the end that newly
  // arrived content may follow it. Starts true: a fresh session tracks itself.
  const nearBottomRef = useRef(true);
  // True from finger-down until the drag or its momentum ends. Content-size
  // changes must not fight an in-progress scroll.
  const draggingRef = useRef(false);
  // Set on mount and on session changes; consumed when real message content
  // arrives, which is then jumped to the end without animation.
  const pendingJumpRef = useRef(true);

  useEffect(() => {
    let isMounted = true;
    const updateReduceMotionEnabled = (isEnabled: boolean): void => {
      if (isMounted) {
        setReduceMotionEnabled(isEnabled);
      }
    };

    void AccessibilityInfo.isReduceMotionEnabled().then(updateReduceMotionEnabled);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      updateReduceMotionEnabled,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    pendingJumpRef.current = true;
    nearBottomRef.current = true;
    listRef.current?.scrollToEnd({ animated: false });
  }, [selectedSessionId]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height === 0) {
      nearBottomRef.current = true;
      return;
    }
    const distanceFromEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
    nearBottomRef.current = distanceFromEnd <= NEAR_BOTTOM_THRESHOLD_PX;
  };

  const handleScrollBeginDrag = (): void => {
    draggingRef.current = true;
  };

  const handleScrollEndDrag = (): void => {
    draggingRef.current = false;
  };

  const handleMomentumScrollEnd = (): void => {
    draggingRef.current = false;
  };

  const handleContentSizeChange = (_width: number, height: number): void => {
    if (height <= 0) return;
    if (draggingRef.current) return;
    if (pendingJumpRef.current) {
      pendingJumpRef.current = false;
      listRef.current?.scrollToEnd({ animated: false });
      return;
    }
    if (nearBottomRef.current) {
      listRef.current?.scrollToEnd({ animated: !reduceMotionEnabled });
    }
  };

  const isBusy = status === 'busy';
  const canSend =
    prompt.trim().length > 0 && !isBusy && selectedSessionId !== null && selectedModel !== null;
  const selectedSession =
    projectSessions.find((session) => session.id === selectedSessionId) ?? null;

  const handleSend = (): void => {
    if (!canSend) return;
    const text = prompt;
    setPrompt('');
    void sendPrompt(text);
  };

  const handleApproveOnce = (permission: PermissionRequest): void => {
    void replyToPermission(permission.id, 'once');
  };

  const handleReject = (permission: PermissionRequest): void => {
    void replyToPermission(permission.id, 'reject');
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.keyboardAvoiding}>
      <View
        testID="chat-screen"
        style={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Projects"
            onPress={() => setProjectsOpen(true)}
            style={styles.hamburger}
          >
            <Text style={styles.hamburgerMark}>☰</Text>
          </Pressable>
          <Text style={styles.title}>CodeRelay</Text>
        </View>
        <Modal
          visible={projectsOpen}
          transparent
          animationType="none"
          onRequestClose={() => setProjectsOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View accessibilityLabel="Project list" style={styles.modalSheet}>
              {projects.map((project) => {
                const selected = project.key === selectedProjectKey;
                return (
                  <Pressable
                    key={project.key}
                    accessibilityRole="button"
                    accessibilityLabel={project.label}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      selectProject(project.key);
                      setProjectsOpen(false);
                    }}
                    style={[styles.option, selected ? styles.optionSelected : styles.optionIdle]}
                  >
                    <Text style={selected ? styles.optionTextSelected : styles.optionText}>
                      {project.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Modal>
        <ChoiceSelect
          accessibilityLabel="Session"
          optionsLabel="Session options"
          closedLabel={selectedSession?.title ?? 'No sessions'}
          options={projectSessions.map((session) => ({
            key: session.id,
            label: session.title,
            selected: session.id === selectedSessionId,
          }))}
          onSelect={selectSession}
        />
        {selectedProjectKey !== null && projectSessions.length === 0 ? (
          <Text style={styles.hint}>No sessions in this project.</Text>
        ) : null}
        <ChoiceSelect
          accessibilityLabel="Model"
          optionsLabel="Model options"
          closedLabel={selectedModel?.label ?? 'No models'}
          options={models.map((model) => ({
            key: `${model.providerID}/${model.modelID}`,
            label: model.label,
            detail: model.providerID,
            selected:
              selectedModel !== null &&
              model.providerID === selectedModel.providerID &&
              model.modelID === selectedModel.modelID,
          }))}
          searchable
          onSelect={(key) => {
            const model = models.find((row) => `${row.providerID}/${row.modelID}` === key);
            if (model !== undefined) selectModel(model);
          }}
        />
        <ChoiceSelect
          accessibilityLabel="Variant"
          optionsLabel="Variant options"
          closedLabel={selectedVariant ?? 'None'}
          options={(selectedModel?.variants ?? []).map((variantID) => ({
            key: variantID,
            label: variantID,
            selected: variantID === selectedVariant,
          }))}
          onSelect={selectVariant}
        />
        {isLoading ? <Text style={styles.hint}>Loading sessions…</Text> : null}
        {childSessionId !== null ? (
          <Modal visible animationType="none" onRequestClose={closeChildSession}>
            <View
              testID="child-session"
              style={[
                styles.container,
                { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
              ]}
            >
              <View style={styles.childHeader}>
                <Button title="Back" onPress={closeChildSession} />
              </View>
              <FlatList
                ref={listRef}
                testID="message-list"
                style={styles.list}
                data={transcript}
                keyExtractor={(item) => `${item.kind}:${item.id}`}
                renderItem={({ item }) => (
                  <TranscriptRow
                    item={item}
                    onOpenChild={(row) => void openTaskRow(row)}
                  />
                )}
                ListEmptyComponent={<Text style={styles.hint}>No messages yet.</Text>}
                onScroll={handleScroll}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScrollEndDrag={handleScrollEndDrag}
                onMomentumScrollEnd={handleMomentumScrollEnd}
                onContentSizeChange={handleContentSizeChange}
                scrollEventThrottle={16}
              />
            </View>
          </Modal>
        ) : (
          <FlatList
            ref={listRef}
            testID="message-list"
            style={styles.list}
            data={transcript}
            keyExtractor={(item) => `${item.kind}:${item.id}`}
            renderItem={({ item }) => (
              <TranscriptRow
                item={item}
                onOpenChild={(row) => void openTaskRow(row)}
              />
            )}
            ListEmptyComponent={<Text style={styles.hint}>No messages yet.</Text>}
            onScroll={handleScroll}
            onScrollBeginDrag={handleScrollBeginDrag}
            onScrollEndDrag={handleScrollEndDrag}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onContentSizeChange={handleContentSizeChange}
            scrollEventThrottle={16}
          />
        )}
        {permissions.map((permission) => (
          <PermissionCard
            key={permission.id}
            permission={permission}
            onApproveOnce={() => handleApproveOnce(permission)}
            onReject={() => handleReject(permission)}
          />
        ))}
        {isBusy ? (
          <View style={styles.abort}>
            <Button
              title="Abort"
              color="#b91c1c"
              onPress={() => {
                void abort();
              }}
            />
          </View>
        ) : null}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Send a prompt"
            placeholderTextColor="#6b7280"
            editable={!isBusy && selectedSessionId !== null && selectedModel !== null}
            multiline
          />
          <Button title="Send" onPress={handleSend} disabled={!canSend} />
        </View>
        {error !== null ? (
          <Text style={styles.error} testID="session-error">
            {error}
          </Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  hamburger: {
    minHeight: 44,
    minWidth: 44,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6b7280',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  hamburgerMark: {
    fontSize: 20,
    color: '#111827',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  selectTrigger: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#6b7280',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  selectTriggerText: {
    fontSize: 16,
    color: '#111827',
  },
  searchInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(17, 24, 39, 0.4)',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 8,
  },
  choiceSheet: {
    maxHeight: '70%',
  },
  option: {
    minHeight: 62,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  optionIdle: {
    backgroundColor: '#ffffff',
    borderColor: '#6b7280',
  },
  optionSelected: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  optionText: {
    fontSize: 16,
    color: '#111827',
  },
  optionTextSelected: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  optionDetail: {
    fontSize: 12,
    color: '#4b5563',
  },
  optionDetailSelected: {
    fontSize: 12,
    color: '#dbeafe',
  },
  list: {
    flex: 1,
  },
  childHeader: {
    marginBottom: 8,
  },
  activityRow: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    backgroundColor: '#eef2ff',
    alignSelf: 'stretch',
  },
  editCard: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    backgroundColor: '#fef3c7',
    alignSelf: 'stretch',
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  diffBlock: {
    marginTop: 6,
  },
  diffLines: {
    alignItems: 'flex-start',
  },
  diffLine: {
    flexShrink: 0,
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#111827',
  },
  diffAdded: {
    backgroundColor: '#dcfce7',
  },
  diffRemoved: {
    backgroundColor: '#fee2e2',
  },
  diffHunk: {
    color: '#6b7280',
  },
  diffContext: {},
  activityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  bubble: {
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  userBubble: {
    backgroundColor: '#dbeafe',
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    backgroundColor: '#f3f4f6',
    alignSelf: 'flex-start',
  },
  role: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    color: '#1f2937',
  },
  messageText: {
    fontSize: 15,
    color: '#111827',
  },
  hint: {
    fontSize: 14,
    marginVertical: 8,
    color: '#374151',
  },
  abort: {
    marginVertical: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 120,
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  error: {
    marginTop: 8,
    color: '#b91c1c',
  },
});
