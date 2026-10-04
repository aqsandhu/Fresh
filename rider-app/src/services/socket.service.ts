import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../utils/constants';
import { useAuthStore } from '../store/authStore';
import { useTaskStore } from '../store/taskStore';
import { notificationService } from './notification.service';

/** Order whose chat screen is currently open — suppress its chat toasts. */
let activeChatOrderId: string | null = null;
export const setActiveChatOrder = (orderId: string | null) => {
  activeChatOrderId = orderId;
};

/**
 * Socket.IO client for the rider app: realtime assignments, cancellations,
 * chat and location streaming. One socket per authenticated rider.
 */
class SocketService {
  private socket: Socket | null = null;
  private connectedToken: string | null = null;
  private static instance: SocketService;

  static getInstance(): SocketService {
    if (!SocketService.instance) SocketService.instance = new SocketService();
    return SocketService.instance;
  }

  connect() {
    const token = useAuthStore.getState().token;
    if (!token) return;

    // Already connected as this user — nothing to do. A socket for a
    // DIFFERENT token (previous rider / refreshed token) is torn down first.
    if (this.socket) {
      if (this.connectedToken === token && (this.socket.connected || this.socket.active)) return;
      this.disconnect();
    }

    const baseUrl = API_BASE_URL.replace(/\/api\/?$/, '');
    this.socket = io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      randomizationFactor: 0.5,
    });
    this.connectedToken = token;

    const refreshAuth = () => {
      const latest = useAuthStore.getState().token;
      if (latest && this.socket && latest !== this.connectedToken) {
        this.socket.auth = { token: latest };
        this.connectedToken = latest;
      }
    };
    this.socket.io.on('reconnect_attempt', refreshAuth);
    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] connect_error:', err.message);
      refreshAuth();
    });
    this.socket.on('connect', () => {
      console.log('[Socket] connected');
      // Re-sync in case we missed events while disconnected.
      useTaskStore.getState().fetchActiveTasks().catch(() => {});
    });
    this.socket.on('disconnect', (reason) => console.log('[Socket] disconnected:', reason));

    // ── Rider events ──────────────────────────────────────────────────────
    this.socket.on('rider:new_assignment', (data: { orderId?: string; orderNumber?: string; taskId?: string }) => {
      useTaskStore.getState().fetchActiveTasks().catch(() => {});
      notificationService
        .notifyNewTask({ orderId: data?.orderId, orderNumber: data?.orderNumber, taskId: data?.taskId })
        .catch(() => {});
    });

    this.socket.on('rider:task_cancelled', (data: { orderId?: string; orderNumber?: string; taskId?: string }) => {
      if (data?.taskId) useTaskStore.getState().removeTask(data.taskId);
      useTaskStore.getState().fetchActiveTasks().catch(() => {});
      notificationService
        .notifyTaskCancelled({ orderId: data?.orderId, orderNumber: data?.orderNumber, taskId: data?.taskId })
        .catch(() => {});
    });

    // A subscribed order changed (admin cancel/deliver, etc.) — re-sync.
    this.socket.on('order:update', (data: { orderId?: string; status?: string }) => {
      if (data?.status === 'cancelled' || data?.status === 'delivered' || data?.status === 'refunded') {
        useTaskStore.getState().fetchActiveTasks().catch(() => {});
      }
    });

    this.socket.on(
      'chat:notification',
      (data: { orderId?: string; message?: string; senderName?: string; senderType?: string }) => {
        if (data?.senderType === 'rider') return;
        if (data?.orderId && data.orderId === activeChatOrderId) return;
        notificationService
          .notifyChat({ orderId: data?.orderId, senderName: data?.senderName, message: data?.message })
          .catch(() => {});
      }
    );
  }

  disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.connectedToken = null;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ── Order rooms ───────────────────────────────────────────────────────────
  subscribeToOrder(orderId: string) {
    this.socket?.emit('order:subscribe', orderId);
  }

  unsubscribeFromOrder(orderId: string) {
    this.socket?.emit('order:unsubscribe', orderId);
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  sendChatMessage(orderId: string, message: string) {
    this.socket?.emit('chat:send', { orderId, message });
  }

  emitTyping(orderId: string, isTyping: boolean) {
    this.socket?.emit('chat:typing', { orderId, isTyping });
  }

  // ── Location ──────────────────────────────────────────────────────────────
  emitLocation(riderId: string, latitude: number, longitude: number, accuracy?: number) {
    this.socket?.emit('rider:location', { riderId, latitude, longitude, accuracy: accuracy ?? null });
  }

  // ── Generic ───────────────────────────────────────────────────────────────
  on(event: string, callback: (data: any) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (data: any) => void) {
    if (callback) this.socket?.off(event, callback);
    else this.socket?.off(event);
  }
}

export const socketService = SocketService.getInstance();
export default socketService;
