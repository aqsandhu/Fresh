import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { aiChatService, type ChatMessage } from '@services/aiChat.service';
import { navigationRef } from '@/navigation/navigationUtils';

/** Best-effort current screen name for page-aware answers. */
function currentPage(): string | undefined {
  try {
    const ref = navigationRef as any;
    return ref.isReady() ? ref.getCurrentRoute()?.name : undefined;
  } catch {
    return undefined;
  }
}

const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    "Assalam-o-Alaikum! I'm the FreshBazar assistant. Ask me about products, prices, ordering, delivery, riders, or franchise — I'm here to help.",
};

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/** Strip stray markdown so no "stars"/symbols leak into the chat. */
function cleanText(s: string): string {
  return s
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-•]\s+/gm, '• ');
}

/** Render markdown links [label](url) as highlighted labels (no raw URLs). */
function renderRich(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(cleanText(text.slice(last, m.index)));
    const isProduct = m[2].includes('/product/');
    nodes.push(
      <Text key={i} style={styles.linkText}>
        {isProduct ? <MaterialIcons name="shopping-cart" size={13} color={COLORS.primary600} /> : null}
        {isProduct ? ' ' : ''}
        {cleanText(m[1]).trim()}
      </Text>
    );
    last = LINK_RE.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(cleanText(text.slice(last)));
  return nodes;
}

export const AiChatWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const { data: status } = useQuery({
    queryKey: ['ai-chat-status'],
    queryFn: aiChatService.getStatus,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (open) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, open, sending]);

  if (!status?.enabled) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const { reply } = await aiChatService.sendMessage(next.slice(-8), currentPage());
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Sorry, I could not respond right now. Please try again.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityLabel="Chat with FreshBazar assistant"
      >
        <MaterialIcons name="chat" size={26} color={COLORS.white} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <MaterialIcons name="smart-toy" size={20} color={COLORS.white} />
                <Text style={styles.headerText}>FreshBazar Assistant</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <MaterialIcons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ padding: SPACING.md }}>
              {messages.map((m, i) => (
                <View
                  key={i}
                  style={[styles.bubbleRow, m.role === 'user' ? styles.rowEnd : styles.rowStart]}
                >
                  <View style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.botBubble]}>
                    <Text style={m.role === 'user' ? styles.userText : styles.botText}>
                      {m.role === 'assistant' ? renderRich(m.content) : m.content}
                    </Text>
                  </View>
                </View>
              ))}
              {sending && (
                <View style={[styles.bubbleRow, styles.rowStart]}>
                  <View style={[styles.bubble, styles.botBubble]}>
                    <ActivityIndicator size="small" color={COLORS.primary600} />
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Type your message…"
                value={input}
                onChangeText={setInput}
                onSubmitEditing={send}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
                onPress={send}
                disabled={!input.trim() || sending}
              >
                <MaterialIcons name="send" size={20} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary600,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 50,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    height: '75%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.primary600,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  messages: { flex: 1, backgroundColor: COLORS.gray50 },
  bubbleRow: { marginBottom: SPACING.sm, flexDirection: 'row' },
  rowEnd: { justifyContent: 'flex-end' },
  rowStart: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.lg },
  userBubble: { backgroundColor: COLORS.primary600, borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.gray100, borderBottomLeftRadius: 4 },
  userText: { color: COLORS.white, fontSize: 14 },
  botText: { color: COLORS.gray800, fontSize: 14, lineHeight: 20 },
  linkText: { color: COLORS.primary600, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary600,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});

export default AiChatWidget;
