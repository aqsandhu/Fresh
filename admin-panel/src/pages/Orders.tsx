import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  CheckCircle,
  Phone,
  PhoneOff,
  User,
  Package,
  MapPin,
  Clock,
  CreditCard,
  Printer,
  Mail,
  FileText,
  Calendar,
  Navigation,
  Home,
  Save,
  Edit2,
  Navigation2,
  X,
  Bell,
  MessageCircle,
  Wifi,
  WifiOff,
  Trash2,
  Image,
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
import { addressService } from '@/services/address.service';
import { useNotifications } from '@/context/NotificationContext';
import { useAuthContext } from '@/context/AuthContext';
import type { Order, OrderStatus } from '@/types';
import {
  formatCurrency,
  formatDateTime,
  formatOrderStatus,
  formatPhoneNumber,
  getOrderStatusColor,
  resolveImageUrl,
} from '@/utils/formatters';
import { unitLabelShort } from '@/lib/unitLabels';
import toast from 'react-hot-toast';

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

const SLIP_PRINT_STYLES = `
  body { font-family: Arial, sans-serif; margin: 0; padding: 16px; font-size: 12px; color: #000; }
  .slip-page { page-break-after: always; }
  .slip-page:last-child { page-break-after: auto; }
  .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .header h1 { font-size: 18px; margin: 0 0 4px; }
  .header p { margin: 2px 0; font-size: 11px; color: #555; }
  .section { margin-bottom: 10px; }
  .section-title { font-weight: bold; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 6px; }
  .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .items-table th, .items-table td { text-align: left; padding: 4px 2px; border-bottom: 1px solid #eee; }
  .items-table th { font-size: 11px; font-weight: bold; }
  .items-table td.right, .items-table th.right { text-align: right; }
  .total-section { border-top: 2px dashed #000; padding-top: 6px; margin-top: 6px; }
  .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
  .grand-total { font-size: 16px; font-weight: bold; }
  .footer { text-align: center; border-top: 2px dashed #000; padding-top: 8px; margin-top: 10px; font-size: 11px; color: #555; }
  @media print {
    .slip-page { page-break-after: always; }
    .slip-page:last-child { page-break-after: auto; }
  }
`;

/**
 * HTML-escape every customer-controlled string before it is interpolated into
 * the print-slip markup. Without this, a customer named `<img onerror=...>`
 * would execute script in the admin's print window (stored XSS).
 */
/** Format a kg decimal as "5 kg 300 g" (5.3 → 5 kg 300 g). */
function formatKgGrams(kg: number): string {
  if (!Number.isFinite(kg) || kg < 0) return '';
  const whole = Math.floor(kg);
  const grams = Math.round((kg - whole) * 1000);
  if (grams === 0) return `${whole} kg`;
  if (whole === 0) return `${grams} g`;
  return `${whole} kg ${grams} g`;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOrderSlipHtml(order: Order): string {
  const phoneLine = order.showCustomerPhone
    ? `<div class="row"><span>${esc(formatPhoneNumber(order.customerPhone))}</span></div>`
    : `<div class="row"><span style="font-style:italic;color:#666;">Phone Number is Hidden</span></div>`;

  return `
    <div class="header">
      <h1>FreshBazar</h1>
      <p>Fresh Grocery Delivery</p>
      <p style="font-weight:bold;font-size:13px;">Order: ${esc(order.orderNumber)}</p>
      <p>${esc(new Date(order.placedAt).toLocaleString('en-PK'))}</p>
    </div>
    <div class="section">
      <div class="section-title">Customer</div>
      <div class="row"><span>${esc(order.customerName)}</span></div>
      ${phoneLine}
      ${order.customerEmail ? `<div class="row"><span>${esc(order.customerEmail)}</span></div>` : ''}
    </div>
    ${order.deliveryAddressSnapshot ? `
    <div class="section">
      <div class="section-title">Delivery Address</div>
      ${order.deliveryAddressSnapshot.houseNumber ? `<div><strong>House #: ${esc(order.deliveryAddressSnapshot.houseNumber)}</strong></div>` : ''}
      <div>${esc(order.deliveryAddressSnapshot.writtenAddress || '')}</div>
      ${order.deliveryAddressSnapshot.landmark ? `<div>Landmark: ${esc(order.deliveryAddressSnapshot.landmark)}</div>` : ''}
      <div>${esc([order.deliveryAddressSnapshot.areaName, order.deliveryAddressSnapshot.city].filter(Boolean).join(', '))}</div>
    </div>` : ''}
    ${order.slotName ? `
    <div class="section">
      <div class="section-title">Delivery Time Slot</div>
      <div>${esc(order.slotName)}</div>
    </div>` : ''}
    <div class="section">
      <div class="section-title">Items</div>
      <table class="items-table">
        <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead>
        <tbody>
          ${(order.items || []).map(item => {
            const unitSuffix = item.unit && item.unit !== 'full' ? ` (${esc(unitLabelShort(item.unit))})` : '';
            return `<tr><td>${esc(item.productName)}${unitSuffix}</td><td class="right">${Number(item.quantity)}</td><td class="right">Rs.${Number(item.unitPrice).toFixed(0)}</td><td class="right">Rs.${Number(item.totalPrice).toFixed(0)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="total-section">
      <div class="total-row"><span>Subtotal</span><span>Rs.${Number(order.subtotal).toFixed(0)}</span></div>
      ${Number(order.discountAmount) > 0 ? `<div class="total-row"><span>Discount</span><span>-Rs.${Number(order.discountAmount).toFixed(0)}</span></div>` : ''}
      ${Number(order.couponDiscount) > 0 ? `<div class="total-row"><span>Coupon${order.couponCode ? ` (${esc(order.couponCode)})` : ''}</span><span>-Rs.${Number(order.couponDiscount).toFixed(0)}</span></div>` : ''}
      <div class="total-row"><span>Delivery</span><span>Rs.${Number(order.deliveryCharge).toFixed(0)}</span></div>
      <div class="total-row grand-total"><span>Total</span><span>Rs.${Number(order.totalAmount).toFixed(0)}</span></div>
    </div>
    <div class="section" style="margin-top:8px;">
      <div class="total-row"><span>Payment</span><span>${esc(order.paymentMethod === 'cash_on_delivery' ? 'Cash on Delivery' : order.paymentMethod)}</span></div>
      <div class="total-row"><span>Status</span><span>${esc(formatOrderStatus(order.status))}</span></div>
    </div>
    ${order.customerNotes ? `<div class="section"><div class="section-title">Customer Notes</div><div>${esc(order.customerNotes)}</div></div>` : ''}
    <div class="footer">
      <p>Thank you for shopping with FreshBazar!</p>
    </div>
  `;
}

function printOrderSlips(orders: Order[]) {
  if (orders.length === 0) return;
  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) return;
  const slips = orders.map((o) => `<div class="slip-page">${buildOrderSlipHtml(o)}</div>`).join('');
  win.document.write(`
    <html><head><title>Order Slips</title>
    <style>${SLIP_PRINT_STYLES}</style></head><body>${slips}</body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

export const Orders: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const isSuperAdmin = user?.role === 'super_admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  // Consumer orders vs restaurant (B2B) orders — same UI, separate sets.
  const [mode, setMode] = useState<'customer' | 'restaurant'>('customer');
  const isRestaurantMode = mode === 'restaurant';
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [weightInputs, setWeightInputs] = useState<Record<string, string>>({});
  const [savingWeightId, setSavingWeightId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus>('pending');
  const [statusNote, setStatusNote] = useState('');
  const [page, setPage] = useState(1);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkStatusMode, setBulkStatusMode] = useState(false);
  const [editingHouseNumber, setEditingHouseNumber] = useState(false);
  const [houseNumberValue, setHouseNumberValue] = useState('');
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

  // Fetch all verified riders for assignment (not just available — allow multiple orders per rider)
  const { data: riders } = useQuery({
    queryKey: ['riders', 'for-assignment'],
    queryFn: () => riderService.getRiders(),
  });

  // Rider location tracking state
  const [trackingRiderId, setTrackingRiderId] = useState<string | null>(null);
  const [trackingRiderName, setTrackingRiderName] = useState('');
  const [riderLocation, setRiderLocation] = useState<{ latitude: number | null; longitude: number | null; locationUpdatedAt: string | null } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

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
      toast.success(`${data.updated} order(s) updated successfully`);
      setIsStatusModalOpen(false);
      setBulkStatusMode(false);
      setStatusNote('');
      setSelectedOrderIds(new Set());
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update orders');
    },
  });

  const assignRiderMutation = useMutation({
    mutationFn: ({ orderId, riderId }: { orderId: string; riderId: string }) =>
      orderService.assignRider(orderId, riderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Rider assigned successfully');
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

  const houseNumberMutation = useMutation({
    mutationFn: ({ addressId, houseNumber }: { addressId: string; houseNumber: string }) =>
      addressService.assignHouseNumber(addressId, houseNumber),
    onSuccess: (_, variables) => {
      setSelectedOrder(prev => {
        if (!prev) return null;
        return {
          ...prev,
          deliveryAddressSnapshot: {
            ...prev.deliveryAddressSnapshot,
            houseNumber: variables.houseNumber,
          },
        };
      });
      setEditingHouseNumber(false);
      toast.success('House number updated successfully');
    },
    onError: () => {
      toast.error('Failed to update house number');
    },
  });

  const paymentReceivedMutation = useMutation({
    mutationFn: (orderId: string) => orderService.markPaymentReceived(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Payment received — order marked as delivered');
    },
    onError: () => {
      toast.error('Failed to mark payment received');
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (orderId: string) => orderService.deleteOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order deleted successfully');
      setIsDetailModalOpen(false);
      setSelectedOrder(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to delete order');
    },
  });

  const clearDoorPictureMutation = useMutation({
    mutationFn: (addressId: string) => addressService.clearDoorPicture(addressId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSelectedOrder((prev) => (prev ? { ...prev, addressDoorPictureUrl: undefined } : null));
      toast.success('Door picture removed');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove door picture'),
  });

  const clearLocationMutation = useMutation({
    mutationFn: (addressId: string) => addressService.clearLocation(addressId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSelectedOrder((prev) =>
        prev
          ? {
              ...prev,
              addressLatitude: undefined,
              addressLongitude: undefined,
              deliveryAddressSnapshot: prev.deliveryAddressSnapshot
                ? {
                    ...prev.deliveryAddressSnapshot,
                    location: undefined,
                  }
                : prev.deliveryAddressSnapshot,
            }
          : null
      );
      toast.success('Location removed');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove location'),
  });

  // Rider location tracking
  const openRiderTracking = async (riderId: string, riderName: string) => {
    setTrackingRiderId(riderId);
    setTrackingRiderName(riderName);
    setLoadingLocation(true);
    try {
      const loc = await riderService.getRiderLocation(riderId);
      setRiderLocation(loc);
    } catch {
      toast.error('Failed to load rider location');
    } finally {
      setLoadingLocation(false);
    }
  };

  // Auto-refresh rider location every 15 seconds
  React.useEffect(() => {
    if (!trackingRiderId) return;
    const interval = setInterval(async () => {
      try {
        const loc = await riderService.getRiderLocation(trackingRiderId);
        setRiderLocation(loc);
      } catch { /* silent */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [trackingRiderId]);

  const handleViewDetails = async (order: Order) => {
    try {
      const fullOrder = await orderService.getOrderById(order.id);
      setSelectedOrder(fullOrder);
      setEditingHouseNumber(false);
      setHouseNumberValue(fullOrder.deliveryAddressSnapshot?.houseNumber || '');
      setIsDetailModalOpen(true);
    } catch {
      toast.error('Failed to load order details');
    }
  };

  const handleSaveItemWeight = async (itemId: string) => {
    if (!selectedOrder) return;
    const raw = weightInputs[itemId];
    const weight = parseFloat(String(raw));
    if (!Number.isFinite(weight) || weight < 0) {
      toast.error('Enter a valid weight in kg (e.g. 5.3 = 5 kg 300 g)');
      return;
    }
    setSavingWeightId(itemId);
    try {
      await orderService.updateItemWeight(selectedOrder.id, itemId, weight);
      const fresh = await orderService.getOrderById(selectedOrder.id);
      setSelectedOrder(fresh);
      setWeightInputs((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Weight saved — order amount updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update weight');
    } finally {
      setSavingWeightId(null);
    }
  };

  const handleStatusUpdate = (order: Order) => {
    setBulkStatusMode(false);
    setSelectedOrder(order);
    setNewStatus(order.status);
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
        // Filter riders: show verified, non-offline/on_leave for assignment
        const assignableRiders = (riders || []).filter((r: any) =>
          r.verificationStatus === 'verified' && r.status !== 'offline' && r.status !== 'on_leave'
        );
        return (
          <div className="min-w-[140px]">
            {isCompleted ? (
              order.riderName ? (
                <span className="text-sm text-gray-900">{order.riderName}</span>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )
            ) : (
              <select
                value={order.riderId || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    assignRiderMutation.mutate({ orderId: order.id, riderId: e.target.value });
                  }
                }}
                className="text-xs w-full px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">{order.riderName || 'Select Rider'}</option>
                {assignableRiders.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.fullName} ({r.status})</option>
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
      key: 'phone',
      title: 'Phone',
      render: (order: Order) => (
        <button
          type="button"
          onClick={() => togglePhoneMutation.mutate({ orderId: order.id, show: !order.showCustomerPhone })}
          disabled={togglePhoneMutation.isPending}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleStatusUpdate(order)}
              leftIcon={<CheckCircle className="w-4 h-4" />}
            >
              Update
            </Button>
          </div>
          {order.status !== 'cancelled' && order.paymentStatus !== 'completed' && (
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
      onSearch={setSearchQuery}
    >
      {/* Consumer vs Restaurant orders */}
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
        {(['customer', 'restaurant'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setPage(1);
              setSelectedOrderIds(new Set());
            }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === m ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {m === 'customer' ? 'Customer' : 'Restaurants'}
          </button>
        ))}
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
              placeholder="All Statuses"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus)}
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkStatusUpdate}
                leftIcon={<CheckCircle className="w-4 h-4" />}
              >
                Update Status
              </Button>
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

      {/* Order Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Order ${selectedOrder?.orderNumber}`}
        size="xl"
        footer={
          <div className="flex justify-between w-full">
            <div>
              {isSuperAdmin && selectedOrder && (
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    if (confirm(`Permanently delete order ${selectedOrder.orderNumber}? This cannot be undone.`)) {
                      deleteOrderMutation.mutate(selectedOrder.id);
                    }
                  }}
                  isLoading={deleteOrderMutation.isPending}
                  leftIcon={<Trash2 className="w-4 h-4" />}
                >
                  Delete Order
                </Button>
              )}
            </div>
            <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={() => selectedOrder && printOrderSlips([selectedOrder])}
              leftIcon={<Printer className="w-4 h-4" />}
            >
              Print Slip
            </Button>
            <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
              Close
            </Button>
            </div>
          </div>
        }
      >
        {selectedOrder && (
          <div
            className={`space-y-6 ${
              selectedOrder.isUrgentDelivery ? 'rounded-lg ring-2 ring-amber-400 bg-amber-50/40 p-4' : ''
            }`}
            id="order-print-area"
          >
            {/* Urgent banner */}
            {selectedOrder.isUrgentDelivery && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-white">
                <span className="text-lg">⚡</span>
                <span className="font-bold">Urgent delivery order</span>
                {selectedOrder.urgentDeliveryEta ? (
                  <span className="text-sm text-amber-50">· ETA {selectedOrder.urgentDeliveryEta}</span>
                ) : null}
              </div>
            )}
            {/* WhatsApp source banner */}
            {selectedOrder.source === 'whatsapp' && (
              <div className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-white">
                <MessageCircle className="h-5 w-5" />
                <span className="font-bold">WhatsApp order</span>
                <span className="text-sm text-green-50">· placed by admin on the customer's behalf</span>
              </div>
            )}
            {/* Order Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className={`${getOrderStatusColor(selectedOrder.status).bg} ${getOrderStatusColor(selectedOrder.status).text}`}>
                    {formatOrderStatus(selectedOrder.status)}
                  </Badge>
                  <span className="text-sm text-gray-500">
                    {selectedOrder.paymentMethod === 'cash_on_delivery' ? 'Cash on Delivery' : selectedOrder.paymentMethod}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  <Calendar className="w-3.5 h-3.5 inline mr-1" />
                  Placed: {formatDateTime(selectedOrder.placedAt)}
                </p>
              </div>
            </div>

            {/* Customer & Address - Two Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Info */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Customer</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center">
                    <User className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                    <span className="font-medium">{selectedOrder.customerName}</span>
                  </div>
                  <div className="flex items-center">
                    <Phone className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                    <span>
                      {selectedOrder.showCustomerPhone
                        ? formatPhoneNumber(selectedOrder.customerPhone)
                        : 'Phone Number is Hidden'}
                    </span>
                  </div>
                  {selectedOrder.customerEmail && (
                    <div className="flex items-center">
                      <Mail className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                      <span>{selectedOrder.customerEmail}</span>
                    </div>
                  )}
                  {/* Phone visibility toggle for slip/rider */}
                  <div className="pt-2 border-t border-gray-200 mt-2">
                    <button
                      type="button"
                      onClick={() => togglePhoneMutation.mutate({ orderId: selectedOrder.id, show: !selectedOrder.showCustomerPhone })}
                      disabled={togglePhoneMutation.isPending}
                      className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                        selectedOrder.showCustomerPhone
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      {selectedOrder.showCustomerPhone ? (
                        <><Phone className="w-3.5 h-3.5" /> Phone visible on slip</>
                      ) : (
                        <><PhoneOff className="w-3.5 h-3.5" /> Phone hidden from slip</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Delivery Address */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Delivery Address</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {selectedOrder.deliveryAddressSnapshot ? (
                    <>
                      <div className="flex items-start">
                        <MapPin className="w-4 h-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                        <span>{selectedOrder.deliveryAddressSnapshot.writtenAddress || 'N/A'}</span>
                      </div>
                      {selectedOrder.deliveryAddressSnapshot.landmark && (
                        <p className="text-sm text-gray-600 ml-6">
                          Landmark: {selectedOrder.deliveryAddressSnapshot.landmark}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 ml-6">
                        {[
                          selectedOrder.deliveryAddressSnapshot.areaName,
                          selectedOrder.deliveryAddressSnapshot.city,
                          selectedOrder.deliveryAddressSnapshot.province,
                        ].filter(Boolean).join(', ')}
                      </p>

                      {/* Editable House Number */}
                      <div className="ml-6 pt-2 border-t border-gray-200">
                        <div className="flex items-center gap-2">
                          <Home className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          {editingHouseNumber ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={houseNumberValue}
                                onChange={(e) => setHouseNumberValue(e.target.value)}
                                placeholder="e.g. H-12, Street 5"
                                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && selectedOrder.addressId) {
                                    houseNumberMutation.mutate({ addressId: selectedOrder.addressId, houseNumber: houseNumberValue });
                                  }
                                  if (e.key === 'Escape') setEditingHouseNumber(false);
                                }}
                              />
                              <button
                                onClick={() => {
                                  if (selectedOrder.addressId) {
                                    houseNumberMutation.mutate({ addressId: selectedOrder.addressId, houseNumber: houseNumberValue });
                                  }
                                }}
                                disabled={houseNumberMutation.isPending}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                                title="Save"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingHouseNumber(false);
                                  setHouseNumberValue(selectedOrder.deliveryAddressSnapshot?.houseNumber || '');
                                }}
                                className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-sm">
                                House #: {selectedOrder.deliveryAddressSnapshot.houseNumber || <span className="text-gray-400 italic">Not assigned</span>}
                              </span>
                              <button
                                onClick={() => {
                                  setHouseNumberValue(selectedOrder.deliveryAddressSnapshot?.houseNumber || '');
                                  setEditingHouseNumber(true);
                                }}
                                className="p-1 text-primary-600 hover:bg-primary-50 rounded"
                                title="Edit house number"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Location - Google Maps Link (live address data with snapshot fallback) */}
                      {(() => {
                        const lat = selectedOrder.addressLatitude || selectedOrder.deliveryAddressSnapshot.location?.latitude;
                        const lng = selectedOrder.addressLongitude || selectedOrder.deliveryAddressSnapshot.location?.longitude;
                        if (!lat || !lng) return null;
                        return (
                          <div className="ml-6 pt-2 border-t border-gray-200">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Navigation className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <a
                                href={`https://www.google.com/maps?q=${lat},${lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary-600 hover:underline"
                              >
                                View on Google Maps
                              </a>
                              <Badge variant="success" size="sm">Location Available</Badge>
                              {isSuperAdmin && selectedOrder.addressId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm('Remove GPS location from this address?')) {
                                      clearLocationMutation.mutate(selectedOrder.addressId!);
                                    }
                                  }}
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  Remove location
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {selectedOrder.addressDoorPictureUrl && (() => {
                        const doorUrl = resolveImageUrl(selectedOrder.addressDoorPictureUrl);
                        return (
                        <div className="ml-6 pt-2 border-t border-gray-200">
                          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                            <Image className="w-3.5 h-3.5" /> Door Picture
                          </p>
                          <div className="flex items-start gap-3">
                            <a href={doorUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={doorUrl}
                                alt="Door"
                                className="w-28 h-20 object-cover rounded-lg border hover:opacity-80 transition-opacity cursor-pointer"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </a>
                            {isSuperAdmin && selectedOrder.addressId && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm('Remove door picture from this address?')) {
                                    clearDoorPictureMutation.mutate(selectedOrder.addressId!);
                                  }
                                }}
                                className="text-xs text-red-600 hover:underline"
                              >
                                Remove picture
                              </button>
                            )}
                          </div>
                        </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p className="text-gray-400">No address snapshot available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Time Slot & Payment - Two Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Time Slot */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Delivery Slot</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 text-gray-400 mr-2" />
                    <span>
                      {selectedOrder.slotName
                        ? `${selectedOrder.slotName} (${selectedOrder.startTime || ''} - ${selectedOrder.endTime || ''})`
                        : 'No time slot selected'}
                    </span>
                  </div>
                  {selectedOrder.requestedDeliveryDate && (
                    <p className="text-sm text-gray-600 mt-1 ml-6">
                      Date: {selectedOrder.requestedDeliveryDate}
                    </p>
                  )}
                </div>
              </div>

              {/* Payment Info */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Payment</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-1">
                  <div className="flex items-center">
                    <CreditCard className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="font-medium">
                      {selectedOrder.paymentMethod === 'cash_on_delivery' ? 'Cash on Delivery' : selectedOrder.paymentMethod}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 ml-6">
                    Status: <span className="capitalize">{selectedOrder.paymentStatus}</span>
                  </p>
                  {Number(selectedOrder.paidAmount) > 0 && (
                    <p className="text-sm text-gray-600 ml-6">
                      Paid: {formatCurrency(Number(selectedOrder.paidAmount))}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div>
              <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Items</h4>
              <div className="space-y-2">
                {(selectedOrder.items || []).map((item) => (
                  <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center min-w-0">
                        <Package className="w-4 h-4 text-gray-400 mr-3 shrink-0" />
                        <span className="truncate">
                          {item.productName}
                          {item.unit && item.unit !== 'full' && (
                            <span className="ml-1 text-xs text-primary-700 font-semibold">
                              ({unitLabelShort(item.unit)})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm">
                          {item.quantity} x {formatCurrency(Number(item.unitPrice))}
                          {item.unit && item.unit !== 'full' && (
                            <span className="text-xs text-gray-500 ml-1">
                              / {unitLabelShort(item.unit)}
                            </span>
                          )}
                        </span>
                        <span className="ml-4 font-medium">
                          {formatCurrency(Number(item.totalPrice))}
                        </span>
                      </div>
                    </div>

                    {item.isVariableWeight && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-amber-700">
                            Variable weight
                          </span>
                          {item.finalWeightKg != null && (
                            <span className="text-xs text-gray-600">
                              · Packed: <strong>{formatKgGrams(Number(item.finalWeightKg))}</strong>
                            </span>
                          )}
                          <div className="flex items-center gap-2 ml-auto">
                            <input
                              type="number"
                              step="0.001"
                              min={0}
                              value={weightInputs[item.id] ?? ''}
                              onChange={(e) =>
                                setWeightInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              placeholder={
                                item.finalWeightKg != null ? String(item.finalWeightKg) : 'kg e.g. 5.3'
                              }
                              className="w-28 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSaveItemWeight(item.id)}
                              isLoading={savingWeightId === item.id}
                              disabled={!weightInputs[item.id] || savingWeightId === item.id}
                            >
                              Save weight
                            </Button>
                          </div>
                        </div>
                        {weightInputs[item.id] && Number.isFinite(parseFloat(weightInputs[item.id])) && (
                          <p className="mt-1 text-xs text-gray-500">
                            = {formatKgGrams(parseFloat(weightInputs[item.id]))} · the order amount
                            updates automatically.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Order Summary */}
            <div className="border-t pt-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span>{formatCurrency(Number(selectedOrder.subtotal))}</span>
                </div>
                {Number(selectedOrder.discountAmount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Discount</span>
                    <span className="text-green-600">-{formatCurrency(Number(selectedOrder.discountAmount))}</span>
                  </div>
                )}
                {Number(selectedOrder.couponDiscount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">
                      Coupon{selectedOrder.couponCode ? ` (${selectedOrder.couponCode})` : ''}
                    </span>
                    <span className="text-green-600">-{formatCurrency(Number(selectedOrder.couponDiscount))}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Delivery Charge</span>
                  <span>{Number(selectedOrder.deliveryCharge) === 0 ? 'FREE' : formatCurrency(Number(selectedOrder.deliveryCharge))}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold pt-2 border-t">
                  <span>Total</span>
                  <span>{formatCurrency(Number(selectedOrder.totalAmount))}</span>
                </div>
              </div>
            </div>

            {/* Customer Notes */}
            {selectedOrder.customerNotes && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Customer Notes</h4>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <div className="flex items-start">
                    <FileText className="w-4 h-4 text-yellow-500 mr-2 mt-0.5" />
                    <span>{selectedOrder.customerNotes}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Status Timeline */}
            <div>
              <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Timeline</h4>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Placed', time: selectedOrder.placedAt },
                  { label: 'Confirmed', time: selectedOrder.confirmedAt },
                  { label: 'Preparing', time: selectedOrder.preparingAt },
                  { label: 'Ready', time: selectedOrder.readyAt },
                  { label: 'Out for Delivery', time: selectedOrder.outForDeliveryAt },
                  { label: 'Delivered', time: selectedOrder.deliveredAt },
                  { label: 'Cancelled', time: selectedOrder.cancelledAt },
                ].filter(s => s.time).map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                    <span className="font-medium w-36">{s.label}</span>
                    <span className="text-gray-500">{formatDateTime(s.time!)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Assign Rider */}
            {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Assign Rider</h4>
                <div className="flex items-center space-x-2">
                  {selectedOrder.riderName && (
                    <span className="text-sm text-gray-600 mr-2">
                      Current: <strong>{selectedOrder.riderName}</strong>
                      {selectedOrder.riderPhone && ` (${formatPhoneNumber(selectedOrder.riderPhone)})`}
                    </span>
                  )}
                  <Select
                    value={selectedOrder.riderId || ''}
                    onChange={(e) =>
                      assignRiderMutation.mutate({
                        orderId: selectedOrder.id,
                        riderId: e.target.value,
                      })
                    }
                    options={[
                      { value: '', label: 'Select Rider' },
                      ...(riders?.filter((r: any) => r.verificationStatus === 'verified' && r.status !== 'offline' && r.status !== 'on_leave').map((r: any) => ({ value: r.id, label: `${r.fullName} (${r.status})` })) || []),
                    ]}
                  />
                </div>
              </div>
            )}

            {/* Track Rider */}
            {selectedOrder.riderId && (
              <div>
                <button
                  onClick={() => openRiderTracking(selectedOrder.riderId!, selectedOrder.riderName || 'Rider')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Navigation2 className="w-4 h-4" />
                  Track Rider Live Location
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

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
            options={ORDER_STATUSES.map((s) => ({ value: s, label: formatOrderStatus(s) }))}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note (Optional)
            </label>
            <textarea
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows={3}
              placeholder="Add a note about this status change..."
            />
          </div>
        </div>
      </Modal>

      {/* Rider Location Tracking Modal */}
      <Modal
        isOpen={!!trackingRiderId}
        onClose={() => { setTrackingRiderId(null); setRiderLocation(null); }}
        title={`Track Rider: ${trackingRiderName}`}
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => { setTrackingRiderId(null); setRiderLocation(null); }}>
              Close
            </Button>
          </div>
        }
      >
        {loadingLocation ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        ) : riderLocation?.latitude && riderLocation?.longitude ? (
          <div className="space-y-4">
            <div className="rounded-lg overflow-hidden border" style={{ height: 400 }}>
              <iframe
                title="Rider Location"
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0 }}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${riderLocation.longitude - 0.005}%2C${riderLocation.latitude - 0.005}%2C${riderLocation.longitude + 0.005}%2C${riderLocation.latitude + 0.005}&layer=mapnik&marker=${riderLocation.latitude}%2C${riderLocation.longitude}`}
                allowFullScreen
              />
            </div>
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
              <div className="text-sm">
                <p className="font-medium">{trackingRiderName}</p>
                <p className="text-gray-500">
                  Last updated: {riderLocation.locationUpdatedAt ? new Date(riderLocation.locationUpdatedAt).toLocaleTimeString() : 'N/A'}
                </p>
              </div>
              <a
                href={`https://www.google.com/maps?q=${riderLocation.latitude},${riderLocation.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 hover:underline"
              >
                Open in Google Maps
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Location data not available for this rider.</p>
          </div>
        )}
      </Modal>
    </Layout>
  );
};

export default Orders;
