import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Plus, Trash2, MapPin, User, Package } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { whatsappService } from '@/services/whatsapp.service';
import { productService } from '@/services/product.service';
import type { WhatsAppOrderData } from '@/types';
import toast from 'react-hot-toast';

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
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
  });

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
    setFormData({ whatsappNumber: '', customerName: '', addressText: '', deliveryCharge: 0, adminNotes: '' });
    setItems([{ id: '1', productId: '', quantity: 1 }]);
  };

  const addItem = () => {
    setItems([...items, { id: Date.now().toString(), productId: '', quantity: 1 }]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: keyof OrderItem, value: string | number) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((item) => item.productId !== '');
    if (validItems.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    if (!formData.whatsappNumber || !formData.customerName || !formData.addressText) {
      toast.error('Please fill all required fields');
      return;
    }

    const orderData: WhatsAppOrderData = {
      whatsappNumber: formData.whatsappNumber,
      customerName: formData.customerName,
      addressText: formData.addressText,
      deliveryCharge: formData.deliveryCharge || undefined,
      adminNotes: formData.adminNotes || undefined,
      items: validItems.map(({ productId, quantity }) => ({ productId, quantity })),
    };
    createMutation.mutate(orderData);
  };

  return (
    <Layout title="WhatsApp Orders" subtitle="Create orders from WhatsApp messages">
      <div className="max-w-4xl mx-auto">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <User className="w-5 h-5 mr-2" />
                Customer Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Customer Name *"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="Enter customer name"
                  required
                />
                <Input
                  label="WhatsApp Number *"
                  value={formData.whatsappNumber}
                  onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                  placeholder="+923XXXXXXXXX"
                  required
                />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <MapPin className="w-5 h-5 mr-2" />
                Delivery Address
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                  <textarea
                    value={formData.addressText}
                    onChange={(e) => setFormData({ ...formData, addressText: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    rows={2}
                    placeholder="Complete delivery address"
                    required
                  />
                </div>
                <Input
                  label="Delivery Charge (PKR)"
                  type="number"
                  value={formData.deliveryCharge.toString()}
                  onChange={(e) => setFormData({ ...formData, deliveryCharge: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Package className="w-5 h-5 mr-2" />
                Order Items
              </h3>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(item.id, 'productId', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
            <li>Enter customer details from WhatsApp message</li>
            <li>Select products from the dropdown and set quantity</li>
            <li>The system will calculate totals automatically based on product prices</li>
            <li>Add delivery address and any admin notes</li>
          </ul>
        </Card>
      </div>
    </Layout>
  );
};