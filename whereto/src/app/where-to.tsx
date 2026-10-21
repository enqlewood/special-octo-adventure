import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACCENT, RestaurantCard } from '@/components/restaurant-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccount } from '@/lib/account';
import { apiFetch, type ChatMessage } from '@/lib/api';
import { getLocation } from '@/lib/location';

type Message = ChatMessage & { id: string };
type ChatSummary = { id: string; title: string; updated_at: string };

const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let nextId = 0;
const newId = () => String(nextId++);

const greeting = (): Message => ({
  id: newId(),
  role: 'assistant',
  text: "Hey! Tell me what you're in the mood for - cuisine, budget, how far you want to go - and I'll find some spots.",
});

export default function WhereToScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const { user, token } = useAccount();
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const warnedNoLocation = useRef(false);
  const [messages, setMessages] = useState<Message[]>(() => [greeting()]);
  // Set once a signed-in user's chat has been saved, so later turns add to it.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[] | null>(null); // non-null = list is open

  function startNewChat() {
    setMessages([greeting()]);
    setConversationId(null);
    setChats(null);
  }

  // Signing in or out starts a fresh chat, so one account's chat never
  // continues into another's.
  useEffect(startNewChat, [user?.id]);

  async function toggleChats() {
    if (chats) return setChats(null);
    try {
      const res = await apiFetch<{ conversations: ChatSummary[] }>('/api/conversations', { token });
      if (res.ok) setChats(res.data.conversations);
    } catch {}
  }

  async function openChat(id: string) {
    try {
      const res = await apiFetch<{ messages: ChatMessage[] }>(`/api/conversations/${id}`, { token });
      if (!res.ok) return;
      setMessages(res.data.messages.map((m) => ({ ...m, id: newId() })));
      setConversationId(id);
      setChats(null);
    } catch {}
  }

  async function deleteChat(id: string) {
    setChats((c) => c?.filter((chat) => chat.id !== id) ?? null);
    if (id === conversationId) startNewChat();
    apiFetch(`/api/conversations/${id}`, { token, method: 'DELETE' }).catch(() => {});
  }

  async function send() {
    const message = input.trim();
    if (!message || loading) return;

    setMessages((m) => [...m, { id: newId(), role: 'user', text: message }]);
    setInput('');
    setLoading(true);

    try {
      const location = await getLocation();
      if (!location && !warnedNoLocation.current) {
        warnedNoLocation.current = true;
        setMessages((m) => [
          ...m,
          {
            id: newId(),
            role: 'assistant',
            text: "I couldn't get your location, so results may not be nearby. You can turn on location for this app in Settings.",
          },
        ]);
      }
      const res = await apiFetch('/api/chat', {
        token,
        method: 'POST',
        body: token ? { conversationId, message, location } : { sessionId, message, location },
      });
      const data = res.data ?? {};

      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { id: newId(), role: 'assistant', text: data.error || 'Something went wrong. Try again?' },
        ]);
        return;
      }

      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((m) => [
        ...m,
        { id: newId(), role: 'assistant', text: data.reply },
        ...(data.restaurants?.length
          ? [{ id: newId(), role: 'results' as const, restaurants: data.restaurants }]
          : []),
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: newId(),
          role: 'assistant',
          text: "Couldn't reach the chat server. Is it running? (cd server && npm start)",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View
        style={[
          styles.container,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.six + Spacing.four : insets.top,
            paddingBottom: Platform.OS === 'web' ? Spacing.three : insets.bottom + BottomTabInset,
          },
        ]}>
        <View style={[styles.header, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="smallBold" style={styles.flex}>
            🍜 Where To
          </ThemedText>
          {user ? (
            <>
              <HeaderButton label={chats ? 'Close' : 'Chats'} onPress={toggleChats} />
              <HeaderButton label="New" onPress={startNewChat} />
            </>
          ) : (
            <HeaderButton label="Sign in to save chats" onPress={() => router.navigate('/account')} />
          )}
        </View>

        {chats && (
          <ScrollView style={styles.flex} contentContainerStyle={styles.thread}>
            {chats.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                No saved chats yet.
              </ThemedText>
            )}
            {chats.map((chat) => (
              <ThemedView key={chat.id} type="backgroundElement" style={styles.chatRow}>
                <Pressable style={styles.flex} onPress={() => openChat(chat.id)}>
                  <ThemedText type="small" numberOfLines={1}>
                    {chat.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {new Date(chat.updated_at.replace(' ', 'T') + 'Z').toLocaleDateString()}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => deleteChat(chat.id)}
                  hitSlop={8}
                  accessibilityLabel="Delete chat">
                  <ThemedText type="small" themeColor="textSecondary">
                    Delete
                  </ThemedText>
                </Pressable>
              </ThemedView>
            ))}
          </ScrollView>
        )}

        <ScrollView
          ref={scrollRef}
          style={[styles.flex, chats && styles.hidden]}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled">
          {messages.map((m) =>
            m.role === 'results' ? (
              <View key={m.id} style={styles.results}>
                {m.restaurants.map((r, i) => (
                  <RestaurantCard key={r.id ?? i} restaurant={r} />
                ))}
              </View>
            ) : m.role === 'user' ? (
              <View key={m.id} style={[styles.bubble, styles.userBubble]}>
                <ThemedText type="small" style={styles.userText}>
                  {m.text}
                </ThemedText>
              </View>
            ) : (
              <ThemedView
                key={m.id}
                type="backgroundElement"
                style={[styles.bubble, styles.assistantBubble]}>
                <ThemedText type="small">{m.text}</ThemedText>
              </ThemedView>
            )
          )}
          {loading && (
            <ThemedView type="backgroundElement" style={[styles.bubble, styles.assistantBubble]}>
              <ActivityIndicator color={theme.textSecondary} />
            </ThemedView>
          )}
        </ScrollView>

        <View style={[styles.composer, { borderColor: theme.backgroundSelected }]}>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
              },
            ]}
            placeholder="What are you craving?"
            placeholderTextColor={theme.textSecondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
            returnKeyType="send"
            editable={!loading}
          />
          <Pressable
            onPress={send}
            disabled={loading || !input.trim()}
            accessibilityLabel="Send"
            style={({ pressed }) => [
              styles.sendButton,
              (pressed || loading || !input.trim()) && styles.dimmed,
            ]}>
            <ThemedText style={styles.sendText}>↑</ThemedText>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function HeaderButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => pressed && styles.dimmed}>
      <ThemedText type="small" style={{ color: ACCENT }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thread: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: ACCENT,
    borderBottomRightRadius: 4,
  },
  userText: {
    color: '#ffffff',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  results: {
    gap: Spacing.two,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 12,
    padding: 14,
  },
  hidden: {
    display: 'none',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    fontSize: 15,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    color: '#ffffff',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: 700,
  },
  dimmed: {
    opacity: 0.5,
  },
});
