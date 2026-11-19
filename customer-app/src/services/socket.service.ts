import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '@utils/constants';
import { getStoredToken } from '@/lib/secureTokens';

/**
 * SocketService - Manages Socket.IO connection for the customer app.
 * Handles real-time chat, order tracking, and notifications.
 */
class SocketService {
  private socket: Socket | null = null;
  private connectPromise: Promise<void> | null = null;
  /**
   * Orders this screen is following. Room membership lives on the SERVER per
   * connection, so every reconnect (lift, basement, app back from background)
   * starts with no rooms: tracking and chat went silent while the UI still
   * said "connected". The rooms are re-joined on every connect.
   */
  private orderRooms = new Set<string>();
  private static instance: SocketService;

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  /** Mutex: parallel connect() calls share one in-flight connection. */
  async connect(): Promise<void> {
    if (this.socket?.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.doConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async doConnect(): Promise<void> {
    if (this.socket?.connected) return;

    const token = await getStoredToken();
    if (!token) {
      console.log('[Socket] No token found, skipping connection');
      return;
    }

    // Extract base URL without /api
    const baseUrl = API_BASE_URL.replace(/\/api\/?$/, '');

    this.socket = io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      // Never give up: after 5 failed tries the socket used to stay dead
      // until the app was restarted.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
      this.orderRooms.forEach((orderId) => this.socket?.emit('order:subscribe', orderId));
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
    });

    this.socket.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed after all attempts');
    });

    // Global notification handler
    this.socket.on('order:status_changed', (data) => {
      console.log('[Socket] Order status changed:', data);
    });

    this.socket.on('order:rider_assigned', (data) => {
      console.log('[Socket] Rider assigned:', data);
    });

    this.socket.on('order:delivered', (data) => {
      console.log('[Socket] Order delivered:', data);
    });
  }

  disconnect() {
    this.orderRooms.clear();
    this.socket?.disconnect();
    this.socket = null;
    console.log('[Socket] Disconnected manually');
  }

  /**
   * Present a refreshed access token on the live socket and reconnect if the
   * connection dropped while the token was stale.
   */
  updateAuthToken(token: string) {
    if (!this.socket) return;
    this.socket.auth = { token };
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Order tracking subscription
  subscribeToOrder<T = unknown>(orderId: string, callback: (data: T) => void) {
    this.orderRooms.add(orderId);
    this.socket?.emit('order:subscribe', orderId);
    this.socket?.on('order:update', callback);
  }

  unsubscribeFromOrder<T = unknown>(orderId: string, callback?: (data: T) => void) {
    this.orderRooms.delete(orderId);
    this.socket?.emit('order:unsubscribe', orderId);
    if (callback) {
      this.socket?.off('order:update', callback);
    } else {
      this.socket?.off('order:update');
    }
  }

  // Chat messaging
  sendChatMessage(orderId: string, message: string) {
    this.socket?.emit('chat:send', { orderId, message });
  }

  onChatMessage<T = unknown>(callback: (data: T) => void) {
    this.socket?.on('chat:message', callback);
  }

  offChatMessage<T = unknown>(callback?: (data: T) => void) {
    if (callback) {
      this.socket?.off('chat:message', callback);
    } else {
      this.socket?.off('chat:message');
    }
  }

  // Typing indicators
  onTyping(callback: (data: { orderId: string; isTyping: boolean; userId?: string }) => void) {
    this.socket?.on('chat:typing', callback);
  }

  emitTyping(orderId: string, isTyping: boolean) {
    this.socket?.emit('chat:typing', { orderId, isTyping });
  }

  // Notifications
  onOrderCreated<T = unknown>(callback: (data: T) => void) {
    this.socket?.on('order:created', callback);
  }

  onOrderStatusChanged<T = unknown>(callback: (data: T) => void) {
    this.socket?.on('order:status_changed', callback);
  }

  onOrderDelivered<T = unknown>(callback: (data: T) => void) {
    this.socket?.on('order:delivered', callback);
  }

  onRiderAssigned<T = unknown>(callback: (data: T) => void) {
    this.socket?.on('order:rider_assigned', callback);
  }

  onChatNotification<T = unknown>(callback: (data: T) => void) {
    this.socket?.on('chat:notification', callback);
  }

  // Generic event handler
  on<T = unknown>(event: string, callback: (data: T) => void) {
    this.socket?.on(event, callback);
  }

  off<T = unknown>(event: string, callback?: (data: T) => void) {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }
}

export const socketService = SocketService.getInstance();
export default socketService;
