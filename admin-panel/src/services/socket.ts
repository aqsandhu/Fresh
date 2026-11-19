import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/config/env';

let socket: Socket | null = null;

// Every listener a page or the notification provider asked for, by event.
// `socket?.on` alone dropped a listener added before the socket existed (a
// page mounted by a reload subscribes before the provider has its token) and
// every listener when a new socket was built (B36). Kept here, they are
// attached to whichever socket exists now or is created later.
type Listener = (data: unknown) => void;
const listeners = new Map<string, Set<Listener>>();

const attachAll = (s: Socket) => {
  listeners.forEach((set, event) => set.forEach((cb) => s.on(event, cb)));
};

/**
 * Connect to Socket.IO server with admin authentication
 */
export const connectSocket = (token: string): Socket => {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Admin connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Admin disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Admin connection error:', err.message);
  });

  attachAll(socket);
  return socket;
};

/**
 * Update auth token and reconnect the socket
 */
export const reconnectSocket = (token: string): Socket => {
  if (socket) {
    socket.auth = { token };
    if (socket.connected) {
      socket.disconnect();
    }
    socket.connect();
    return socket;
  }
  return connectSocket(token);
};

/**
 * Disconnect from Socket.IO server
 */
export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

/**
 * Check if socket is connected
 */
export const isSocketConnected = (): boolean => socket?.connected ?? false;

// Admin-specific socket helpers

/**
 * Listen for new orders
 */
export const onNewOrder = <T = unknown>(callback: (data: T) => void) => onSocketEvent('order:new', callback);

/**
 * Listen for order status updates
 */
export const onOrderStatusUpdated = <T = unknown>(callback: (data: T) => void) => onSocketEvent('order:status_updated', callback);

/**
 * Listen for cancelled orders
 */
export const onOrderCancelled = <T = unknown>(callback: (data: T) => void) => onSocketEvent('order:cancelled', callback);

/**
 * Generic event listener
 */
export function onSocketEvent<T = unknown>(event: string, callback: (data: T) => void): void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  const listener = callback as Listener;
  if (set.has(listener)) return; // already attached — once per event
  set.add(listener);
  socket?.on(event, listener);
}

/**
 * Remove event listener
 */
export const offSocketEvent = <T = unknown>(event: string, callback?: (data: T) => void) => {
  if (callback) {
    listeners.get(event)?.delete(callback as Listener);
    socket?.off(event, callback);
  } else {
    listeners.delete(event);
    socket?.off(event);
  }
};

/**
 * Play notification sound for new orders
 */
export const playNotificationSound = () => {
  try {
    const audio = new Audio('/notification.mp3');
    audio.play().catch(() => {
      // Audio play failed (browser policy), fallback to beep
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.2);
    });
  } catch {
    // Silent fail
  }
};
