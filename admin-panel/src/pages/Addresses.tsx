import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin,
  CheckCircle,
  Search,
  Home,
  User,
  Phone,
  Calendar,
  Trash2,
  Edit3,
  ChevronDown,
  X,
  Loader2,
  Filter,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { addressService } from '@/services/address.service';
import { customerService } from '@/services/customer.service';
import { useAuthContext } from '@/context/AuthContext';
import { resolveImageUrl } from '@/utils/formatters';
import type { Address, Customer } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import toast from 'react-hot-toast';

const CUSTOMER_PICKER_SIZE = 50;
const ADDRESS_PAGE_SIZE = 100;

export const Addresses: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const isSuperAdmin = user?.role === 'super_admin';
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [addressSearch, setAddressSearch] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Both lists are searched ON THE SERVER. They used to load "500" customers
  // (the API gives at most 100) and the first 100 addresses, then filter those
  // in the browser — customer or address number 101 could not be found at all.
  const debouncedCustomerSearch = useDebounce(searchQuery.trim(), 300);
  const debouncedAddressSearch = useDebounce(addressSearch.trim(), 300);
  const [addressPages, setAddressPages] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const {
    data: customersData,
    isLoading: customersLoading,
  } = useQuery({
    queryKey: ['customers', 'dropdown', debouncedCustomerSearch],
    queryFn: () => customerService.getCustomers({ limit: CUSTOMER_PICKER_SIZE, search: debouncedCustomerSearch || undefined }),
    staleTime: 60 * 1000,
  });

  // Stable [] fallbacks (useMemo) so downstream useMemo deps don't see a new
  // array identity on every render while the queries are loading.
  const filteredCustomers = useMemo(() => customersData?.customers || [], [customersData?.customers]);
  const customersTotal = customersData?.pagination?.total ?? filteredCustomers.length;

  // Addresses: one customer's (all of them), or every address — server search,
  // ADDRESS_PAGE_SIZE at a time with "Show more".
  const {
    data: addressesData,
    isLoading: addressesLoading,
    isFetching: addressesFetching,
  } = useQuery({
    queryKey: ['addresses', selectedCustomerId, debouncedAddressSearch, addressPages],
    queryFn: async (): Promise<{ addresses: Address[]; total: number }> => {
      if (selectedCustomerId) {
        const list = await customerService.getCustomerAddresses(selectedCustomerId);
        return { addresses: list, total: list.length };
      }
      const pages = await Promise.all(
        Array.from({ length: addressPages }, (_, i) =>
          addressService.getAddresses({ page: i + 1, limit: ADDRESS_PAGE_SIZE, search: debouncedAddressSearch || undefined })
        )
      );
      return { addresses: pages.flatMap((p) => p.addresses), total: pages[0]?.pagination?.total ?? 0 };
    },
    placeholderData: (previous) => previous,
  });

  const addresses: Address[] = useMemo(() => addressesData?.addresses || [], [addressesData]);
  const addressesTotal = addressesData?.total ?? 0;

  // A customer's own addresses are few and all loaded — the search box filters
  // them here; for "all addresses" the server already searched.
  const filteredAddresses = useMemo(() => {
    if (!selectedCustomerId || !addressSearch.trim()) return addresses;
    const q = addressSearch.toLowerCase();
    return addresses.filter(
      (a) =>
        a.writtenAddress?.toLowerCase().includes(q) ||
        a.areaName?.toLowerCase().includes(q) ||
        a.city?.toLowerCase().includes(q) ||
        a.houseNumber?.toLowerCase().includes(q) ||
        a.landmark?.toLowerCase().includes(q)
    );
  }, [addresses, addressSearch, selectedCustomerId]);

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

  // Delete address mutation (super admin only)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => addressService.deleteAddress(id),
    onSuccess: () => {
      toast.success('Address deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to delete address');
    },
  });

  const clearDoorPictureMutation = useMutation({
    mutationFn: (id: string) => addressService.clearDoorPicture(id),
    onSuccess: () => {
      toast.success('Door picture removed');
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove door picture'),
  });

  const clearLocationMutation = useMutation({
    mutationFn: (id: string) => addressService.clearLocation(id),
    onSuccess: () => {
      toast.success('Location removed');
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove location'),
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
            <span id="addresses-customer-label" className="block text-sm font-medium text-gray-700 mb-2">
              <User className="w-4 h-4 inline mr-1" />
              Select Customer
            </span>
            <div className="relative">
              {/* A real button (was a clickable div): reachable with Tab, opens with Enter/Space. */}
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={showCustomerDropdown}
                aria-labelledby="addresses-customer-label"
                onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                onKeyDown={(e) => { if (e.key === 'Escape') setShowCustomerDropdown(false); }}
                className="flex items-center w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:border-primary-400 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
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
              </button>

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
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none flex items-center"
                      onClick={() => {
                        setSelectedCustomerId('');
                        setSelectedCustomer(null);
                        setShowCustomerDropdown(false);
                        setSearchQuery('');
                      }}
                    >
                      <span className="text-sm text-gray-600">All Customers</span>
                    </button>
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
                      <>
                      {customersTotal > filteredCustomers.length && (
                        <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50">
                          Showing {filteredCustomers.length} of {customersTotal} — type a name or phone to find others
                        </div>
                      )}
                      {filteredCustomers.map((customer) => (
                        <button
                          type="button"
                          key={customer.id}
                          aria-pressed={selectedCustomerId === customer.id}
                          className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none flex items-center ${
                            selectedCustomerId === customer.id ? 'bg-primary-50' : ''
                          }`}
                          onClick={() => {
                            setSelectedCustomerId(customer.id);
                            setSelectedCustomer(customer);
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
                        </button>
                      ))}
                      </>
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
            <label htmlFor="addresses-search" className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-1" />
              Search Addresses
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="addresses-search"
                type="text"
                placeholder="Search by area, city, house number..."
                value={addressSearch}
                onChange={(e) => { setAddressSearch(e.target.value); setAddressPages(1); }}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {addressSearch && (
                <button
                  onClick={() => { setAddressSearch(''); setAddressPages(1); }}
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
                    GPS / Map
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Door Picture
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
                  {isSuperAdmin && (
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
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
                          <p className="text-xs text-gray-500 mt-1">
                            {[address.areaName, address.city, address.province].filter(Boolean).join(', ')}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* GPS / Map */}
                    <td className="py-3 px-4">
                      {(address.hasLocation || (address.latitude && address.longitude)) ? (
                        <div className="space-y-1">
                          <a
                            href={`https://www.google.com/maps?q=${address.latitude},${address.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-green-600 hover:underline"
                          >
                            <MapPin className="w-3 h-3" /> View on Map
                          </a>
                          <div className="text-xs text-gray-400">
                            {address.latitude?.toFixed(5)}, {address.longitude?.toFixed(5)}
                          </div>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Remove GPS location from this address?')) {
                                  clearLocationMutation.mutate(address.id);
                                }
                              }}
                              className="block text-xs text-red-600 hover:underline"
                            >
                              Remove location
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Not added</span>
                      )}
                    </td>

                    {/* Door Picture */}
                    <td className="py-3 px-4">
                      {address.doorPictureUrl ? (
                        <div className="space-y-1">
                          <a
                            href={resolveImageUrl(address.doorPictureUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={resolveImageUrl(address.doorPictureUrl)}
                              alt="Door"
                              className="w-16 h-12 object-cover rounded border"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </a>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Remove door picture from this address?')) {
                                  clearDoorPictureMutation.mutate(address.id);
                                }
                              }}
                              className="block text-xs text-red-600 hover:underline"
                            >
                              Remove picture
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Not added</span>
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
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleDeleteAddress(address.id)}
                          className="text-gray-400 hover:text-red-600 transition-colors p-1"
                          title="Delete address"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
            <span className="flex items-center gap-3">
              Showing {filteredAddresses.length}
              {!selectedCustomerId && addressesTotal > filteredAddresses.length ? ` of ${addressesTotal}` : ''} address
              {(selectedCustomerId ? filteredAddresses.length : addressesTotal) !== 1 ? 'es' : ''}
              {!selectedCustomerId && addressesTotal > filteredAddresses.length && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={addressesFetching}
                  onClick={() => setAddressPages((n) => n + 1)}
                >
                  {addressesFetching ? 'Loading…' : `Show ${Math.min(ADDRESS_PAGE_SIZE, addressesTotal - filteredAddresses.length)} more`}
                </Button>
              )}
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
