import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrderChat, ChatMessage } from '../../hooks/useOrderChat';
import { useT } from '../../i18n';
import { ScreenHeader, EmptyState, Banner } from '../../components/ui';
import { colors, radius, spacing, typography, TOUCH_TARGET } from '../../theme';
import { formatTime } from '../../utils/helpers';
import type { RootStackParamList } from '../../types';

const CLOSED_ORDER_STATUSES = ['delivered', 'cancelled', 'refunded'];

const ChatScreen: React.FC = () => {
  const { t } = useT();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { orderId, orderNumber, orderStatus } = useRoute<RouteProp<RootStackParamList, 'Chat'>>().params;
  const isActive = !CLOSED_ORDER_STATUSES.includes(orderStatus || '');
  const { messages, loading, sending, isTyping, isConnected, send, retry, onTypingChange } = useOrderChat({ orderId, isActive });
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  const handleSend = async () => {
    const value = text;
    setText('');
    await send(value);
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const mine = item.sender_type === 'rider';
    const bubble = (
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, item.failed && styles.bubbleFailed]}>
        {!mine ? <Text style={styles.sender}>{item.sender_name}</Text> : null}
        <Text style={[styles.msg, mine ? styles.msgMine : styles.msgTheirs]}>{item.message}</Text>
        <View style={styles.metaRow}>
          {item.failed ? (
            <Text style={styles.failed}>{t('chat.failed')}</Text>
          ) : (
            <Text style={[styles.time, mine ? styles.timeMine : styles.timeTheirs]}>{formatTime(item.created_at)}</Text>
          )}
          {mine && !item.failed ? (
            <MaterialCommunityIcons name={item.pending ? 'clock-outline' : 'check'} size={12} color={colors.primarySoft} style={{ marginLeft: 4 }} />
          ) : null}
        </View>
      </View>
    );
    return (
      <View style={[styles.row, mine ? styles.rowRight : styles.rowLeft]}>
        {item.failed ? <TouchableOpacity onPress={() => retry(item)}>{bubble}</TouchableOpacity> : bubble}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('chat.title', { orderNumber: orderNumber || '—' })}
        subtitle={isTyping ? t('chat.typing') : isConnected ? t('chat.online') : t('chat.offline')}
        onBack={() => navigation.goBack()}
        right={<View style={[styles.dot, { backgroundColor: isConnected ? colors.success : colors.gray400 }]} />}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
            ListEmptyComponent={<EmptyState icon="chat-outline" title={t('chat.empty')} />}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
          />
        )}
        {isActive ? (
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={(v) => { setText(v); onTypingChange(v); }}
              placeholder={t('chat.placeholder')}
              placeholderTextColor={colors.gray400}
              multiline
              maxLength={2000}
              accessibilityLabel={t('chat.placeholder')}
            />
            <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]} onPress={handleSend} disabled={!text.trim() || sending} accessibilityRole="button" accessibilityLabel="Send">
              {sending ? <ActivityIndicator size="small" color={colors.white} /> : <MaterialCommunityIcons name="send" size={22} color={colors.white} />}
            </TouchableOpacity>
          </View>
        ) : (
          <Banner tone="neutral" icon="lock-outline" message={t('chat.closed')} style={{ margin: spacing.lg }} />
        )}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  row: { marginVertical: 3 },
  rowRight: { alignItems: 'flex-end' },
  rowLeft: { alignItems: 'flex-start' },
  bubble: { maxWidth: '82%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  bubbleFailed: { backgroundColor: colors.danger },
  sender: { fontSize: typography.size.xs, color: colors.textMuted, marginBottom: 2, fontWeight: typography.weight.semibold },
  msg: { fontSize: typography.size.md, lineHeight: typography.size.md * 1.4 },
  msgMine: { color: colors.white },
  msgTheirs: { color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  time: { fontSize: 10 },
  timeMine: { color: colors.primarySoft },
  timeTheirs: { color: colors.textMuted },
  failed: { fontSize: 10, color: colors.white, fontWeight: typography.weight.semibold },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input: { flex: 1, minHeight: TOUCH_TARGET, maxHeight: 120, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.gray100, borderRadius: radius.lg, fontSize: typography.size.md, color: colors.text },
  sendBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: TOUCH_TARGET / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.gray300 },
});

export default ChatScreen;
