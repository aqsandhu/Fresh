import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../utils/constants';
import { useAuthStore } from '../store/authStore';
import { useTaskStore } from '../store/taskStore';
import { notificationService } from './notification.service';

/**
 * SocketService - Manages Socket.IO connection for the rider app.
 * Handles real-time chat, order updates, location sharing, and rider notifications.
 */
class SocketService {
  private socket: Socket | null = null;
  private connectedToken: string | null = null;
  private static instance: SocketService;

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  connect() {
    const token = useAuthStore.getState().token;
    if (!token) {
      console.log('[Socket] No token found, skipping connection');
      return;
    }

    // Already connected as this user — nothing to do. If a socket exists for
    // a DIFFERENT user (previous rider), tear it down first so the next
    // rider never inherits an authenticated session.
    if (this.socket) {
      if (this.socket.connected && this.connectedToken === token) return;
      this.disconnect();
    }

    // Extract base URL without /api
    const baseUrl = API_BASE_URL.replace(/\/api\/?$/, '');

    this.socket = io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });
    this.connectedToken = token;

    // Re-authenticate before every (re)connection attempt so a refreshed
    // token replaces the stale one instead of looping on connect_error.
    this.socket.io.on('reconnect_attempt', () => {
      const latest = useAuthStore.getState().token;
      if (latest && this.socket) {
        this.socket.auth = { token: latest };
        this.connectedToken = latest;
      }
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      // Present the current token on the next attempt (it may have been
      // refreshed since this socket was created).
      const latest = useAuthStore.getState().token;
      if (latest && this.socket && latest !== this.connectedToken) {
        this.socket.auth = { token: latest };
        this.connectedToken = latest;
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
    });

    this.socket.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed after all attempts');
    });

    // Global notification handlers
    this.socket.on('rider:new_assignment', (data) => {
      console.log('[Socket] New assignment:', data);
      // Refresh the task list and surface a local notification
      useTaskStore
        .getState()
        .fetchActiveTasks()
        .catch(() => {});
      notificationService
        .showNotification(
          'New Task Assigned!',
          data?.message || `New delivery assignment${data?.orderNumber ? `: Order #${data.orderNumber}` : ''}`,
          { type: 'new_task', orderId: data?.orderId }
        )
        .catch(() => {});
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connectedToken = null;
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

  // Rider location sharing
  emitLocation(riderId: string, latitude: number, longitude: number, accuracy?: number) {
    this.socket?.emit('rider:location', { riderId, latitude, longitude, accuracy });
  }

  // Notifications
  onNewAssignment(callback: (data: any) => void) {
    this.socket?.on('rider:new_assignment', callback);
  }

  onOrderUpdate(callback: (data: any) => void) {
    this.socket?.on('order:update', callback);
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
