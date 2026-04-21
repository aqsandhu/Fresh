import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { dashboardService } from '@/services/dashboard.service';
import { formatCurrency, formatDate, formatOrderStatus, getOrderStatusColor } from '@/utils/formatters';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardService.getDashboardData,
  });

  const today = data?.today;
  const recentOrders = data?.recentOrders || [];
  const lowStockProducts = data?.lowStockProducts || [];

  return (
    <Layout title="Dashboard" subtitle="Welcome back! Here's what's happening today.">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Daily Sales"
          value={isLoading ? '-' : formatCurrency(today?.totalSales || 0)}
          subtitle="Today's revenue"
          icon={<TrendingUp className="w-6 h-6 text-primary-600" />}
        />
        <StatCard
          title="Total Orders"
          value={isLoading ? '-' : today?.totalOrders || 0}
          subtitle="Today's orders"
          icon={<ShoppingBag className="w-6 h-6 text-blue-600" />}
        />
        <StatCard
          title="Pending Orders"
          value={isLoading ? '-' : today?.pendingOrders || 0}
          subtitle="Awaiting action"
          icon={<Clock className="w-6 h-6 text-orange-600" />}
        />
        <StatCard
          title="Delivered"
          value={isLoading ? '-' : today?.deliveredOrders || 0}
          subtitle="Successfully delivered"
          icon={<CheckCircle className="w-6 h-6 text-green-600" />}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Weekly Summary</h3>
          <p className="text-2xl font-bold text-primary-600">{formatCurrency(data?.weekly?.totalSales || 0)}</p>
          <p className="text-sm text-gray-500">{data?.weekly?.totalOrders || 0} orders this week</p>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Monthly Summary</h3>
          <p className="text-2xl font-bold text-primary-600">{formatCurrency(data?.monthly?.totalSales || 0)}</p>
          <p className="text-sm text-gray-500">{data?.monthly?.totalOrders || 0} orders this month</p>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Riders</h3>
          <p className="text-2xl font-bold text-blue-600">{data?.riders?.totalRiders || 0}</p>
          <p className="text-sm text-gray-500">
            {data?.riders?.availableRiders || 0} available, {data?.riders?.busyRiders || 0} busy
          </p>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Recent Orders</h3>
              <p className="text-sm text-gray-500">Latest customer orders</p>
            </div>
            <Link to="/admin/orders">
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
                View All
              </Button>
            </Link>
          </div>
          <div className="space-y-3">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="ml-3 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/4 mt-2" />
                  </div>
                </div>
              ))
            ) : recentOrders.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No recent orders</p>
            ) : (
              recentOrders.slice(0, 5).map((order) => {
                const statusColor = getOrderStatusColor(order.status);
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">
                          {order.orderNumber}
                        </p>
                        <p className="text-xs text-gray-500">
                          {order.customerName} • {formatDate(order.placedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(order.totalAmount)}
                      </p>
                      <Badge
                        variant="default"
                        size="sm"
                        className={`${statusColor.bg} ${statusColor.text}`}
                      >
                        {formatOrderStatus(order.status)}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Low Stock Alerts</h3>
              <p className="text-sm text-gray-500">Products running low</p>
            </div>
            <Link to="/admin/products">
              <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
                View All
              </Button>
            </Link>
          </div>
          <div className="space-y-3">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                  <div className="ml-3 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/4 mt-2" />
                  </div>
                </div>
              ))
            ) : lowStockProducts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                <p className="text-gray-500">All products are well stocked!</p>
              </div>
            ) : (
              lowStockProducts.slice(0, 5).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100"
                >
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{product.nameEn}</p>
                      <p className="text-xs text-gray-500">{product.nameUr}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">
                      {product.stockQuantity} left
                    </p>
                    <p className="text-xs text-red-500">Low stock</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
};
