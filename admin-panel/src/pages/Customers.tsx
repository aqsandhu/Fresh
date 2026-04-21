import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, MapPin, X, Home, Briefcase, Building, Navigation, Image, Star } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { customerService } from '@/services/customer.service';
import { formatCurrency, resolveImageUrl } from '@/utils/formatters';
import type { Customer, Address } from '@/types';

export const Customers: React.FC = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => customerService.getCustomers({ page, limit: 20, search: search || undefined }),
  });

  const { data: addresses, isLoading: addressesLoading } = useQuery({
    queryKey: ['customer-addresses', selectedCustomer?.id],
    queryFn: () => customerService.getCustomerAddresses(selectedCustomer!.id),
    enabled: !!selectedCustomer,
  });

  const customers = data?.customers || [];
  const pagination = data?.pagination;

  const getAddressIcon = (type?: string) => {
    switch (type) {
      case 'home': return <Home className="w-4 h-4" />;
      case 'work':
      case 'office': return <Briefcase className="w-4 h-4" />;
      default: return <Building className="w-4 h-4" />;
    }
  };

  const columns = [
    {
      key: 'name',
      title: 'Customer',
      render: (c: Customer) => (
        <div>
          <p className="font-medium text-gray-900">{c.fullName || 'No Name'}</p>
          <p className="text-xs text-gray-500">{c.phone}</p>
        </div>
      ),
    },
    {
      key: 'email',
      title: 'Email',
      render: (c: Customer) => (
        <span className="text-sm text-gray-600">{c.email || '—'}</span>
      ),
    },
    {
      key: 'orders',
      title: 'Orders',
      render: (c: Customer) => (
        <span className="text-sm font-medium">{c.totalOrders}</span>
      ),
    },
    {
      key: 'spent',
      title: 'Total Spent',
      render: (c: Customer) => (
        <span className="text-sm font-medium">{formatCurrency(c.totalSpent)}</span>
      ),
    },
    {
      key: 'addresses',
      title: 'Addresses',
      render: (c: Customer) => (
        <button
          onClick={() => setSelectedCustomer(c)}
          className="text-sm font-medium text-primary-600 hover:text-primary-800 hover:underline"
          title="View addresses"
        >
          {c.totalAddresses} <MapPin className="inline w-3.5 h-3.5 ml-0.5" />
        </button>
      ),
    },
    {
      key: 'status',
      title: 'Status',
      render: (c: Customer) => (
        <Badge variant={c.status === 'active' ? 'success' : 'error'} size="sm">
          {c.status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'joined',
      title: 'Joined',
      render: (c: Customer) => (
        <span className="text-sm text-gray-500">
          {new Date(c.createdAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      ),
    },
  ];

  return (
    <Layout title="Customers" subtitle="View registered customers">
      <Card>
        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, phone, email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {customers.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No customers found</h3>
            <p className="text-gray-500">Customers will appear here after they register</p>
          </div>
        ) : (
          <>
            <Table
              columns={columns}
              data={customers}
              keyExtractor={(c) => c.id}
              isLoading={isLoading}
              emptyMessage="No customers found"
            />
            {pagination && pagination.totalPages > 1 && (
              <div className="p-4 border-t flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Showing {customers.length} of {pagination.total} customers
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm">
                    Page {page} of {pagination.totalPages}
                  </span>
                  <button
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Addresses Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCustomer(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedCustomer.fullName || 'No Name'}'s Addresses
                </h2>
                <p className="text-sm text-gray-500">{selectedCustomer.phone}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto p-5 space-y-4 flex-1">
              {addressesLoading ? (
                <div className="text-center py-8 text-gray-500">Loading addresses...</div>
              ) : !addresses || addresses.length === 0 ? (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No addresses found</p>
                </div>
              ) : (
                addresses.map((addr: Address) => (
                  <div key={addr.id} className="border rounded-lg p-4 space-y-3 hover:border-primary-300 transition-colors">
                    {/* Top row: type badge, default badge, location badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                        {getAddressIcon(addr.addressType)}
                        {addr.addressType || 'other'}
                      </span>
                      {addr.isDefault && (
                        <Badge variant="success" size="sm">
                          <Star className="w-3 h-3 mr-1 inline" /> Default
                        </Badge>
                      )}
                      {addr.hasLocation ? (
                        <Badge variant="info" size="sm">
                          <Navigation className="w-3 h-3 mr-1 inline" /> Location Added
                          {addr.locationAddedBy ? ` (by ${addr.locationAddedBy})` : ''}
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="sm">No Location</Badge>
                      )}
                      {addr.zoneName && (
                        <Badge variant="default" size="sm">Zone: {addr.zoneName}</Badge>
                      )}
                    </div>

                    {/* Address details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {addr.houseNumber && (
                        <div><span className="text-gray-500">House #:</span> <span className="text-gray-900">{addr.houseNumber}</span></div>
                      )}
                      <div><span className="text-gray-500">Address:</span> <span className="text-gray-900">{addr.writtenAddress}</span></div>
                      <div><span className="text-gray-500">Area:</span> <span className="text-gray-900">{addr.areaName}</span></div>
                      <div><span className="text-gray-500">City:</span> <span className="text-gray-900">{addr.city}{addr.province ? `, ${addr.province}` : ''}</span></div>
                      {addr.landmark && (
                        <div><span className="text-gray-500">Landmark:</span> <span className="text-gray-900">{addr.landmark}</span></div>
                      )}
                      {addr.deliveryInstructions && (
                        <div className="sm:col-span-2"><span className="text-gray-500">Instructions:</span> <span className="text-gray-900">{addr.deliveryInstructions}</span></div>
                      )}
                    </div>

                    {/* Location coordinates */}
                    {addr.hasLocation && addr.latitude && addr.longitude && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-green-600" />
                        <a
                          href={`https://www.google.com/maps?q=${addr.latitude},${addr.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          {Number(addr.latitude).toFixed(6)}, {Number(addr.longitude).toFixed(6)}
                        </a>
                      </div>
                    )}

                    {/* Door picture */}
                    {addr.doorPictureUrl && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <Image className="w-3.5 h-3.5" /> Door Picture
                        </p>
                        <a href={resolveImageUrl(addr.doorPictureUrl)} target="_blank" rel="noopener noreferrer">
                          <img
                            src={resolveImageUrl(addr.doorPictureUrl)}
                            alt="Door"
                            className="w-32 h-24 object-cover rounded-lg border hover:opacity-80 transition-opacity cursor-pointer"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </a>
                      </div>
                    )}

                    {/* Timestamp */}
                    <p className="text-xs text-gray-400">
                      Added: {new Date(addr.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
