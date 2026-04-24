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
  Wifi,
  WifiOff,
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
import {
  connectSocket,
  disconnectSocket,
  onNewOrder,
  onOrderStatusUpdated,
  onOrderCancelled,
  offSocketEvent,
  playNotificationSound,
} from '@/services/socket';
import type { Order, OrderStatus } from '@/types';
import {
  formatCurrency,
  formatDateTime,
  formatOrderStatus,
  formatPhoneNumber,
  getOrderStatusColor,
  escapeHtml,
} from '@/utils/formatters';
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

export const Orders: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus>('pending');
  const [statusNote, setStatusNote] = useState('');
  const [page, setPage] = useState(1);
  const [editingHouseNumber, setEditingHouseNumber] = useState(false);
  const [houseNumberValue, setHouseNumberValue] = useState('');
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [flashingOrders, setFlashingOrders] = useState<Set<string>>(new Set());
  const [newOrderCount, setNewOrderCount] = useState(0);
  const prevOrdersRef = useRef<string[]>([]);

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['orders', { status: statusFilter, search: searchQuery, page }],
    queryFn: () =>
      orderService.getOrders({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        page,
        limit: 10,
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

  // Setup Socket.IO for real-time admin notifications
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;

    const socket = connectSocket(token);

    // Track connection status
    const connectionInterval = setInterval(() => {
      setIsSocketConnected(socket.connected);
    }, 3000);

    // Listen for new orders
    const handleNewOrder = (data: any) => {
      console.log('[Admin] New order received:', data);
      playNotificationSound();
      toast.success(`New order #${data.orderNumber} received!`, {
        icon: <Bell className="w-4 h-4 text-green-500" />,
        duration: 5000,
      });
      // Flash the new order
      if (data.orderId) {
        setFlashingOrders((prev) => new Set(prev).add(data.orderId));
        setNewOrderCount((prev) => prev + 1);
        setTimeout(() => {
          setFlashingOrders((prev) => {
            const next = new Set(prev);
            next.delete(data.orderId);
            return next;
          });
        }, 5000);
      }
      // Refresh orders list
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    };
    onNewOrder(handleNewOrder);

    // Listen for order status updates
    const handleStatusUpdated = (data: any) => {
      console.log('[Admin] Order status updated:', data);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      // Flash the updated order
      if (data.orderId) {
        setFlashingOrders((prev) => new Set(prev).add(data.orderId));
        setTimeout(() => {
          setFlashingOrders((prev) => {
            const next = new Set(prev);
            next.delete(data.orderId);
            return next;
          });
        }, 3000);
      }
    };
    onOrderStatusUpdated(handleStatusUpdated);

    // Listen for cancelled orders
    const handleOrderCancelled = (data: any) => {
      console.log('[Admin] Order cancelled:', data);
      toast.error(`Order #${data.orderNumber} was cancelled`, {
        duration: 5000,
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    };
    onOrderCancelled(handleOrderCancelled);

    return () => {
      clearInterval(connectionInterval);
      offSocketEvent('order:new', handleNewOrder);
      offSocketEvent('order:status_updated', handleStatusUpdated);
      offSocketEvent('order:cancelled', handleOrderCancelled);
      disconnectSocket();
    };
  }, [queryClient]);

  // Detect new orders for visual feedback
  useEffect(() => {
    if (!ordersData?.orders) return;
    const currentOrderIds = ordersData.orders.map((o: Order) => o.id);
    if (prevOrdersRef.current.length > 0) {
      const newIds = currentOrderIds.filter(
        (id: string) => !prevOrdersRef.current.includes(id)
      );
      if (newIds.length > 0) {
        setFlashingOrders((prev) => {
          const next = new Set(prev);
          newIds.forEach((id: string) => next.add(id));
          return next;
        });
      }
    }
    prevOrdersRef.current = currentOrderIds;
  }, [ordersData]);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: OrderStatus; note?: string }) =>
      orderService.updateOrderStatus(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order status updated successfully');
      setIsStatusModalOpen(false);
      setStatusNote('');
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

  const handleStatusUpdate = (order: Order) => {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setIsStatusModalOpen(true);
  };

  const confirmStatusUpdate = () => {
    if (selectedOrder) {
      updateStatusMutation.mutate({
        id: selectedOrder.id,
        status: newStatus,
        note: statusNote,
      });
    }
  };

  // Clear new order notification badge
  const clearNewOrderCount = () => setNewOrderCount(0);

  const columns = [
    {
      key: 'orderNumber',
      title: 'Order #',
      render: (order: Order) => (
        <div>
          <p className="font-medium text-gray-900">{order.orderNumber}</p>
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
        const doorPic = order.addressDoorPictureUrl;
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
            <div className="flex items-center gap-2 mt-0.5">
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
              ) : (
                <span className="text-xs text-gray-400">No location</span>
              )}
              {doorPic && (
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
              )}
            </div>
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
    return '';
  };

  return (
    <Layout
      title="Orders"
      subtitle="Manage and track customer orders"
      searchPlaceholder="Search orders..."
      onSearch={setSearchQuery}
    >
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

      {/* Orders Table */}
      <Card>
        <Table
          columns={columns}
          data={ordersData?.orders || []}
          keyExtractor={(order) => order.id}
          isLoading={isLoading}
          emptyMessage="No orders found"
          rowClassName={getRowClassName}
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
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => {
                if (!selectedOrder) return;
                const printContent = document.getElementById('order-print-area');
                if (!printContent) return;
                const win = window.open('', '_blank', 'width=400,height=600');
                if (!win) return;
                // Build print HTML safely — escape all user-controlled data
                const e = escapeHtml;
                const printHtml = `
                  <html><head><title>Order ${e(selectedOrder.orderNumber)}</title>
                  <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 16px; font-size: 12px; color: #000; }
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
                  </style></head><body>
                  <div class="header">
                    <h1>FreshBazar</h1>
                    <p>Fresh Grocery Delivery</p>
                    <p style="font-weight:bold;font-size:13px;">Order: ${e(selectedOrder.orderNumber)}</p>
                    <p>${e(new Date(selectedOrder.placedAt).toLocaleString('en-PK'))}</p>
                  </div>
                  <div class="section">
                    <div class="section-title">Customer</div>
                    <div class="row"><span>${e(selectedOrder.customerName)}</span></div>
                    ${selectedOrder.showCustomerPhone ? `<div class="row"><span>${e(formatPhoneNumber(selectedOrder.customerPhone))}</span></div>` : ''}
                    ${selectedOrder.customerEmail ? `<div class="row"><span>${e(selectedOrder.customerEmail)}</span></div>` : ''}
                  </div>
                  ${selectedOrder.deliveryAddressSnapshot ? `
                  <div class="section">
                    <div class="section-title">Delivery Address</div>
                    ${selectedOrder.deliveryAddressSnapshot.houseNumber ? `<div><strong>House #: ${e(selectedOrder.deliveryAddressSnapshot.houseNumber)}</strong></div>` : ''}
                    <div>${e(selectedOrder.deliveryAddressSnapshot.writtenAddress || '')}</div>
                    ${selectedOrder.deliveryAddressSnapshot.landmark ? `<div>Landmark: ${e(selectedOrder.deliveryAddressSnapshot.landmark)}</div>` : ''}
                    <div>${e([selectedOrder.deliveryAddressSnapshot.areaName, selectedOrder.deliveryAddressSnapshot.city].filter(Boolean).join(', '))}</div>
                  </div>` : ''}
                  ${selectedOrder.slotName ? `
                  <div class="section">
                    <div class="section-title">Delivery Time Slot</div>
                    <div>${e(selectedOrder.slotName)}</div>
                  </div>` : ''}
                  <div class="section">
                    <div class="section-title">Items</div>
                    <table class="items-table">
                      <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead>
                      <tbody>
                        ${(selectedOrder.items || []).map(item => `<tr><td>${e(item.productName)}</td><td class="right">${e(item.quantity)}</td><td class="right">Rs.${Number(item.unitPrice).toFixed(0)}</td><td class="right">Rs.${Number(item.totalPrice).toFixed(0)}</td></tr>`).join('')}
                      </tbody>
                    </table>
                  </div>
                  <div class="total-section">
                    <div class="total-row"><span>Subtotal</span><span>Rs.${Number(selectedOrder.subtotal).toFixed(0)}</span></div>
                    <div class="total-row"><span>Delivery</span><span>Rs.${Number(selectedOrder.deliveryCharge).toFixed(0)}</span></div>
                    ${Number(selectedOrder.discountAmount) > 0 ? `<div class="total-row"><span>Discount</span><span>-Rs.${Number(selectedOrder.discountAmount).toFixed(0)}</span></div>` : ''}
                    <div class="total-row grand-total"><span>Total</span><span>Rs.${Number(selectedOrder.totalAmount).toFixed(0)}</span></div>
                  </div>
                  <div class="section" style="margin-top:8px;">
                    <div class="total-row"><span>Payment</span><span>${selectedOrder.paymentMethod === 'cash_on_delivery' ? 'Cash on Delivery' : e(selectedOrder.paymentMethod)}</span></div>
                    <div class="total-row"><span>Status</span><span>${e(formatOrderStatus(selectedOrder.status))}</span></div>
                  </div>
                  ${selectedOrder.customerNotes ? `<div class="section"><div class="section-title">Customer Notes</div><div>${e(selectedOrder.customerNotes)}</div></div>` : ''}
                  <div class="footer">
                    <p>Thank you for shopping with FreshBazar!</p>
                  </div>
                  </body></html>
                `;
                win.document.write(printHtml);
                win.document.close();
                win.focus();
                win.print();
              }}
              leftIcon={<Printer className="w-4 h-4" />}
            >
              Print Slip
            </Button>
            <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedOrder && (
          <div className="space-y-6" id="order-print-area">
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
                    <span>{formatPhoneNumber(selectedOrder.customerPhone)}</span>
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
                            <div className="flex items-center gap-2">
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
                            </div>
                          </div>
                        );
                      })()}

                      {/* Door Picture */}
                      {selectedOrder.addressDoorPictureUrl && (
                        <div className="ml-6 pt-2 border-t border-gray-200">
                          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                            <Home className="w-3.5 h-3.5" /> Door Picture
                          </p>
                          <a href={selectedOrder.addressDoorPictureUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={selectedOrder.addressDoorPictureUrl}
                              alt="Door"
                              className="w-28 h-20 object-cover rounded-lg border hover:opacity-80 transition-opacity cursor-pointer"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </a>
                        </div>
                      )}
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
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center">
                      <Package className="w-4 h-4 text-gray-400 mr-3" />
                      <span>{item.productName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm">
                        {item.quantity} x {formatCurrency(Number(item.unitPrice))}
                      </span>
                      <span className="ml-4 font-medium">
                        {formatCurrency(Number(item.totalPrice))}
                      </span>
                    </div>
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
                <div className="flex justify-between">
                  <span className="text-gray-500">Delivery Charge</span>
                  <span>{Number(selectedOrder.deliveryCharge) === 0 ? 'FREE' : formatCurrency(Number(selectedOrder.deliveryCharge))}</span>
                </div>
                {Number(selectedOrder.discountAmount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Discount</span>
                    <span className="text-green-600">-{formatCurrency(Number(selectedOrder.discountAmount))}</span>
                  </div>
                )}
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
        onClose={() => setIsStatusModalOpen(false)}
        title="Update Order Status"
        footer={
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setIsStatusModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmStatusUpdate}
              isLoading={updateStatusMutation.isPending}
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
