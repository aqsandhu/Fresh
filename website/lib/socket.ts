import { io, Socket } from 'socket.io-client';
import { usesHttpOnlyCookies } from '@/lib/authConfig';
import { getValidAccessToken } from '@/lib/tokenRefresh';
import { authApi } from '@/lib/api';

let socket: Socket | null = null;

/**
 * Resolve the token to authenticate a socket handshake.
 * - Cookie mode: the websocket connects cross-site (HttpOnly cookie can't ride
 *   along), so fetch a short-lived handshake token over the same-origin proxy.
 * - Bearer mode (legacy/dev): use the in-memory access token.
 * Returns null when there's no valid session.
 */
export const resolveSocketAuthToken = async (): Promise<string | null> => {
  if (usesHttpOnlyCookies()) {
    return authApi.getSocketToken();
  }
  return getValidAccessToken();
};

/**
 * Connect to Socket.IO — HttpOnly cookie auth when enabled (no JS token).
 */
export const connectSocket = (token?: string | null): Socket => {
  // Always pass the resolved token (socket-token in cookie mode, access token
  // in bearer mode) — the websocket connects cross-site, so HttpOnly cookies
  // can't authenticate the handshake.
  const authToken = token || undefined;

  if (socket) {
    if (authToken) socket.auth = { token: authToken };
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, '') || 'http://localhost:3000';

  socket = io(baseUrl, {
    withCredentials: true,
    ...(authToken ? { auth: { token: authToken } } : {}),
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

export const reconnectSocket = (token?: string | null): Socket => {
  if (socket) {
    const authToken = token || undefined;
    if (authToken) socket.auth = { token: authToken };
    if (socket.connected) {
      socket.disconnect();
    }
    socket.connect();
    return socket;
  }
  return connectSocket(token);
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

export const getSocket = (): Socket | null => socket;

export const isSocketConnected = (): boolean => socket?.connected ?? false;

export const subscribeToOrder = (orderId: string, callback: (data: any) => void) => {
  socket?.emit('order:subscribe', orderId);
  socket?.on('order:update', callback);
};

export const unsubscribeFromOrder = (orderId: string, callback?: (data: any) => void) => {
  socket?.emit('order:unsubscribe', orderId);
  if (callback) {
    socket?.off('order:update', callback);
  } else {
    socket?.off('order:update');
  }
};

export const sendChatMessage = (orderId: string, message: string) => {
  socket?.emit('chat:send', { orderId, message });
};

export const onChatMessage = (callback: (data: any) => void) => {
  socket?.on('chat:message', callback);
};

export const offChatMessage = (callback?: (data: any) => void) => {
  if (callback) {
    socket?.off('chat:message', callback);
  } else {
    socket?.off('chat:message');
  }
};

export const onTyping = (callback: (data: { orderId: string; isTyping: boolean; userId?: string }) => void) => {
  socket?.on('chat:typing', callback);
};

export const emitTyping = (orderId: string, isTyping: boolean) => {
  socket?.emit('chat:typing', { orderId, isTyping });
};
