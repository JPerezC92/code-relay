import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Button,
  FlatList,
  KeyboardAvoidingView,
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
import type { ChatMessage, PermissionRequest } from '@/modules/session/domain/entities/session';

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

interface ChipButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * Picker chip on the native Pressable: a 44px minimum touch target, explicit
 * selected state for screen readers and sighted users, and explicit light-safe
 * colors that hold regardless of the system color scheme.
 */
function ChipButton({ label, selected, onPress }: ChipButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
    >
      <Text style={selected ? styles.chipTextSelected : styles.chipText}>{label}</Text>
    </Pressable>
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
    messages,
    permissions,
    status,
    isLoading,
    error,
    selectProject,
    selectSession,
    sendPrompt,
    abort,
    replyToPermission,
  } = useSession();
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState('');
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
  const canSend = prompt.trim().length > 0 && !isBusy && selectedSessionId !== null;
  const hasProjects = projects.length > 0;

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
        style={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <Text style={styles.title}>CodeRelay</Text>
        {hasProjects ? (
          <>
            <Text accessibilityRole="header" style={styles.sectionHeading}>
              Project
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
              contentContainerStyle={styles.chipRowContent}
            >
              {projects.map((project) => (
                <ChipButton
                  key={project.key}
                  label={
                    project.key === selectedProjectKey
                      ? `Selected: ${project.label}`
                      : project.label
                  }
                  selected={project.key === selectedProjectKey}
                  onPress={() => selectProject(project.key)}
                />
              ))}
            </ScrollView>
          </>
        ) : null}
        {hasProjects ? (
          <>
            <Text accessibilityRole="header" style={styles.sectionHeading}>
              Sessions
            </Text>
            {projectSessions.length === 0 ? (
              <Text style={styles.hint}>No sessions in this project.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipRow}
                contentContainerStyle={styles.chipRowContent}
              >
                {projectSessions.map((session) => (
                  <ChipButton
                    key={session.id}
                    label={
                      session.id === selectedSessionId
                        ? `Selected: ${session.title}`
                        : session.title
                    }
                    selected={session.id === selectedSessionId}
                    onPress={() => selectSession(session.id)}
                  />
                ))}
              </ScrollView>
            )}
          </>
        ) : null}
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
            editable={!isBusy && selectedSessionId !== null}
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
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    color: '#111827',
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 4,
    marginBottom: 4,
  },
  chipRow: {
    flexGrow: 0,
    marginBottom: 8,
  },
  chipRowContent: {
    alignItems: 'center',
  },
  chip: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipUnselected: {
    backgroundColor: '#ffffff',
    borderColor: '#6b7280',
  },
  chipSelected: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  chipText: {
    fontSize: 14,
    color: '#111827',
  },
  chipTextSelected: {
    fontSize: 14,
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
