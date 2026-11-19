import { errorView } from '@/lib/caughtError';
import React, { useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  FolderInput,
  Package,
  Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { SafeImage } from '@/components/ui/SafeImage';
import { Badge } from '@/components/ui/Badge';
import { ProductFormModal, type ProductFormSession } from '@/components/products/ProductFormModal';
import { emptyProductForm, loadProductForm } from '@/components/products/productForm';
import { productService } from '@/services/product.service';
import { categoryService } from '@/services/category.service';
import type { Product } from '@/types';
import { formatCurrency, resolveImageUrl } from '@/utils/formatters';
import { useAuthContext } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import toast from 'react-hot-toast';

const getProductImageUrl = (product: Product): string | null => {
  const img = product.primaryImage || (product.images && product.images[0]);
  return img ? resolveImageUrl(img) : null;
};

export const Products: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  // Action-level gating (backend enforces the same codes — this is UX only).
  const canCreateProduct = hasPermission(user?.permissions, 'products.create');
  const canUpdateProduct = hasPermission(user?.permissions, 'products.update');
  const canDeleteProduct = hasPermission(user?.permissions, 'products.delete');
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  // Pre-fill the category filter from the URL when arriving from
  // /admin/categories so clicking a category lands you on its products.
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');

  // Keep the URL in sync with the filter selection so the back button works
  // and the URL is shareable.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (categoryFilter) {
      next.set('category', categoryFilter);
    } else {
      next.delete('category');
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [categoryFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const [page, setPage] = useState(1);
  // The add / edit form that is open (null = closed). A new key per opening
  // mounts a fresh form.
  const [formSession, setFormSession] = useState<ProductFormSession | null>(null);
  const formOpenings = useRef(0);

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', { search: searchQuery, category: categoryFilter, status: statusFilter, page }],
    queryFn: () =>
      productService.getProducts({
        search: searchQuery || undefined,
        categoryId: categoryFilter || undefined,
        isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
        page,
        limit: 12,
      }),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryService.getCategories(),
  });

  const deleteMutation = useMutation({
    mutationFn: productService.hardDeleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted successfully');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: productService.deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deactivated (in order history — cannot permanently delete)');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: productService.toggleProductStatus,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(res.isActive ? 'Product activated' : 'Product deactivated');
    },
  });

  const moveCategoryMutation = useMutation({
    mutationFn: ({ ids, categoryId }: { ids: string[]; categoryId: string }) =>
      productService.moveProductsToCategory(ids, categoryId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Moved ${res.moved} product(s)`);
      setMoveDialogOpen(false);
      setSelectedIds(new Set());
      setMoveTargetCategory('');
    },
  });

  // Selection + move-dialog state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetCategory, setMoveTargetCategory] = useState('');

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const openAddModal = () => {
    formOpenings.current += 1;
    setFormSession({ key: formOpenings.current, product: null, formData: emptyProductForm(), existingImages: [] });
  };

  const openEditModal = async (product: Product) => {
    const loaded = await loadProductForm(product);
    formOpenings.current += 1;
    setFormSession({ key: formOpenings.current, product, ...loaded });
  };

  const handleDelete = (product: Product) => {
    const message =
      `Delete "${product.nameEn}"?\n\n` +
      'If this product was never ordered, it will be permanently removed.\n' +
      'Products in past orders can only be deactivated.';

    if (!confirm(message)) return;

    deleteMutation.mutate(product.id, {
      onError: (errorCaught: unknown) => {

        const error = errorView(errorCaught);
        const msg = error?.message || '';
        if (msg.toLowerCase().includes('past orders')) {
          if (confirm(`${msg}\n\nDeactivate this product instead?`)) {
            deactivateMutation.mutate(product.id);
          }
        }
      },
    });
  };

  return (
    <Layout
      title="Products"
      subtitle="Manage your product catalog"
      searchPlaceholder="Search products..."
      onSearch={(q) => {
        setSearchQuery(q);
        setPage(1);
      }}
    >
      {/* Bulk-action bar — only renders when at least one product is selected.
          Lets the admin reassign category for many products in one click. */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 mb-4 bg-primary-50 border border-primary-200 rounded-lg px-4 py-2 flex items-center justify-between">
          <span className="text-sm font-medium text-primary-900">
            {selectedIds.size} product{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<FolderInput className="w-4 h-4" />}
              disabled={!canUpdateProduct}
              title={canUpdateProduct ? undefined : 'You do not have permission to update products'}
              onClick={() => {
                setMoveTargetCategory('');
                setMoveDialogOpen(true);
              }}
            >
              Move to Category
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="w-48">
            <Select
              aria-label="Category filter"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              options={[
                { value: '', label: 'All Categories' },
                ...(categories?.map((c) => ({ value: c.id, label: c.nameEn })) || []),
              ]}
            />
          </div>
          <div className="w-40">
            <Select
              aria-label="Status filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'active' | 'inactive' | 'all');
                setPage(1);
              }}
              options={[
                { value: 'active', label: 'Active only' },
                { value: 'inactive', label: 'Inactive only' },
                { value: 'all', label: 'All products' },
              ]}
            />
          </div>
        </div>
        <Button
          onClick={openAddModal}
          leftIcon={<Plus className="w-5 h-5" />}
          disabled={!canCreateProduct}
          title={canCreateProduct ? undefined : 'You do not have permission to create products'}
        >
          Add Product
        </Button>
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-lg p-4">
              <div className="h-40 bg-gray-200 rounded-lg mb-4" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (productsData?.products || []).length === 0 ? (
        <Card className="text-center py-12">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500 mb-4">Get started by adding your first product</p>
          <Button
            onClick={openAddModal}
            leftIcon={<Plus className="w-5 h-5" />}
            disabled={!canCreateProduct}
            title={canCreateProduct ? undefined : 'You do not have permission to create products'}
          >
            Add Product
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {(productsData?.products || []).map((product) => (
              <Card key={product.id} className="relative group">
                {/* Selection checkbox — appears on hover or when any row is
                    selected. Used by the "Move to Category" bulk action. */}
                <label
                  className={`absolute top-2 left-2 z-10 cursor-pointer flex items-center justify-center w-7 h-7 rounded-md bg-white/90 border border-gray-300 hover:bg-primary-50 transition-opacity ${
                    selectedIds.size > 0 || selectedIds.has(product.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${product.nameEn}`}
                    checked={selectedIds.has(product.id)}
                    onChange={() => toggleSelected(product.id)}
                    className="w-4 h-4 accent-primary-600"
                  />
                </label>

                {/* Product Image */}
                <div className="relative h-40 bg-gray-100 rounded-lg mb-4 overflow-hidden">
                  <SafeImage
                    src={getProductImageUrl(product)}
                    alt={product.nameEn}
                    className="w-full h-full object-cover"
                    fallback={
                      <div className="flex items-center justify-center h-full">
                        <ImageIcon className="w-12 h-12 text-gray-300" />
                      </div>
                    }
                  />
                  {product.stockQuantity < 10 && (
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full flex items-center">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Low Stock
                    </div>
                  )}
                  {!product.isActive && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                      <span className="text-white font-medium">Inactive</span>
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900 truncate">{product.nameEn}</h3>
                  {product.nameUr && (
                    <p className="text-sm text-gray-500 truncate" dir="rtl">
                      {product.nameUr}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">{product.categoryName}</p>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg font-bold text-gray-900">
                        {formatCurrency(product.price)}
                      </span>
                      {product.compareAtPrice && product.compareAtPrice > product.price && (
                        <span className="text-sm text-gray-400 line-through ml-2">
                          {formatCurrency(product.compareAtPrice)}
                        </span>
                      )}
                    </div>
                    <Badge variant={product.stockQuantity < 10 ? 'error' : 'success'} size="sm">
                      {product.stockQuantity} {product.unitType}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3 border-t">
                    <span
                      className={`text-sm font-medium ${
                        product.isActive ? 'text-green-600' : 'text-gray-500'
                      }`}
                    >
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <div className="flex space-x-1">
                      {/* Toggle visibility — flips is_active without losing
                          the row. Cheaper than full delete + re-create. */}
                      <button
                        onClick={() => toggleActiveMutation.mutate(product.id)}
                        title={!canUpdateProduct ? 'You do not have permission to update products' : product.isActive ? 'Deactivate (hide from store)' : 'Activate'}
                        disabled={!canUpdateProduct}
                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                      >
                        {product.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openEditModal(product)}
                        title={canUpdateProduct ? 'Edit' : 'You do not have permission to update products'}
                        disabled={!canUpdateProduct}
                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        title={canDeleteProduct ? 'Delete product' : 'You do not have permission to delete products'}
                        disabled={!canDeleteProduct || deleteMutation.isPending || deactivateMutation.isPending}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {productsData?.pagination && productsData.pagination.totalPages > 1 && (
            <div className="flex justify-center mt-8">
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="flex items-center px-4 text-sm text-gray-600">
                  Page {page} of {productsData.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(productsData.pagination.totalPages, p + 1))}
                  disabled={page === productsData.pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {formSession && (
        <ProductFormModal
          key={formSession.key}
          session={formSession}
          categories={categories}
          canCreateProduct={canCreateProduct}
          canUpdateProduct={canUpdateProduct}
          onClose={() => setFormSession(null)}
        />
      )}

      {/* Move-to-Category dialog. Triggered by the bulk-action bar; calls
          the new PATCH /admin/products/move-category endpoint with all
          selected ids in a single request. */}
      <Modal
        isOpen={moveDialogOpen}
        onClose={() => setMoveDialogOpen(false)}
        title="Move products to category"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Reassigning <strong>{selectedIds.size}</strong> product
            {selectedIds.size === 1 ? '' : 's'} to a different category.
          </p>
          <Select
            label="Target Category"
            value={moveTargetCategory}
            onChange={(e) => setMoveTargetCategory(e.target.value)}
            placeholder="Choose a category…"
            options={(categories || []).map((c) => ({
              value: c.id,
              label: c.nameEn + (c.isActive === false ? ' (inactive)' : ''),
            }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setMoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                moveCategoryMutation.mutate({
                  ids: Array.from(selectedIds),
                  categoryId: moveTargetCategory,
                })
              }
              disabled={!moveTargetCategory || moveCategoryMutation.isPending}
              isLoading={moveCategoryMutation.isPending}
              leftIcon={<FolderInput className="w-4 h-4" />}
            >
              Move {selectedIds.size}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};
