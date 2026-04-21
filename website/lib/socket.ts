import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Connect to Socket.IO server with authentication token
 */
export const connectSocket = (token: string): Socket => {
  if (socket?.connected) return socket;

  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3000';

  socket = io(baseUrl, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  return socket;
};

/**
 * Disconnect from Socket.IO server
 */
export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

/**
 * Get the current socket instance
 */
export const getSocket = (): Socket | null => socket;

/**
 * Check if socket is connected
 */
export const isSocketConnected = (): boolean => socket?.connected ?? false;

/**
 * Subscribe to order updates
 */
export const subscribeToOrder = (orderId: string, callback: (data: any) => void) => {
  socket?.emit('order:subscribe', orderId);
  socket?.on('order:update', callback);
};

/**
 * Unsubscribe from order updates
 */
export const unsubscribeFromOrder = (orderId: string, callback?: (data: any) => void) => {
  socket?.emit('order:unsubscribe', orderId);
  if (callback) {
    socket?.off('order:update', callback);
  } else {
    socket?.off('order:update');
  }
};

/**
 * Send a chat message via socket
 */
export const sendChatMessage = (orderId: string, message: string) => {
  socket?.emit('chat:send', { orderId, message });
};

/**
 * Listen for chat messages
 */
export const onChatMessage = (callback: (data: any) => void) => {
  socket?.on('chat:message', callback);
};

/**
 * Remove chat message listener
 */
export const offChatMessage = (callback?: (data: any) => void) => {
  if (callback) {
    socket?.off('chat:message', callback);
  } else {
    socket?.off('chat:message');
  }
};

/**
 * Listen for typing indicators
 */
export const onTyping = (callback: (data: { orderId: string; isTyping: boolean; userId?: string }) => void) => {
  socket?.on('chat:typing', callback);
};

/**
 * Send typing indicator
 */
export const emitTyping = (orderId: string, isTyping: boolean) => {
  socket?.emit('chat:typing', { orderId, isTyping });
};
