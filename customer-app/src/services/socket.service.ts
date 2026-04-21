import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '@utils/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@utils/constants';

/**
 * SocketService - Manages Socket.IO connection for the customer app.
 * Handles real-time chat, order tracking, and notifications.
 */
class SocketService {
  private socket: Socket | null = null;
  private static instance: SocketService;

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  async connect() {
    if (this.socket?.connected) return;

    const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      console.log('[Socket] No token found, skipping connection');
      return;
    }

    // Extract base URL without /api
    const baseUrl = API_BASE_URL.replace('/api', '');

    this.socket = io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
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
    this.socket?.disconnect();
    this.socket = null;
    console.log('[Socket] Disconnected manually');
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Order tracking subscription
  subscribeToOrder(orderId: string, callback: (data: any) => void) {
    this.socket?.emit('order:subscribe', orderId);
    this.socket?.on('order:update', callback);
  }

  unsubscribeFromOrder(orderId: string, callback?: (data: any) => void) {
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

  onChatMessage(callback: (data: any) => void) {
    this.socket?.on('chat:message', callback);
  }

  offChatMessage(callback?: (data: any) => void) {
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
  onOrderCreated(callback: (data: any) => void) {
    this.socket?.on('order:created', callback);
  }

  onOrderStatusChanged(callback: (data: any) => void) {
    this.socket?.on('order:status_changed', callback);
  }

  onOrderDelivered(callback: (data: any) => void) {
    this.socket?.on('order:delivered', callback);
  }

  onRiderAssigned(callback: (data: any) => void) {
    this.socket?.on('order:rider_assigned', callback);
  }

  onChatNotification(callback: (data: any) => void) {
    this.socket?.on('chat:notification', callback);
  }

  // Generic event handler
  on(event: string, callback: (data: any) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (data: any) => void) {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }
}

export const socketService = SocketService.getInstance();
export default socketService;
