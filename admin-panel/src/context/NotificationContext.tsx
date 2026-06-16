import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bell } from 'lucide-react';
import { useAuthContext } from '@/context/AuthContext';
import {
  connectSocket,
  disconnectSocket,
  onNewOrder,
  onOrderCancelled,
  onOrderStatusUpdated,
  onSocketEvent,
  offSocketEvent,
  playNotificationSound,
  reconnectSocket,
} from '@/services/socket';
import { getValidAdminAccessToken } from '@/lib/adminTokenRefresh';

export interface AdminNotification {
  id: string;
  type:
    | 'order:new'
    | 'order:status_updated'
    | 'order:cancelled'
    | 'complaint:new'
    | 'review:new'
    | 'rider:application';
  title: string;
  message: string;
  orderId?: string;
  orderNumber?: string;
  /** Optional in-app route to open when the notification is clicked. */
  link?: string;
  read: boolean;
  createdAt: string;
}

interface NotificationContextValue {
  notifications: AdminNotification[];
  unreadCount: number;
  newOrderCount: number;
  isSocketConnected: boolean;
  flashingOrderIds: Set<string>;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNewOrderAlerts: () => void;
}

const STORAGE_KEY = 'freshbazar-admin-notifications';
const MAX_ITEMS = 50;

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

function loadStored(): AdminNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(items: AdminNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildNotification(
  type: AdminNotification['type'],
  data: Record<string, unknown>,
  fallbackTitle: string,
  fallbackMessage: string
): AdminNotification {
  return {
    id: makeId(),
    type,
    title: String(data.title || fallbackTitle),
    message: String(data.message || fallbackMessage),
    orderId: data.orderId ? String(data.orderId) : undefined,
    orderNumber: data.orderNumber ? String(data.orderNumber) : undefined,
    link: data.link ? String(data.link) : undefined,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthContext();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<AdminNotification[]>(() => loadStored());
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [flashingOrderIds, setFlashingOrderIds] = useState<Set<string>>(new Set());
  const [newOrderCount, setNewOrderCount] = useState(0);
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const flashOrder = useCallback((orderId?: string, durationMs = 5000) => {
    if (!orderId) return;
    setFlashingOrderIds((prev) => new Set(prev).add(orderId));
    const existing = flashTimersRef.current.get(orderId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setFlashingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      flashTimersRef.current.delete(orderId);
    }, durationMs);
    flashTimersRef.current.set(orderId, timer);
  }, []);

  const pushNotification = useCallback((item: AdminNotification) => {
    setNotifications((prev) => {
      const next = [item, ...prev].slice(0, MAX_ITEMS);
      persist(next);
      return next;
    });
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      persist(next);
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      persist(next);
      return next;
    });
    setNewOrderCount(0);
  }, []);

  const clearNewOrderAlerts = useCallback(() => {
    setNewOrderCount(0);
    setNotifications((prev) => {
      const next = prev.map((n) =>
        n.type === 'order:new' && !n.read ? { ...n, read: true } : n
      );
      persist(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      setIsSocketConnected(false);
      return;
    }

    let cancelled = false;
    let connectionInterval: ReturnType<typeof setInterval> | undefined;
    let cleanupConnectError: (() => void) | undefined;

    const handleNewOrder = (data: Record<string, unknown>) => {
      const isUrgent = data.isUrgent === true;
      const item = buildNotification(
        'order:new',
        data,
        isUrgent ? 'Urgent order placed' : 'New order',
        data.orderNumber ? `New order #${data.orderNumber} received` : 'A new order was received'
      );
      pushNotification(item);
      playNotificationSound();
      if (isUrgent) {
        // Prominent, longer urgent alert.
        toast(
          (data.orderNumber
            ? `⚡ Urgent order #${data.orderNumber} is Placed`
            : '⚡ Urgent order is Placed'),
          {
            icon: '⚡',
            duration: 9000,
            style: { background: '#b45309', color: '#fff', fontWeight: 700 },
          }
        );
      } else {
        toast.success(item.message, {
          icon: <Bell className="w-4 h-4 text-green-500" />,
          duration: 5000,
        });
      }
      setNewOrderCount((c) => c + 1);
      flashOrder(item.orderId, 5000);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    };

    const handleStatusUpdated = (data: Record<string, unknown>) => {
      const item = buildNotification(
        'order:status_updated',
        data,
        'Order updated',
        data.orderNumber ? `Order #${data.orderNumber} status updated` : 'An order status was updated'
      );
      pushNotification(item);
      flashOrder(item.orderId, 3000);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    };

    const handleOrderCancelled = (data: Record<string, unknown>) => {
      const item = buildNotification(
        'order:cancelled',
        data,
        'Order cancelled',
        data.orderNumber ? `Order #${data.orderNumber} was cancelled` : 'An order was cancelled'
      );
      pushNotification(item);
      toast.error(item.message, { duration: 5000 });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    };

    const handleComplaint = (data: Record<string, unknown>) => {
      const item = buildNotification('complaint:new', { ...data, link: '/admin/complaints' }, 'New complaint', 'A new complaint was filed');
      pushNotification(item);
      playNotificationSound();
      toast(item.message, { icon: <Bell className="w-4 h-4 text-amber-500" />, duration: 5000 });
      queryClient.invalidateQueries({ queryKey: ['admin-complaints'] });
    };

    const handleReview = (data: Record<string, unknown>) => {
      const item = buildNotification('review:new', { ...data, link: '/admin/reviews' }, 'New review', 'A new review was submitted');
      pushNotification(item);
      toast(item.message, { icon: <Bell className="w-4 h-4 text-yellow-500" />, duration: 4000 });
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
    };

    const handleRiderApplication = (data: Record<string, unknown>) => {
      const item = buildNotification('rider:application', { ...data, link: '/admin/rider-applications' }, 'New rider application', 'A new rider application was received');
      pushNotification(item);
      playNotificationSound();
      toast(item.message, { icon: <Bell className="w-4 h-4 text-blue-500" />, duration: 6000 });
      queryClient.invalidateQueries({ queryKey: ['rider-applications'] });
    };

    const setup = async () => {
      const token = await getValidAdminAccessToken();
      if (cancelled || !token) return;

      const socket = connectSocket(token);

      let recovering = false;
      const handleConnectError = async (err: Error) => {
        const msg = err.message.toLowerCase();
        // Recover from any auth-related handshake failure: an expired JWT, or a
        // missing/stale handshake token ("authentication required" — the latter
        // was previously ignored, so the socket kept retrying with a dead token
        // and never reconnected).
        const isAuthError =
          msg.includes('jwt') ||
          msg.includes('expired') ||
          msg.includes('auth') ||
          msg.includes('token');
        if (!isAuthError || recovering) return;
        recovering = true;
        try {
          // getValidAdminAccessToken refreshes the session as needed and
          // returns a token usable in BOTH auth modes (cookie mode mints a
          // handshake token — the refresh result itself is not a JWT there).
          const fresh = await getValidAdminAccessToken();
          if (fresh) reconnectSocket(fresh);
        } finally {
          recovering = false;
        }
      };

      socket.on('connect_error', handleConnectError);
      cleanupConnectError = () => socket.off('connect_error', handleConnectError);

      onNewOrder(handleNewOrder);
      onOrderStatusUpdated(handleStatusUpdated);
      onOrderCancelled(handleOrderCancelled);
      onSocketEvent('complaint:new', handleComplaint);
      onSocketEvent('review:new', handleReview);
      onSocketEvent('rider:application', handleRiderApplication);

      connectionInterval = setInterval(() => {
        setIsSocketConnected(socket.connected);
      }, 3000);
    };

    setup();

    return () => {
      cancelled = true;
      cleanupConnectError?.();
      if (connectionInterval) clearInterval(connectionInterval);
      offSocketEvent('order:new', handleNewOrder);
      offSocketEvent('order:status_updated', handleStatusUpdated);
      offSocketEvent('order:cancelled', handleOrderCancelled);
      offSocketEvent('complaint:new', handleComplaint);
      offSocketEvent('review:new', handleReview);
      offSocketEvent('rider:application', handleRiderApplication);
      flashTimersRef.current.forEach((t) => clearTimeout(t));
      flashTimersRef.current.clear();
      disconnectSocket();
    };
  }, [isAuthenticated, pushNotification, flashOrder, queryClient]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      newOrderCount,
      isSocketConnected,
      flashingOrderIds,
      markAsRead,
      markAllAsRead,
      clearNewOrderAlerts,
    }),
    [
      notifications,
      unreadCount,
      newOrderCount,
      isSocketConnected,
      flashingOrderIds,
      markAsRead,
      markAllAsRead,
      clearNewOrderAlerts,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
}

export function useOptionalNotifications(): NotificationContextValue | null {
  return useContext(NotificationContext) ?? null;
}
