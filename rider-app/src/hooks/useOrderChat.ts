import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { socketService, setActiveChatOrder } from '../services/socket.service';

export interface ChatMessage {
  id: string;
  message: string;
  sender_type: 'customer' | 'rider' | 'admin';
  sender_name: string;
  created_at: string;
  /** Server rejected this optimistic message — tap to retry. */
  failed?: boolean;
  /** Awaiting server ack. */
  pending?: boolean;
}

interface UseOrderChatOptions {
  orderId: string;
  isActive: boolean;
}

/**
 * Realtime order chat (socket first, REST fallback) with optimistic sends.
 * The server broadcasts `chat:message` to everyone ELSE in the room, so our
 * own optimistic bubble is reconciled on the next REST refresh or kept as-is.
 */
export function useOrderChat({ orderId, isActive }: UseOrderChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(socketService.isConnected());
  const pendingTempIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await api.get<{ success?: boolean; data?: { messages?: ChatMessage[] } }>(`/chat/${orderId}`);
      if (res?.success) {
        const serverMessages = res.data?.messages || [];
        setMessages((prev) => {
          // Keep unsent optimistic bubbles; replace everything else.
          const locals = prev.filter((m) => m.id.startsWith('temp-') && (m.failed || m.pending));
          const known = new Set(serverMessages.map((m) => m.id));
          return [...serverMessages, ...locals.filter((m) => !known.has(m.id))];
        });
      }
    } catch {
      /* keep what we have */
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    setActiveChatOrder(orderId);
    socketService.connect();
    socketService.subscribeToOrder(orderId);
    fetchMessages();

    const onIncoming = (data: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        // Our own send echoed via REST fallback path — already present.
        return [...prev, data];
      });
    };
    const onTyping = (data: { orderId: string; isTyping: boolean }) => {
      if (data.orderId === orderId) setIsTyping(Boolean(data.isTyping));
    };
    const onChatError = (data: { message?: string }) => {
      console.warn('[Chat] chat:error:', data?.message);
      const pendingId = pendingTempIdRef.current;
      if (pendingId) {
        pendingTempIdRef.current = null;
        setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, failed: true, pending: false } : m)));
      }
      setSending(false);
    };
    const onConnect = () => {
      setIsConnected(true);
      socketService.subscribeToOrder(orderId);
      fetchMessages();
    };
    const onDisconnect = () => setIsConnected(false);

    socketService.on('chat:message', onIncoming);
    socketService.on('chat:typing', onTyping);
    socketService.on('chat:error', onChatError);
    socketService.on('connect', onConnect);
    socketService.on('disconnect', onDisconnect);
    const poll = setInterval(() => setIsConnected(socketService.isConnected()), 4000);

    return () => {
      setActiveChatOrder(null);
      socketService.unsubscribeFromOrder(orderId);
      socketService.off('chat:message', onIncoming);
      socketService.off('chat:typing', onTyping);
      socketService.off('chat:error', onChatError);
      socketService.off('connect', onConnect);
      socketService.off('disconnect', onDisconnect);
      clearInterval(poll);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [orderId, fetchMessages]);

  const deliver = useCallback(
    async (tempId: string, text: string) => {
      if (socketService.isConnected()) {
        pendingTempIdRef.current = tempId;
        socketService.sendChatMessage(orderId, text);
        // The server doesn't echo to the sender; mark as sent after a beat
        // unless a chat:error arrives first.
        setTimeout(() => {
          if (pendingTempIdRef.current === tempId) {
            pendingTempIdRef.current = null;
            setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m)));
          }
          setSending(false);
        }, 800);
        return;
      }
      try {
        const res = await api.post<{ success?: boolean; data?: ChatMessage }>(`/chat/${orderId}`, { message: text });
        if (res?.success && res.data) {
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...res.data!, pending: false } : m)));
        } else {
          throw new Error('send failed');
        }
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, failed: true, pending: false } : m)));
      } finally {
        setSending(false);
      }
    },
    [orderId]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending || !isActive) return;
      setSending(true);
      const optimistic: ChatMessage = {
        id: `temp-${Date.now()}`,
        message: trimmed,
        sender_type: 'rider',
        sender_name: 'You',
        created_at: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      await deliver(optimistic.id, trimmed);
    },
    [deliver, isActive, sending]
  );

  const retry = useCallback(
    async (message: ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, failed: false, pending: true } : m)));
      setSending(true);
      await deliver(message.id, message.message);
    },
    [deliver]
  );

  const onTypingChange = useCallback(
    (text: string) => {
      if (!socketService.isConnected()) return;
      if (text.length > 0) socketService.emitTyping(orderId, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => socketService.emitTyping(orderId, false), 2000);
    },
    [orderId]
  );

  return { messages, loading, sending, isTyping, isConnected, send, retry, onTypingChange, refresh: fetchMessages };
}

export default useOrderChat;
