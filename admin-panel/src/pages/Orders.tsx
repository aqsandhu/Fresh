import { errorView } from '@/lib/caughtError';
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  CheckCircle,
  Phone,
  PhoneOff,
  CreditCard,
  Printer,
  Navigation,
  Home,
  Navigation2,
  Bell,
  MessageCircle,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { orderService } from '@/services/order.service';
import { riderService } from '@/services/rider.service';
import { offSocketEvent, onSocketEvent } from '@/services/socket';
import { ocpService } from '@/services/ocp.service';
import { useNotifications } from '@/context/NotificationContext';
import { useAuthContext } from '@/context/AuthContext';
import { useBadgeCounts } from '@/hooks/useBadgeCounts';
import { hasPermission } from '@/lib/permissions';
import type { Order, OrderStatus } from '@/types';
import { isRiderAssignable, riderDispatchLabel } from '@/lib/riderLabels';
import {
  formatCurrency,
  formatDateTime,
  formatOrderStatus,
  formatPhoneNumber,
  getOrderStatusColor,
  resolveImageUrl,
} from '@/utils/formatters';
import { printOrderSlips } from '@/lib/orderSlip';
import toast from 'react-hot-toast';
import { NEXT_ORDER_STATUSES } from '@/lib/orderStatus';
import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { RiderTrackingModal } from '@/components/orders/RiderTrackingModal';

const OCP_VIEW_CODES = ['ocp.manage', 'ocp.stock.send', 'ocp.settlements.receive', 'ocp.shortages.manage'];

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

export const Orders: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const isSuperAdmin = user?.role === 'super_admin';
  // Only fetch side lists the role may read, and only offer actions it may
  // take — a viewer-only role used to get "no permission" pop-ups on load.
  const canSeeRiders = hasPermission(user?.permissions, 'riders.view');
  const canAssignRider = hasPermission(user?.permissions, 'orders.assign_rider') && canSeeRiders;
  const canSeeOcps = hasPermission(user?.permissions, OCP_VIEW_CODES);
  const canChangeOcp = hasPermission(user?.permissions, 'orders.update') && canSeeOcps;
  const canUpdateOrders = hasPermission(user?.permissions, 'orders.update');
  // House numbers live on the address (server: addresses.update).
  const canEditAddresses = hasPermission(user?.permissions, 'addresses.update');
  // The status form also cancels / refunds — any of the three opens it.
  const canChangeStatus = hasPermission(user?.permissions, ['orders.update', 'orders.cancel', 'orders.refund']);
  // ?search=<order no.> lets other screens (rider detail) deep-link an order.
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('search') || '';
    } catch {
      return '';
    }
  });
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  // Consumer orders vs restaurant (B2B) orders — same UI, separate sets.
  const [mode, setMode] = useState<'customer' | 'restaurant'>('customer');
  const isRestaurantMode = mode === 'restaurant';
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus>('pending');
  const [statusNote, setStatusNote] = useState('');
  const [page, setPage] = useState(1);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkStatusMode, setBulkStatusMode] = useState(false);
  const { data: badgeCounts } = useBadgeCounts();
  const {
    isSocketConnected,
    flashingOrderIds: flashingOrders,
    newOrderCount,
    clearNewOrderAlerts: clearNewOrderCount,
  } = useNotifications();
  const prevOrdersRef = useRef<string[]>([]);

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['orders', { status: statusFilter, search: searchQuery, page, mode }],
    queryFn: () =>
      orderService.getOrders({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        page,
        limit: 10,
        restaurant: isRestaurantMode ? true : undefined,
      }),
  });

  // Every verified rider in the city (the old call returned only the first
  // 20), with live load so dispatch can pick a free rider. Busy riders stay
  // selectable — a rider may carry several orders.
  const { data: riders } = useQuery({
    queryKey: ['riders', 'for-assignment'],
    queryFn: () => riderService.getRiders({ verificationStatus: 'verified', limit: 500 }),
    refetchInterval: 60_000,
    enabled: canAssignRider,
  });
  const assignableRiders = (riders || []).filter(isRiderAssignable);

  // Rider events → refresh the list (problem reports, deliveries, duty flips).
  useEffect(() => {
    const refreshOrders = () => queryClient.invalidateQueries({ queryKey: ['orders'] });
    const refreshRiders = () => queryClient.invalidateQueries({ queryKey: ['riders'] });
    const onTask = () => { refreshOrders(); refreshRiders(); };
    onSocketEvent('rider:task_failed', onTask);
    onSocketEvent('rider:task_completed', onTask);
    onSocketEvent('rider:status', refreshRiders);
    return () => {
      offSocketEvent('rider:task_failed', onTask);
      offSocketEvent('rider:task_completed', onTask);
      offSocketEvent('rider:status', refreshRiders);
    };
  }, [queryClient]);

  // Active OCPs for assignment (backend enforces same-city on assign).
  const { data: ocps } = useQuery({
    queryKey: ['ocps', 'for-assignment'],
    queryFn: () => ocpService.list(),
    enabled: canChangeOcp,
  });

  const assignOcpMutation = useMutation({
    mutationFn: ({ orderId, ocpId }: { orderId: string; ocpId: string | null }) =>
      orderService.assignToOcp(orderId, ocpId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order assignment updated');
    },
    onError: (e: unknown) => toast.error(errorView(e)?.response?.data?.message || errorView(e)?.message || 'Failed to assign'),
  });
  const ocpPhoneMutation = useMutation({
    mutationFn: ({ orderId, visible }: { orderId: string; visible: boolean }) =>
      orderService.setOcpPhoneVisibility(orderId, visible),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: unknown) => toast.error(errorView(e)?.response?.data?.message || 'Failed to update'),
  });

  // Track order ids for list diff (reserved for future row highlights)
  useEffect(() => {
    if (!ordersData?.orders) return;
    prevOrdersRef.current = ordersData.orders.map((o: Order) => o.id);
  }, [ordersData]);

  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [page, statusFilter]);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: OrderStatus; note?: string }) =>
      orderService.updateOrderStatus(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['badge-counts'] });
      toast.success('Order status updated successfully');
      setIsStatusModalOpen(false);
      setBulkStatusMode(false);
      setStatusNote('');
    },
  });

  const bulkUpdateStatusMutation = useMutation({
    mutationFn: ({ ids, status, note }: { ids: string[]; status: OrderStatus; note?: string }) =>
      orderService.bulkUpdateOrderStatus(ids, status, note),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['badge-counts'] });
      toast.success(`${data.updated} order(s) updated successfully`);
      setIsStatusModalOpen(false);
      setBulkStatusMode(false);
      setStatusNote('');
      setSelectedOrderIds(new Set());
    },
    onError: (errCaught: unknown) => {
      const err = errorView(errCaught);
      toast.error(err?.message || 'Failed to update orders');
    },
  });

  const assignRiderMutation = useMutation({
    mutationFn: ({ orderId, riderId }: { orderId: string; riderId: string }) =>
      orderService.assignRider(orderId, riderId),
    onSuccess: async (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      toast.success('Rider assigned — the rider app was notified');
      if (result?.payWarning) toast(result.payWarning, { icon: '⚠️', duration: 8000 });
      if (selectedOrder?.id === vars.orderId) {
        try {
          setSelectedOrder(await orderService.getOrderById(vars.orderId));
        } catch { /* list refresh is enough */ }
      }
    },
  });

  const togglePhoneMutation = useMutation({
    mutationFn: ({ orderId, show }: { orderId: string; show: boolean }) =>
      orderService.togglePhoneVisibility(orderId, show),
    onSuccess: (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSelectedOrder(prev => prev ? { ...prev, showCustomerPhone: updatedOrder.showCustomerPhone } : null);
      toast.success(updatedOrder.showCustomerPhone ? 'Customer phone visible to rider & slip' : 'Customer phone hidden from rider & slip');
    },
  });

  const paymentReceivedMutation = useMutation({
    mutationFn: (orderId: string) => orderService.markPaymentReceived(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['badge-counts'] });
      toast.success('Payment received — order marked as delivered');
    },
    onError: () => {
      toast.error('Failed to mark payment received');
    },
  });

  // The rider whose live position is open in the tracking popup (null = closed).
  const [tracking, setTracking] = useState<{ riderId: string; riderName: string } | null>(null);
  const openRiderTracking = (riderId: string, riderName: string) => setTracking({ riderId, riderName });
  // A new number per opening of the order details mounts a fresh popup.
  const [detailOpening, setDetailOpening] = useState(0);

  const handleViewDetails = async (order: Order) => {
    try {
      const fullOrder = await orderService.getOrderById(order.id);
      setSelectedOrder(fullOrder);
      setDetailOpening((n) => n + 1);
      setIsDetailModalOpen(true);
    } catch {
      toast.error('Failed to load order details');
    }
  };

  const handleStatusUpdate = (order: Order) => {
    setBulkStatusMode(false);
    setSelectedOrder(order);
    // Start on the natural next step (pending → confirmed …), not on the
    // status the order already has.
    setNewStatus(NEXT_ORDER_STATUSES[order.status]?.[0] ?? order.status);
    setIsStatusModalOpen(true);
  };

  const handleBulkStatusUpdate = () => {
    if (selectedOrderIds.size === 0) {
      toast.error('Select at least one order');
      return;
    }
    setBulkStatusMode(true);
    setNewStatus('confirmed');
    setIsStatusModalOpen(true);
  };

  const handleBulkPrint = async () => {
    const ids = [...selectedOrderIds];
    if (ids.length === 0) {
      toast.error('Select at least one order');
      return;
    }
    try {
      const orders = await Promise.all(ids.map((id) => orderService.getOrderById(id)));
      printOrderSlips(orders);
    } catch {
      toast.error('Failed to load orders for printing');
    }
  };

  const confirmStatusUpdate = () => {
    if (bulkStatusMode && selectedOrderIds.size > 0) {
      bulkUpdateStatusMutation.mutate({
        ids: [...selectedOrderIds],
        status: newStatus,
        note: statusNote,
      });
    } else if (selectedOrder) {
      updateStatusMutation.mutate({
        id: selectedOrder.id,
        status: newStatus,
        note: statusNote,
      });
    }
  };

  const columns = [
    {
      key: 'orderNumber',
      title: 'Order #',
      render: (order: Order) => (
        <div>
          <div className="flex items-center gap-1.5">
            {(order.isUnread ?? order.status === 'pending') && (
              <span
                className="h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-100"
                title="Unread pending order"
                aria-label="Unread pending order"
              />
            )}
            <p className="font-medium text-gray-900">{order.orderNumber}</p>
            {order.isUrgentDelivery && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                ⚡ URGENT
              </span>
            )}
            {order.source === 'whatsapp' && (
              <span className="inline-flex items-center gap-0.5 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                <MessageCircle className="h-2.5 w-2.5" /> WHATSAPP
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">{formatDateTime(order.placedAt)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      title: 'Customer',
      render: (order: Order) => (
        <div>
          <p className="font-medium text-gray-900">{order.customerName}</p>
          <p className="text-xs text-gray-500">{formatPhoneNumber(order.customerPhone)}</p>
        </div>
      ),
    },
    {
      key: 'address',
      title: 'Address',
      render: (order: Order) => {
        const snap = order.deliveryAddressSnapshot;
        if (!snap) return <span className="text-xs text-gray-400">—</span>;
        // Use live address coords (from addresses table JOIN), fallback to snapshot
        const lat = order.addressLatitude || snap.location?.latitude;
        const lng = order.addressLongitude || snap.location?.longitude;
        const hasLoc = lat && lng;
        const doorPic = order.addressDoorPictureUrl
          ? resolveImageUrl(order.addressDoorPictureUrl)
          : '';
        return (
          <div className="max-w-[220px]">
            <p className="text-xs text-gray-900 truncate" title={snap.writtenAddress}>
              {snap.writtenAddress || '—'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {[snap.areaName, snap.city].filter(Boolean).join(', ')}
            </p>
            {snap.houseNumber && (
              <p className="text-xs text-blue-600">H# {snap.houseNumber}</p>
            )}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {hasLoc ? (
                <a
                  href={`https://www.google.com/maps?q=${lat},${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-xs text-green-600 hover:underline"
                  title="View on Google Maps"
                >
                  <Navigation className="w-3 h-3" /> Map
                </a>
              ) : null}
              {doorPic ? (
                <a
                  href={doorPic}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-xs text-orange-600 hover:underline"
                  title="View door picture"
                >
                  <Home className="w-3 h-3" /> Door
                </a>
              ) : null}
              {!hasLoc && !doorPic && (
                <span className="text-xs text-gray-400">No location / door pic</span>
              )}
            </div>
            {doorPic && (
              <img
                src={doorPic}
                alt="Door"
                className="mt-1 w-14 h-10 object-cover rounded border"
                onClick={(e) => e.stopPropagation()}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>
        );
      },
    },
    {
      key: 'total',
      title: 'Total',
      render: (order: Order) => (
        <span className="font-medium text-gray-900">{formatCurrency(order.totalAmount)}</span>
      ),
    },
    {
      key: 'status',
      title: 'Status',
      render: (order: Order) => {
        const color = getOrderStatusColor(order.status);
        return (
          <Badge className={`${color.bg} ${color.text}`}>
            {formatOrderStatus(order.status)}
          </Badge>
        );
      },
    },
    {
      key: 'rider',
      title: 'Rider',
      render: (order: Order) => {
        const isCompleted = ['delivered', 'cancelled', 'refunded'].includes(order.status);
        const riderProblem = order.status === 'out_for_delivery' && order.riderTaskStatus === 'failed';
        return (
          <div className="min-w-[160px]">
            {riderProblem && (
              <div
                className="mb-1 inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700"
                title={order.riderTaskNotes || 'Rider reported a problem'}
              >
                <AlertTriangle className="w-3 h-3" /> Rider problem: {(order.riderTaskNotes || '').slice(0, 40) || 'see details'}
              </div>
            )}
            {!riderProblem && order.status === 'out_for_delivery' && order.riderArrivedAt && order.riderTaskStatus !== 'completed' && (
              <div className="mb-1 inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                At customer's door
              </div>
            )}
            {isCompleted || !canAssignRider ? (
              order.riderName ? (
                <span className="text-sm text-gray-900">{order.riderName}</span>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )
            ) : (
              <select
                aria-label={`Assign a rider to order ${order.orderNumber}`}
                value={order.riderId || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    assignRiderMutation.mutate({ orderId: order.id, riderId: e.target.value });
                  }
                }}
                className="text-xs w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">{order.riderName || 'Select Rider'}</option>
                {assignableRiders.map((r) => (
                  <option key={r.id} value={r.id}>{riderDispatchLabel(r)}</option>
                ))}
              </select>
            )}
            {order.riderId && (
              <button
                onClick={(e) => { e.stopPropagation(); openRiderTracking(order.riderId!, order.riderName || 'Rider'); }}
                className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                title="Track Rider Location"
              >
                <Navigation2 className="w-3 h-3" /> Track
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: 'ocp',
      title: 'Collection Point',
      render: (order: Order) => {
        const isCompleted = ['delivered', 'cancelled', 'refunded'].includes(order.status);
        const activeOcps = (ocps || []).filter((o) => o.status === 'active');
        return (
          <div className="min-w-[150px]">
            {isCompleted || !canChangeOcp ? (
              <span className="text-sm text-gray-600">{order.ocpName || '—'}</span>
            ) : (
              <select
                aria-label={`Collection point for order ${order.orderNumber}`}
                value={order.ocpId || ''}
                onChange={(e) => assignOcpMutation.mutate({ orderId: order.id, ocpId: e.target.value || null })}
                className="text-xs w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{order.ocpName || 'Direct (no OCP)'}</option>
                {activeOcps.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}{o.city ? ` · ${o.city}` : ''}</option>
                ))}
              </select>
            )}
            {order.ocpId && canUpdateOrders && (
              <button
                onClick={(e) => { e.stopPropagation(); ocpPhoneMutation.mutate({ orderId: order.id, visible: !order.phoneVisibleToOcp }); }}
                className={`mt-1 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${order.phoneVisibleToOcp ? 'text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
                title="Reveal/hide customer phone to the OCP"
              >
                {order.phoneVisibleToOcp ? <Phone className="w-3 h-3" /> : <PhoneOff className="w-3 h-3" />}
                {order.phoneVisibleToOcp ? 'Phone shown' : 'Reveal phone'}
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: 'phone',
      title: 'Phone',
      render: (order: Order) => (
        <button
          type="button"
          onClick={() => togglePhoneMutation.mutate({ orderId: order.id, show: !order.showCustomerPhone })}
          disabled={!canUpdateOrders || togglePhoneMutation.isPending}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium transition-colors ${
            order.showCustomerPhone
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
          title={order.showCustomerPhone ? 'Phone visible to rider' : 'Phone hidden from rider'}
        >
          {order.showCustomerPhone ? <Phone className="w-3 h-3" /> : <PhoneOff className="w-3 h-3" />}
          {order.showCustomerPhone ? 'Visible' : 'Hidden'}
        </button>
      ),
    },
    {
      key: 'actions',
      title: 'Actions',
      render: (order: Order) => (
        <div className="flex flex-col space-y-1">
          <div className="flex space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewDetails(order)}
              leftIcon={<Eye className="w-4 h-4" />}
            >
              View
            </Button>
            {canChangeStatus && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleStatusUpdate(order)}
              leftIcon={<CheckCircle className="w-4 h-4" />}
            >
              Update
            </Button>
            )}
          </div>
          {canUpdateOrders && order.status !== 'cancelled' && order.paymentStatus !== 'completed' && (
            <Button
              variant="ghost"
              size="sm"
              className="text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => {
                if (confirm(`Mark payment received for ${order.orderNumber}? This will also set order status to Delivered.`)) {
                  paymentReceivedMutation.mutate(order.id);
                }
              }}
              isLoading={paymentReceivedMutation.isPending}
              leftIcon={<CreditCard className="w-4 h-4" />}
            >
              Payment Received
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Flashing row animation class
  const getRowClassName = (order: Order) => {
    if (flashingOrders.has(order.id)) {
      return 'animate-pulse bg-yellow-50 transition-colors duration-500';
    }
    // Urgent orders stand out across the whole row.
    if (order.isUrgentDelivery) {
      return 'bg-amber-50 border-l-4 border-amber-500';
    }
    // WhatsApp orders get a distinct green accent.
    if (order.source === 'whatsapp') {
      return 'bg-green-50 border-l-4 border-green-500';
    }
    return '';
  };

  return (
    <Layout
      title="Orders"
      subtitle="Manage and track customer orders"
      searchPlaceholder="Search orders..."
      onSearch={(q) => {
        setSearchQuery(q);
        setPage(1);
      }}
    >
      {/* Consumer vs Restaurant orders */}
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
        {(['customer', 'restaurant'] as const).map((m) => {
          const unread = m === 'customer'
            ? badgeCounts?.consumerOrders || 0
            : badgeCounts?.restaurantOrders || 0;
          return (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setPage(1);
                setSelectedOrderIds(new Set());
              }}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === m ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <span>{m === 'customer' ? 'Customer' : 'Restaurants'}</span>
              {unread > 0 && (
                <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                  mode === m ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'
                }`}>
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Connection Status & New Order Badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isSocketConnected ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <Wifi className="w-3 h-3" /> Live Updates
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          )}
        </div>
        {newOrderCount > 0 && (
          <button
            onClick={clearNewOrderCount}
            className="inline-flex items-center gap-1 text-xs text-white bg-red-500 px-3 py-1 rounded-full hover:bg-red-600 transition-colors animate-bounce"
          >
            <Bell className="w-3 h-3" />
            {newOrderCount} new order{newOrderCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="w-full sm:w-48">
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as OrderStatus);
                setPage(1);
              }}
              options={[
                { value: '', label: 'All Statuses' },
                ...ORDER_STATUSES.map((s) => ({ value: s, label: formatOrderStatus(s) })),
              ]}
            />
          </div>
        </div>
      </Card>

      {selectedOrderIds.size > 0 && (
        <Card className="mb-4 bg-primary-50 border-primary-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-primary-900">
              {selectedOrderIds.size} order{selectedOrderIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex flex-wrap gap-2">
              {canChangeStatus && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkStatusUpdate}
                leftIcon={<CheckCircle className="w-4 h-4" />}
              >
                Update Status
              </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkPrint}
                leftIcon={<Printer className="w-4 h-4" />}
              >
                Print Slips
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedOrderIds(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Orders Table */}
      <Card>
        <Table
          columns={columns}
          data={ordersData?.orders || []}
          keyExtractor={(order) => order.id}
          isLoading={isLoading}
          emptyMessage="No orders found"
          rowClassName={getRowClassName}
          selectable
          selectedIds={selectedOrderIds}
          onSelectionChange={setSelectedOrderIds}
          pagination={
            ordersData?.pagination
              ? {
                  page,
                  totalPages: ordersData.pagination.totalPages,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      </Card>

      {isDetailModalOpen && selectedOrder && (
        <OrderDetailModal
          key={detailOpening}
          order={selectedOrder}
          setOrder={setSelectedOrder}
          onClose={() => setIsDetailModalOpen(false)}
          isSuperAdmin={isSuperAdmin}
          canAssignRider={canAssignRider}
          canUpdateOrders={canUpdateOrders}
          canEditAddresses={canEditAddresses}
          assignableRiders={assignableRiders}
          onAssignRider={(orderId, riderId) => assignRiderMutation.mutate({ orderId, riderId })}
          onTogglePhone={(orderId, show) => togglePhoneMutation.mutate({ orderId, show })}
          togglingPhone={togglePhoneMutation.isPending}
          onTrackRider={openRiderTracking}
        />
      )}

      {/* Status Update Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => {
          setIsStatusModalOpen(false);
          setBulkStatusMode(false);
        }}
        title={bulkStatusMode ? `Update ${selectedOrderIds.size} Orders` : 'Update Order Status'}
        footer={
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsStatusModalOpen(false);
                setBulkStatusMode(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmStatusUpdate}
              isLoading={updateStatusMutation.isPending || bulkUpdateStatusMutation.isPending}
            >
              Update Status
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="New Status"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
            options={(bulkStatusMode || !selectedOrder
              ? ORDER_STATUSES
              : NEXT_ORDER_STATUSES[selectedOrder.status]?.length
                ? NEXT_ORDER_STATUSES[selectedOrder.status]
                : [selectedOrder.status]
            ).map((s) => ({ value: s, label: formatOrderStatus(s) }))}
            helperText={
              !bulkStatusMode && selectedOrder && !NEXT_ORDER_STATUSES[selectedOrder.status]?.length
                ? `This order is ${formatOrderStatus(selectedOrder.status).toLowerCase()} — its status can no longer be changed.`
                : undefined
            }
            disabled={!bulkStatusMode && !!selectedOrder && !NEXT_ORDER_STATUSES[selectedOrder.status]?.length}
          />
          <div>
            <label htmlFor="orders-f1" className="block text-sm font-medium text-gray-700 mb-1">
              Note (Optional)
            </label>
            <textarea id="orders-f1"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows={3}
              placeholder="Add a note about this status change..."
            />
          </div>
        </div>
      </Modal>

      {tracking && (
        <RiderTrackingModal
          key={tracking.riderId}
          riderId={tracking.riderId}
          riderName={tracking.riderName}
          onClose={() => setTracking(null)}
        />
      )}
    </Layout>
  );
};

export default Orders;
