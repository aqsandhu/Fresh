import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin,
  CheckCircle,
  Search,
  Home,
  User,
  Phone,
  Navigation,
  Calendar,
  Trash2,
  Edit3,
  ChevronDown,
  X,
  Loader2,
  Building,
  Filter,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { addressService } from '@/services/address.service';
import { customerService } from '@/services/customer.service';
import type { Address, Customer } from '@/types';
import toast from 'react-hot-toast';

export const Addresses: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [addressSearch, setAddressSearch] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Fetch customers list
  const {
    data: customersData,
    isLoading: customersLoading,
  } = useQuery({
    queryKey: ['customers', 'dropdown'],
    queryFn: () => customerService.getCustomers({ limit: 500 }),
    staleTime: 5 * 60 * 1000,
  });

  const customers = customersData?.customers || [];

  // Fetch addresses (optionally filtered by customer)
  const {
    data: addressesData,
    isLoading: addressesLoading,
    refetch: refetchAddresses,
  } = useQuery({
    queryKey: ['addresses', selectedCustomerId],
    queryFn: () =>
      selectedCustomerId
        ? customerService.getCustomerAddresses(selectedCustomerId)
        : addressService.getAddresses({ limit: 100 }).then((r) => r.addresses),
    enabled: true,
  });

  const addresses: Address[] = addressesData || [];

  // Filter addresses by search
  const filteredAddresses = useMemo(() => {
    if (!addressSearch.trim()) return addresses;
    const q = addressSearch.toLowerCase();
    return addresses.filter(
      (a) =>
        a.writtenAddress?.toLowerCase().includes(q) ||
        a.areaName?.toLowerCase().includes(q) ||
        a.city?.toLowerCase().includes(q) ||
        a.houseNumber?.toLowerCase().includes(q) ||
        a.landmark?.toLowerCase().includes(q)
    );
  }, [addresses, addressSearch]);

  // Filter customers for dropdown
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.fullName?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  // Selected customer info
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Assign house number mutation
  const assignMutation = useMutation({
    mutationFn: ({ id, houseNum }: { id: string; houseNum: string }) =>
      addressService.assignHouseNumber(id, houseNum),
    onSuccess: () => {
      toast.success('House number assigned successfully');
      setHouseNumber('');
      setEditingAddressId(null);
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to assign house number');
    },
  });

  // Delete address mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => addressService.deleteAddress(id),
    onSuccess: () => {
      toast.success('Address deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete address');
    },
  });

  const handleAssignHouseNumber = (addressId: string) => {
    if (!houseNumber.trim()) {
      toast.error('Please enter a house number');
      return;
    }
    assignMutation.mutate({ id: addressId, houseNum: houseNumber.trim() });
  };

  const handleDeleteAddress = (addressId: string) => {
    if (window.confirm('Are you sure you want to delete this address?')) {
      deleteMutation.mutate(addressId);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Layout title="Address Management" subtitle="Manage customer addresses and assign house numbers">
      {/* Info Card */}
      <Card className="mb-6 bg-amber-50 border-amber-200">
        <div className="flex items-start">
          <MapPin className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-amber-900">House Number Assignment</h4>
            <p className="text-sm text-amber-800 mt-1">
              Select a customer to view their addresses. You can assign or update house numbers
              for accurate delivery tracking.
            </p>
          </div>
        </div>
      </Card>

      {/* Customer Selector */}
      <Card className="mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="flex-1 w-full relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="w-4 h-4 inline mr-1" />
              Select Customer
            </label>
            <div
              className="relative cursor-pointer"
              onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
            >
              <div className="flex items-center w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:border-primary-400 transition-colors">
                {selectedCustomer ? (
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                      <span className="text-primary-700 font-semibold text-sm">
                        {selectedCustomer.fullName?.charAt(0).toUpperCase() || '?'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {selectedCustomer.fullName}
                      </p>
                      <p className="text-xs text-gray-500">{selectedCustomer.phone}</p>
                    </div>
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm">All Customers</span>
                )}
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 ml-2 transition-transform flex-shrink-0 ${
                    showCustomerDropdown ? 'rotate-180' : ''
                  }`}
                />
              </div>

              {/* Dropdown */}
              {showCustomerDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search customers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-60">
                    <div
                      className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer flex items-center"
                      onClick={() => {
                        setSelectedCustomerId('');
                        setShowCustomerDropdown(false);
                        setSearchQuery('');
                      }}
                    >
                      <span className="text-sm text-gray-600">All Customers</span>
                    </div>
                    {customersLoading ? (
                      <div className="px-4 py-3 text-sm text-gray-500 flex items-center">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Loading customers...
                      </div>
                    ) : filteredCustomers.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">
                        No customers found
                      </div>
                    ) : (
                      filteredCustomers.map((customer) => (
                        <div
                          key={customer.id}
                          className={`px-4 py-2.5 hover:bg-gray-50 cursor-pointer flex items-center ${
                            selectedCustomerId === customer.id ? 'bg-primary-50' : ''
                          }`}
                          onClick={() => {
                            setSelectedCustomerId(customer.id);
                            setShowCustomerDropdown(false);
                            setSearchQuery('');
                          }}
                        >
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                            <span className="text-primary-700 font-semibold text-sm">
                              {customer.fullName?.charAt(0).toUpperCase() || '?'}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {customer.fullName}
                            </p>
                            <p className="text-xs text-gray-500">{customer.phone}</p>
                          </div>
                          {selectedCustomerId === customer.id && (
                            <CheckCircle className="w-4 h-4 text-primary-600 flex-shrink-0" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Click outside to close dropdown */}
            {showCustomerDropdown && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowCustomerDropdown(false)}
              />
            )}
          </div>

          {/* Address search */}
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-1" />
              Search Addresses
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by area, city, house number..."
                value={addressSearch}
                onChange={(e) => setAddressSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {addressSearch && (
                <button
                  onClick={() => setAddressSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Selected customer info bar */}
        {selectedCustomer && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-900">{selectedCustomer.fullName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{selectedCustomer.phone}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{filteredAddresses.length} address(es)</span>
            </div>
          </div>
        )}
      </Card>

      {/* Addresses Table */}
      <Card>
        {addressesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600 mr-2" />
            <span className="text-gray-600">Loading addresses...</span>
          </div>
        ) : filteredAddresses.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Addresses Found</h3>
            <p className="text-gray-500 text-sm">
              {selectedCustomerId
                ? 'This customer has no saved addresses.'
                : addressSearch
                ? 'No addresses match your search.'
                : 'No addresses in the system yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    House Number
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAddresses.map((address) => (
                  <tr key={address.id} className="hover:bg-gray-50 transition-colors">
                    {/* Address Column */}
                    <td className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Home className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                            {address.writtenAddress || 'No address text'}
                          </p>
                          {address.landmark && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Landmark: {address.landmark}
                            </p>
                          )}
                          {address.deliveryInstructions && (
                            <p className="text-xs text-gray-500 mt-0.5 italic">
                              {address.deliveryInstructions}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Location Column */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Navigation className="w-3.5 h-3.5 text-gray-400" />
                        <span>{address.areaName || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                        <Building className="w-3.5 h-3.5" />
                        <span>{address.city || 'N/A'}</span>
                        {address.province && <span>, {address.province}</span>}
                      </div>
                      {(address.latitude || address.longitude) && (
                        <div className="text-xs text-gray-400 mt-1">
                          {address.latitude?.toFixed(4)}, {address.longitude?.toFixed(4)}
                        </div>
                      )}
                    </td>

                    {/* House Number Column */}
                    <td className="py-3 px-4">
                      {editingAddressId === address.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={houseNumber}
                            onChange={(e) => setHouseNumber(e.target.value)}
                            placeholder="e.g., 42-A"
                            className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAssignHouseNumber(address.id);
                              if (e.key === 'Escape') {
                                setEditingAddressId(null);
                                setHouseNumber('');
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAssignHouseNumber(address.id)}
                            isLoading={assignMutation.isPending}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </Button>
                          <button
                            onClick={() => {
                              setEditingAddressId(null);
                              setHouseNumber('');
                            }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {address.houseNumber ? (
                            <span className="inline-flex items-center px-2.5 py-1 bg-green-50 text-green-700 text-sm font-medium rounded-md">
                              {address.houseNumber}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 italic">Not assigned</span>
                          )}
                          <button
                            onClick={() => {
                              setEditingAddressId(address.id);
                              setHouseNumber(address.houseNumber || '');
                            }}
                            className="text-gray-400 hover:text-primary-600 transition-colors"
                            title="Edit house number"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Type Column */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                          address.addressType === 'home'
                            ? 'bg-blue-50 text-blue-700'
                            : address.addressType === 'work'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {address.addressType || 'other'}
                      </span>
                      {address.isDefault && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700 ml-1">
                          default
                        </span>
                      )}
                    </td>

                    {/* Created Date */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(address.createdAt)}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteAddress(address.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                        title="Delete address"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary footer */}
        {filteredAddresses.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>
              Showing {filteredAddresses.length} address{filteredAddresses.length !== 1 ? 'es' : ''}
            </span>
            <span>
              {filteredAddresses.filter((a) => a.houseNumber).length} with house numbers assigned
            </span>
          </div>
        )}
      </Card>
    </Layout>
  );
};

export default Addresses;
