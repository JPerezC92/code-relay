import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Button,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PermissionCard } from '@/modules/session/components/PermissionCard';
import { useSession } from '@/modules/session/hooks/use-session';
import type { ChatMessage, PermissionRequest } from '@/modules/session/domain/entities/session';

interface SelectOption {
  key: string;
  label: string;
  selected: boolean;
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

interface ChoiceSelectProps {
  accessibilityLabel: string;
  optionsLabel: string;
  closedLabel: string;
  options: SelectOption[];
  onSelect: (key: string) => void;
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
}: ChoiceSelectProps) {
  const [open, setOpen] = useState(false);
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
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityLabel={optionsLabel} style={styles.modalSheet}>
            {options.map((option) => (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: option.selected }}
                onPress={() => {
                  onSelect(option.key);
                  setOpen(false);
                }}
                style={[styles.option, option.selected ? styles.optionSelected : styles.optionIdle]}
              >
                <Text style={option.selected ? styles.optionTextSelected : styles.optionText}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
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
    messages,
    permissions,
    status,
    isLoading,
    error,
    selectProject,
    selectSession,
    selectModel,
    sendPrompt,
    abort,
    replyToPermission,
  } = useSession();
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  // Whether the user's scroll position is close enough to the end that newly
  // arrived content may follow it. Starts true: a fresh session tracks itself.
  const nearBottomRef = useRef(true);
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

  const handleContentSizeChange = (_width: number, height: number): void => {
    if (height <= 0) return;
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
            selected:
              selectedModel !== null &&
              model.providerID === selectedModel.providerID &&
              model.modelID === selectedModel.modelID,
          }))}
          onSelect={(key) => {
            const model = models.find((row) => `${row.providerID}/${row.modelID}` === key);
            if (model !== undefined) selectModel(model);
          }}
        />
        {isLoading ? <Text style={styles.hint}>Loading sessions…</Text> : null}
        <FlatList
          ref={listRef}
          testID="message-list"
          style={styles.list}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListEmptyComponent={<Text style={styles.hint}>No messages yet.</Text>}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          scrollEventThrottle={16}
        />
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
  option: {
    minHeight: 44,
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
  list: {
    flex: 1,
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
