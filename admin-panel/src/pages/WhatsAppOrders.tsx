import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Plus, Trash2, MapPin, User, Package, Search, Home, CheckCircle, Loader2 } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { whatsappService } from '@/services/whatsapp.service';
import { productService } from '@/services/product.service';
import { resolveImageUrl } from '@/utils/formatters';
import type { WhatsAppOrderData, WhatsappCustomerAddress } from '@/types';
import toast from 'react-hot-toast';

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
}

function composeAddress(a: WhatsappCustomerAddress): string {
  return [
    a.houseNumber ? `House ${a.houseNumber}` : '',
    a.writtenAddress,
    a.areaName,
    a.city,
  ]
    .filter(Boolean)
    .join(', ');
}

export const WhatsAppOrders: React.FC = () => {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<OrderItem[]>([{ id: '1', productId: '', quantity: 1 }]);

  const [formData, setFormData] = useState({
    whatsappNumber: '',
    customerName: '',
    addressText: '',
    deliveryCharge: 0,
    adminNotes: '',
    latitude: '' as string,
    longitude: '' as string,
    doorPictureUrl: '' as string,
    userId: '' as string,
    addressId: '' as string,
  });

  // Customer lookup state
  const [addresses, setAddresses] = useState<WhatsappCustomerAddress[]>([]);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<string | null>(null);

  const { data: productsData } = useQuery({
    queryKey: ['products-for-whatsapp'],
    queryFn: () => productService.getProducts({ page: 1, limit: 200 }),
  });
  const products = productsData?.products || [];

  const createMutation = useMutation({
    mutationFn: whatsappService.createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('WhatsApp order created successfully');
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create order');
    },
  });

  const resetForm = () => {
    setFormData({
      whatsappNumber: '', customerName: '', addressText: '', deliveryCharge: 0, adminNotes: '',
      latitude: '', longitude: '', doorPictureUrl: '', userId: '', addressId: '',
    });
    setItems([{ id: '1', productId: '', quantity: 1 }]);
    setAddresses([]);
    setLookupDone(false);
    setFoundCustomer(null);
  };

  const handleLookup = async () => {
    const phone = formData.whatsappNumber.trim();
    if (!phone) {
      toast.error('Enter a phone number first');
      return;
    }
    setLookingUp(true);
    try {
      const { customer, addresses: addrs } = await whatsappService.lookupCustomer(phone);
      setLookupDone(true);
      if (customer) {
        setFoundCustomer(customer.fullName);
        setAddresses(addrs);
        setFormData((prev) => ({ ...prev, customerName: customer.fullName, userId: customer.id }));
        // Auto-select the only / default address.
        if (addrs.length === 1) selectAddress(addrs[0]);
        toast.success(`Found ${customer.fullName}${addrs.length ? ` · ${addrs.length} address(es)` : ''}`);
      } else {
        setFoundCustomer(null);
        setAddresses([]);
        setFormData((prev) => ({ ...prev, userId: '', addressId: '' }));
        toast('No saved customer — enter the details manually', { icon: 'ℹ️' });
      }
    } catch {
      toast.error('Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  const selectAddress = (a: WhatsappCustomerAddress) => {
    setFormData((prev) => ({
      ...prev,
      addressId: a.id,
      addressText: composeAddress(a),
      latitude: a.latitude != null ? String(a.latitude) : '',
      longitude: a.longitude != null ? String(a.longitude) : '',
      doorPictureUrl: a.doorPictureUrl || '',
    }));
  };

  const addItem = () => setItems([...items, { id: Date.now().toString(), productId: '', quantity: 1 }]);
  const removeItem = (id: string) => {
    if (items.length > 1) setItems(items.filter((i) => i.id !== id));
  };
  const updateItem = (id: string, field: keyof OrderItem, value: string | number) =>
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((i) => i.productId !== '');
    if (validItems.length === 0) return toast.error('Please add at least one item');
    if (!formData.whatsappNumber || !formData.customerName || !formData.addressText) {
      return toast.error('Please fill all required fields');
    }

    const lat = parseFloat(formData.latitude);
    const lng = parseFloat(formData.longitude);

    const orderData: WhatsAppOrderData = {
      whatsappNumber: formData.whatsappNumber,
      customerName: formData.customerName,
      addressText: formData.addressText,
      deliveryCharge: formData.deliveryCharge || undefined,
      adminNotes: formData.adminNotes || undefined,
      items: validItems.map(({ productId, quantity }) => ({ productId, quantity })),
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : {}),
      ...(formData.userId ? { userId: formData.userId } : {}),
      ...(formData.addressId ? { addressId: formData.addressId } : {}),
      ...(formData.doorPictureUrl ? { doorPictureUrl: formData.doorPictureUrl } : {}),
    };
    createMutation.mutate(orderData);
  };

  const selectedAddress = addresses.find((a) => a.id === formData.addressId);

  return (
    <Layout title="WhatsApp Orders" subtitle="Create orders from WhatsApp messages">
      <div className="max-w-4xl mx-auto">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <User className="w-5 h-5 mr-2" /> Customer Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number *</label>
                  <div className="flex gap-2">
                    <input
                      value={formData.whatsappNumber}
                      onChange={(e) => {
                        setFormData({ ...formData, whatsappNumber: e.target.value });
                        setLookupDone(false);
                      }}
                      onBlur={() => formData.whatsappNumber && !lookupDone && handleLookup()}
                      placeholder="+923XXXXXXXXX"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                    <Button type="button" variant="outline" onClick={handleLookup} disabled={lookingUp}>
                      {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                  {lookupDone && (
                    <p className={`mt-1 text-xs ${foundCustomer ? 'text-green-600' : 'text-gray-500'}`}>
                      {foundCustomer ? `✓ Existing customer: ${foundCustomer}` : 'New / unsaved number'}
                    </p>
                  )}
                </div>
                <Input
                  label="Customer Name *"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="Enter customer name"
                  required
                />
              </div>
            </div>

            {/* Saved addresses */}
            {addresses.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                  <Home className="w-4 h-4 mr-1.5" /> Saved addresses ({addresses.length}) — select one
                </h3>
                <div className="space-y-2">
                  {addresses.map((a) => {
                    const active = formData.addressId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => selectAddress(a)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          active ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{composeAddress(a)}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              {a.houseNumber && (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">
                                  House #{a.houseNumber}
                                </span>
                              )}
                              {a.isDefault && (
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">Default</span>
                              )}
                              <span className={a.hasLocation ? 'text-green-600' : 'text-gray-400'}>
                                {a.hasLocation ? '📍 Location saved' : 'No location'}
                              </span>
                              {a.doorPictureUrl && <span className="text-green-600">🖼 Door photo</span>}
                            </div>
                          </div>
                          {active && <CheckCircle className="w-5 h-5 text-primary-600 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Address + location + door pic */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <MapPin className="w-5 h-5 mr-2" /> Delivery Address
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                  <textarea
                    value={formData.addressText}
                    onChange={(e) => setFormData({ ...formData, addressText: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    rows={2}
                    placeholder="Complete delivery address"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Latitude (optional)"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    placeholder="e.g. 32.5742"
                  />
                  <Input
                    label="Longitude (optional)"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    placeholder="e.g. 74.0754"
                  />
                  <Input
                    label="Delivery Charge (PKR)"
                    type="number"
                    value={formData.deliveryCharge.toString()}
                    onChange={(e) => setFormData({ ...formData, deliveryCharge: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
                {(formData.doorPictureUrl || selectedAddress?.doorPictureUrl) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Door picture (from saved address)</label>
                    <a href={resolveImageUrl(formData.doorPictureUrl)} target="_blank" rel="noopener noreferrer">
                      <img
                        src={resolveImageUrl(formData.doorPictureUrl)}
                        alt="Door"
                        className="h-24 w-24 rounded-lg border border-gray-200 object-cover"
                      />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Package className="w-5 h-5 mr-2" /> Order Items
              </h3>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(item.id, 'productId', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Select product</option>
                      {(products as any[]).map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.nameEn} - Rs. {p.price}/{p.unitType}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      disabled={items.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={addItem} className="mt-3" leftIcon={<Plus className="w-4 h-4" />}>
                Add Item
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes (Optional)</label>
              <textarea
                value={formData.adminNotes}
                onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                rows={2}
                placeholder="Any notes about this order..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={resetForm}>Clear</Button>
              <Button type="submit" isLoading={createMutation.isPending} leftIcon={<MessageCircle className="w-5 h-5" />}>
                Create Order
              </Button>
            </div>
          </form>
        </Card>

        <Card className="mt-6 bg-blue-50 border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">How to use:</h4>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Type the WhatsApp number and press search — an existing customer's name + saved addresses auto-load</li>
            <li>Pick one of the saved addresses (house number, location and door photo come with it)</li>
            <li>Latitude / longitude and door picture are optional and can be edited</li>
            <li>Select products and quantities — totals are calculated from product prices</li>
          </ul>
        </Card>
      </div>
    </Layout>
  );
};
