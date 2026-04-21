import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MapPin, CheckCircle } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { addressService } from '@/services/address.service';
import toast from 'react-hot-toast';

export const Addresses: React.FC = () => {
  const [addressId, setAddressId] = useState('');
  const [houseNumber, setHouseNumber] = useState('');

  const assignMutation = useMutation({
    mutationFn: () => addressService.assignHouseNumber(addressId, houseNumber),
    onSuccess: () => {
      toast.success('House number assigned successfully');
      setAddressId('');
      setHouseNumber('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to assign house number');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressId || !houseNumber) {
      toast.error('Please fill both fields');
      return;
    }
    assignMutation.mutate();
  };

  return (
    <Layout title="Address Management" subtitle="Assign house numbers to delivery addresses">
      <Card className="mb-6 bg-amber-50 border-amber-200">
        <div className="flex items-start">
          <MapPin className="w-5 h-5 text-amber-600 mt-0.5 mr-3" />
          <div>
            <h4 className="font-medium text-amber-900">House Number Assignment</h4>
            <p className="text-sm text-amber-800 mt-1">
              Assign a house number to a customer address for accurate delivery. 
              Enter the address ID and the house/flat number to assign.
            </p>
          </div>
        </div>
      </Card>

      <div className="max-w-lg">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Address ID *"
              value={addressId}
              onChange={(e) => setAddressId(e.target.value)}
              placeholder="Enter address UUID"
              required
            />
            <Input
              label="House/Flat Number *"
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              placeholder="e.g., 42-A, Flat 301"
              required
            />
            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                isLoading={assignMutation.isPending}
                leftIcon={<CheckCircle className="w-4 h-4" />}
              >
                Assign House Number
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </Layout>
  );
};