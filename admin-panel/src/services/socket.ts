import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

let socket: Socket | null = null;

/**
 * Connect to Socket.IO server with admin authentication
 */
export const connectSocket = (token: string): Socket => {
  if (socket?.connected) return socket;

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

// Admin-specific socket helpers

/**
 * Listen for new orders
 */
export const onNewOrder = (callback: (data: any) => void) => {
  socket?.on('order:new', callback);
};

/**
 * Listen for order status updates
 */
export const onOrderStatusUpdated = (callback: (data: any) => void) => {
  socket?.on('order:status_updated', callback);
};

/**
 * Listen for cancelled orders
 */
export const onOrderCancelled = (callback: (data: any) => void) => {
  socket?.on('order:cancelled', callback);
};

/**
 * Generic event listener
 */
export const onSocketEvent = (event: string, callback: (data: any) => void) => {
  socket?.on(event, callback);
};

/**
 * Remove event listener
 */
export const offSocketEvent = (event: string, callback?: (data: any) => void) => {
  if (callback) {
    socket?.off(event, callback);
  } else {
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
