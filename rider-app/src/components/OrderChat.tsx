import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../utils/constants';
import api from '../services/api';
import { socketService } from '../services/socket.service';

interface Message {
  id: string;
  message: string;
  sender_type: 'customer' | 'rider';
  sender_name: string;
  created_at: string;
  /** true when the server rejected this (optimistic) message — tap to retry */
  failed?: boolean;
}

interface OrderChatProps {
  orderId: string;
  senderType: 'customer' | 'rider';
  orderStatus: string;
}

const OrderChat: React.FC<OrderChatProps> = ({ orderId, senderType, orderStatus }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Optimistic (temp) message awaiting server ack via socket
  const pendingTempIdRef = useRef<string | null>(null);

  const isActive = !['delivered', 'cancelled'].includes(orderStatus);

  // Fetch initial messages via REST
  const fetchMessages = useCallback(async () => {
    try {
      const res = await api.get<{ success?: boolean; data?: { messages?: Message[] } }>(
        `/chat/${orderId}`
      );
      if (res?.success) {
        setMessages(res.data?.messages || []);
      }
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Setup socket for real-time chat
  useEffect(() => {
    fetchMessages();

    // Connect socket
    const setupSocket = () => {
      socketService.connect();
      socketService.subscribeToOrder(orderId, handleOrderUpdate);
      socketService.onChatMessage(handleIncomingMessage);
      socketService.onTyping(handleTypingEvent);
    };

    const handleOrderUpdate = (data: any) => {
      console.log('[OrderChat] Order update:', data);
    };

    const handleIncomingMessage = (data: Message) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const handleTypingEvent = (data: { orderId: string; isTyping: boolean }) => {
      if (data.orderId === orderId) {
        setIsTyping(data.isTyping);
      }
    };

    // Server rejected our message (rate limit, auth gate, validation) —
    // mark the pending optimistic bubble as failed so it doesn't hang.
    const handleChatError = (data: { message?: string }) => {
      console.warn('[OrderChat] chat:error:', data?.message);
      const pendingId = pendingTempIdRef.current;
      if (pendingId) {
        pendingTempIdRef.current = null;
        setMessages((prev) =>
          prev.map((m) => (m.id === pendingId ? { ...m, failed: true } : m))
        );
      }
      setSending(false);
    };

    setupSocket();
    // Register AFTER connect() so the socket instance exists
    socketService.on('chat:error', handleChatError);

    // Connection status check
    const connectionInterval = setInterval(() => {
      setIsConnected(socketService.isConnected());
    }, 5000);

    return () => {
      socketService.unsubscribeFromOrder(orderId, handleOrderUpdate);
      socketService.offChatMessage(handleIncomingMessage);
      socketService.off('chat:typing', handleTypingEvent);
      socketService.off('chat:error', handleChatError);
      clearInterval(connectionInterval);
    };
  }, [orderId, fetchMessages]);

  // Handle send via socket (real-time) with REST fallback
  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || sending) return;

    setSending(true);
    setNewMessage('');

    // Optimistically add message
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      message: text,
      sender_type: senderType,
      sender_name: 'You',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    // Send via socket if connected
    if (socketService.isConnected()) {
      pendingTempIdRef.current = optimisticMsg.id;
      socketService.sendChatMessage(orderId, text);
      setSending(false);
    } else {
      // Fallback to REST API
      try {
        const res = await api.post<{ success?: boolean; data?: Message }>(`/chat/${orderId}`, {
          message: text,
        });
        if (res?.success && res.data) {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticMsg.id ? res.data! : m))
          );
        }
      } catch (e) {
        setNewMessage(text); // restore on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      } finally {
        setSending(false);
      }
    }
  };

  // Handle typing indicator with debounce
  const handleTypingChange = (text: string) => {
    setNewMessage(text);

    if (!socketService.isConnected()) return;

    if (text.length > 0) {
      socketService.emitTyping(orderId, true);
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      socketService.emitTyping(orderId, false);
    }, 2000);
  };

  // Retry a failed (server-rejected) message — tap on the failed bubble
  const handleRetry = async (item: Message) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, failed: false } : m))
    );
    if (socketService.isConnected()) {
      pendingTempIdRef.current = item.id;
      socketService.sendChatMessage(orderId, item.message);
      return;
    }
    // REST fallback when the socket is down
    try {
      const res = await api.post<{ success?: boolean; data?: Message }>(`/chat/${orderId}`, {
        message: item.message,
      });
      if (res?.success && res.data) {
        setMessages((prev) => prev.map((m) => (m.id === item.id ? res.data! : m)));
      } else {
        throw new Error('send failed');
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, failed: true } : m))
      );
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_type === senderType;
    const bubble = (
      <View
        style={[
          styles.bubble,
          isMe ? styles.bubbleMine : styles.bubbleTheirs,
          item.failed && styles.bubbleFailed,
        ]}
      >
        {!isMe && <Text style={styles.senderName}>{item.sender_name}</Text>}
        <Text style={[styles.msgText, isMe ? styles.msgTextMine : styles.msgTextTheirs]}>
          {item.message}
        </Text>
        {item.failed ? (
          <View style={styles.failedRow}>
            <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#FFCDD2" />
            <Text style={styles.failedText}>Failed — tap to retry</Text>
          </View>
        ) : (
          <Text style={[styles.msgTime, isMe ? styles.msgTimeMine : styles.msgTimeTheirs]}>
            {formatTime(item.created_at)}
          </Text>
        )}
      </View>
    );
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
        {item.failed ? (
          <TouchableOpacity onPress={() => handleRetry(item)}>{bubble}</TouchableOpacity>
        ) : (
          bubble
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Chat header with connection status */}
      <View style={styles.chatHeader}>
        <View style={styles.connectionIndicator}>
          <View style={[styles.statusDot, isConnected ? styles.statusDotConnected : styles.statusDotDisconnected]} />
          <Text style={styles.statusText}>
            {isConnected ? 'Online' : 'Offline'}
          </Text>
        </View>
        {isTyping && (
          <View style={styles.typingIndicator}>
            <Text style={styles.typingText}>Customer is typing...</Text>
          </View>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        style={styles.messagesList}
        contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.messagesContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="chat-outline" size={32} color={COLORS.gray300} />
            <Text style={styles.emptyText}>No messages yet</Text>
          </View>
        }
      />
      {isActive && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={handleTypingChange}
            placeholder="Type a message..."
            placeholderTextColor={COLORS.gray400}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!newMessage.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <MaterialCommunityIcons name="send" size={20} color={COLORS.white} />
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    maxHeight: 350,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.gray100,
    overflow: 'hidden',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.gray200,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
  },
  connectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotConnected: {
    backgroundColor: COLORS.success,
  },
  statusDotDisconnected: {
    backgroundColor: COLORS.gray400,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  typingIndicator: {
    marginLeft: 'auto',
  },
  typingText: {
    fontSize: FONT_SIZES.xs,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
  },
  loadingContainer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    maxHeight: 280,
  },
  messagesContent: {
    padding: SPACING.sm,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 100,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: SPACING.lg,
  },
  emptyText: {
    color: COLORS.gray400,
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.xs,
  },
  msgRow: {
    marginVertical: 2,
    paddingHorizontal: SPACING.xs,
  },
  msgRowRight: {
    alignItems: 'flex-end',
  },
  msgRowLeft: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  bubbleMine: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleFailed: {
    backgroundColor: COLORS.danger,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    alignSelf: 'flex-end',
  },
  failedText: {
    fontSize: 10,
    color: '#FFCDD2',
    fontStyle: 'italic',
  },
  bubbleTheirs: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 2,
  },
  msgText: {
    fontSize: FONT_SIZES.sm,
  },
  msgTextMine: {
    color: COLORS.white,
  },
  msgTextTheirs: {
    color: COLORS.gray900,
  },
  msgTime: {
    fontSize: 10,
    marginTop: 2,
    alignSelf: 'flex-end',
  },
  msgTimeMine: {
    color: 'rgba(255,255,255,0.7)',
  },
  msgTimeTheirs: {
    color: COLORS.gray400,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: SPACING.sm,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? SPACING.sm : 6,
    fontSize: FONT_SIZES.sm,
    maxHeight: 80,
    color: COLORS.gray900,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.gray300,
  },
});

export default OrderChat;
