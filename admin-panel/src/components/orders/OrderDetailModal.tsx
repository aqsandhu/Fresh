// The admin order-detail popup (moved out of pages/Orders.tsx, W21): customer,
// address (house number, location, door picture), items with re-weighing,
// totals, timeline, rider tasks, assigning / tracking the rider. Mounted per
// opening, so typed weights or a half-edited house number never carry over.
import React, { useState } from 'react';
import { asCaughtError, errorView } from '@/lib/caughtError';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
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
  MessageCircle,
  Trash2,
  Image,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { orderService } from '@/services/order.service';
import { addressService } from '@/services/address.service';
import type { Order, Rider } from '@/types';
import { TaskRowCard } from '@/components/riders/RiderDetail';
import { riderDispatchLabel } from '@/lib/riderLabels';
import {
  formatCurrency,
  formatDateTime,
  formatOrderStatus,
  formatPhoneNumber,
  getOrderStatusColor,
  resolveImageUrl,
} from '@/utils/formatters';
import { unitLabelShort } from '@/lib/unitLabels';
import { formatKgGrams, printOrderSlips } from '@/lib/orderSlip';
import toast from 'react-hot-toast';

export const OrderDetailModal: React.FC<{
  order: Order;
  /** The page's selected order — the popup refreshes it after a change. */
  setOrder: React.Dispatch<React.SetStateAction<Order | null>>;
  onClose: () => void;
  isSuperAdmin: boolean;
  canAssignRider: boolean;
  canUpdateOrders: boolean;
  canEditAddresses: boolean;
  assignableRiders: Rider[];
  onAssignRider: (orderId: string, riderId: string) => void;
  onTogglePhone: (orderId: string, show: boolean) => void;
  togglingPhone: boolean;
  onTrackRider: (riderId: string, riderName: string) => void;
}> = ({
  order: selectedOrder,
  setOrder: setSelectedOrder,
  onClose,
  isSuperAdmin,
  canAssignRider,
  canUpdateOrders,
  canEditAddresses,
  assignableRiders,
  onAssignRider,
  onTogglePhone,
  togglingPhone,
  onTrackRider,
}) => {
  const queryClient = useQueryClient();
  const [weightInputs, setWeightInputs] = useState<Record<string, string>>({});
  const [savingWeightId, setSavingWeightId] = useState<string | null>(null);
  const [editingHouseNumber, setEditingHouseNumber] = useState(false);
  const [houseNumberValue, setHouseNumberValue] = useState(
    selectedOrder.deliveryAddressSnapshot?.houseNumber || '',
  );

  // Failed delivery → back to the store so it can be re-dispatched or cancelled.
  const returnToStoreMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) => orderService.returnToStore(orderId, reason),
    onSuccess: async (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      toast.success('Order is back in the store — assign another rider or cancel it');
      try {
        setSelectedOrder(await orderService.getOrderById(vars.orderId));
      } catch { /* ignore */ }
    },
    onError: (e: unknown) => toast.error(errorView(e)?.message || 'Could not return the order'),
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

  const deleteOrderMutation = useMutation({
    mutationFn: (orderId: string) => orderService.deleteOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order deleted successfully');
      onClose();
      setSelectedOrder(null);
    },
    onError: (errCaught: unknown) => {
      const err = errorView(errCaught);
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
    onError: (err: unknown) => toast.error(errorView(err)?.message || 'Failed to remove door picture'),
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
    onError: (err: unknown) => toast.error(errorView(err)?.message || 'Failed to remove location'),
  });

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
    } catch (errCaught: unknown) {
      const err = asCaughtError(errCaught);
      toast.error(err?.message || 'Failed to update weight');
    } finally {
      setSavingWeightId(null);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
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
          <Button variant="outline" onClick={onClose}>
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
                    onClick={() => onTogglePhone(selectedOrder.id, !selectedOrder.showCustomerPhone)}
                    disabled={!canUpdateOrders || togglingPhone}
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
                            {canEditAddresses && (
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
                            )}
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
                        {canUpdateOrders && (
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
                        )}
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

          {/* Rider timeline — what the rider(s) did on this order */}
          {(selectedOrder.riderTasks?.length || 0) > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Rider activity</h4>
              <div className="space-y-2">
                {selectedOrder.riderTasks!.map((t) => <TaskRowCard key={t.id} task={t} showRider />)}
              </div>
              {selectedOrder.status === 'out_for_delivery' &&
                selectedOrder.riderTasks!.length > 0 &&
                !selectedOrder.riderTasks!.some((t) => t.status === 'assigned' || t.status === 'in_progress') && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-800">
                      No rider is working on this order any more. Assign another rider below, or bring the goods back to the
                      store (the order returns to <strong>Ready for pickup</strong> and can then be cancelled).
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      isLoading={returnToStoreMutation.isPending}
                      onClick={() => {
                        const reason = window.prompt('Reason (shown in the order notes):', selectedOrder.riderTasks!.slice(-1)[0]?.notes || '') ?? undefined;
                        if (reason === undefined) return;
                        returnToStoreMutation.mutate({ orderId: selectedOrder.id, reason });
                      }}
                    >
                      Return to store
                    </Button>
                  </div>
                )}
            </div>
          )}
          {selectedOrder.deliveryProofImage && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 uppercase mb-3">Proof of delivery</h4>
              <a href={resolveImageUrl(selectedOrder.deliveryProofImage)} target="_blank" rel="noopener noreferrer">
                <img src={resolveImageUrl(selectedOrder.deliveryProofImage)} alt="Proof of delivery" className="max-h-56 rounded-lg border" />
              </a>
            </div>
          )}

          {/* Assign Rider */}
          {canAssignRider && selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
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
                  onChange={(e) => {
                    // "Select Rider" is not a rider — sending it only
                    // earned a server error (same guard as the list).
                    if (!e.target.value) return;
                    onAssignRider(selectedOrder.id, e.target.value);
                  }}
                  options={[
                    { value: '', label: 'Select Rider' },
                    ...assignableRiders.map((r) => ({ value: r.id, label: riderDispatchLabel(r) })),
                  ]}
                />
              </div>
            </div>
          )}

          {/* Track Rider */}
          {selectedOrder.riderId && (
            <div>
              <button
                onClick={() => onTrackRider(selectedOrder.riderId!, selectedOrder.riderName || 'Rider')}
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
  );
};
