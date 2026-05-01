import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit,
  Trash2,
  Package,
  Image as ImageIcon,
  AlertTriangle,
  Upload,
  X,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { productService } from '@/services/product.service';
import { categoryService } from '@/services/category.service';
import type { Product, CreateProductData } from '@/types';
import { formatCurrency, resolveImageUrl } from '@/utils/formatters';
import { isRequired, isPositiveNumber, isNonNegativeNumber } from '@/utils/validators';
import toast from 'react-hot-toast';

const getProductImageUrl = (product: Product): string | null => {
  const img = product.primaryImage || (product.images && product.images[0]);
  return img ? resolveImageUrl(img) : null;
};

const UNITS = [
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'gram', label: 'Gram' },
  { value: 'piece', label: 'Piece' },
  { value: 'dozen', label: 'Dozen' },
  { value: 'liter', label: 'Liter' },
  { value: 'ml', label: 'Milliliter (ml)' },
  { value: 'pack', label: 'Pack' },
];

interface FormErrors {
  [key: string]: string;
}

export const Products: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  // Pre-fill the category filter from the URL when arriving from
  // /admin/categories so clicking a category lands you on its products.
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const [formData, setFormData] = useState<CreateProductData>({
    nameEn: '',
    nameUr: '',
    descriptionEn: '',
    price: 0,
    compareAtPrice: 0,
    stockQuantity: 0,
    unitType: 'kg',
    categoryId: '',
    isActive: true,
    isFeatured: false,
  });

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', { search: searchQuery, category: categoryFilter, page }],
    queryFn: () =>
      productService.getProducts({
        search: searchQuery || undefined,
        categoryId: categoryFilter || undefined,
        page,
        limit: 12,
      }),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryService.getCategories(),
  });

  const createMutation = useMutation({
    mutationFn: productService.createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product created successfully');
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create product');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateProductData> }) =>
      productService.updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product updated successfully');
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update product');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: productService.deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete product');
    },
  });

  const openAddModal = () => {
    setEditingProduct(null);
    setSelectedImages([]);
    setImagePreviews([]);
    setFormErrors({});
    setFormData({
      nameEn: '',
      nameUr: '',
      descriptionEn: '',
      price: 0,
      compareAtPrice: 0,
      stockQuantity: 0,
      unitType: 'kg',
      categoryId: '',
      isActive: true,
      isFeatured: false,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setSelectedImages([]);
    setFormErrors({});
    // Show existing images as previews
    const imgUrl = getProductImageUrl(product);
    if (imgUrl) {
      const imgs = product.images && product.images.length > 0
        ? product.images.map(img => resolveImageUrl(img))
        : [imgUrl];
      setImagePreviews(imgs);
    } else {
      setImagePreviews([]);
    }
    setFormData({
      nameEn: product.nameEn,
      nameUr: product.nameUr || '',
      descriptionEn: product.descriptionEn || '',
      price: product.price,
      compareAtPrice: product.compareAtPrice || 0,
      stockQuantity: product.stockQuantity,
      unitType: product.unitType,
      categoryId: product.categoryId,
      isActive: product.isActive,
      isFeatured: product.isFeatured,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setSelectedImages([]);
    setImagePreviews([]);
    setFormErrors({});
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    // Validate file size (max 5MB each)
    const validFiles = files.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is too large. Max size is 5MB`);
        return false;
      }
      return true;
    });
    
    setSelectedImages(prev => [...prev, ...validFiles]);
    // Generate previews
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Form Validation
  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    // Product Name (English) - Required
    if (!isRequired(formData.nameEn)) {
      errors.nameEn = 'Product name (English) is required';
    } else if (formData.nameEn.length < 2) {
      errors.nameEn = 'Product name must be at least 2 characters';
    }

    // Product Name (Urdu) - Optional but validate if provided
    if (formData.nameUr && formData.nameUr.length < 2) {
      errors.nameUr = 'Product name must be at least 2 characters';
    }

    // Price - Must be positive
    if (!isPositiveNumber(formData.price)) {
      errors.price = 'Price must be greater than 0';
    }

    // Compare At Price - If provided, must be non-negative and greater than price
    if (formData.compareAtPrice && formData.compareAtPrice > 0) {
      if (!isNonNegativeNumber(formData.compareAtPrice)) {
        errors.compareAtPrice = 'Compare at price must be non-negative';
      } else if (formData.compareAtPrice <= formData.price) {
        errors.compareAtPrice = 'Compare at price should be higher than regular price';
      }
    }

    // Stock Quantity - Must be non-negative
    if (!isNonNegativeNumber(formData.stockQuantity)) {
      errors.stockQuantity = 'Stock quantity must be 0 or greater';
    }

    // Category - Required
    if (!isRequired(formData.categoryId)) {
      errors.categoryId = 'Please select a category';
    }

    // Unit Type - Required
    if (!isRequired(formData.unitType)) {
      errors.unitType = 'Please select a unit type';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    const submitData = { ...formData };
    if (selectedImages.length > 0) {
      submitData.images = selectedImages;
    }
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <Layout
      title="Products"
      subtitle="Manage your product catalog"
      searchPlaceholder="Search products..."
      onSearch={setSearchQuery}
    >
      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="w-48">
            <Select
              placeholder="All Categories"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: '', label: 'All Categories' },
                ...(categories?.map((c) => ({ value: c.id, label: c.nameEn })) || []),
              ]}
            />
          </div>
        </div>
        <Button onClick={openAddModal} leftIcon={<Plus className="w-5 h-5" />}>
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
      ) : (productsData?.products || productsData?.data || []).length === 0 ? (
        <Card className="text-center py-12">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500 mb-4">Get started by adding your first product</p>
          <Button onClick={openAddModal} leftIcon={<Plus className="w-5 h-5" />}>
            Add Product
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {(productsData?.products || productsData?.data || []).map((product) => (
              <Card key={product.id} className="relative group">
                {/* Product Image */}
                <div className="relative h-40 bg-gray-100 rounded-lg mb-4 overflow-hidden">
                  {getProductImageUrl(product) ? (
                    <img
                      src={getProductImageUrl(product)!}
                      alt={product.nameEn}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="w-12 h-12 text-gray-300" />
                    </div>
                  )}
                  {product.stockQuantity < 10 && (
                    <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full flex items-center">
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
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
        size="lg"
        footer={
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingProduct ? 'Update' : 'Create'}
            </Button>
          </div>
        }
      >
        <form className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Product Name (English)"
              value={formData.nameEn}
              onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
              error={formErrors.nameEn}
              required
            />
            <Input
              label="Product Name (Urdu)"
              value={formData.nameUr}
              onChange={(e) => setFormData({ ...formData, nameUr: e.target.value })}
              error={formErrors.nameUr}
              dir="rtl"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.descriptionEn}
              onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Price (Rs.)"
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
              error={formErrors.price}
              min={0.01}
              step={0.01}
              required
            />
            <Input
              label="Original Price (Optional)"
              type="number"
              value={formData.compareAtPrice}
              onChange={(e) =>
                setFormData({ ...formData, compareAtPrice: parseFloat(e.target.value) })
              }
              error={formErrors.compareAtPrice}
              min={0}
              step={0.01}
              helperText="For showing discount"
            />
            <Input
              label="Stock Quantity"
              type="number"
              value={formData.stockQuantity}
              onChange={(e) => setFormData({ ...formData, stockQuantity: parseInt(e.target.value) })}
              error={formErrors.stockQuantity}
              min={0}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.unitType}
                onChange={(e) => setFormData({ ...formData, unitType: e.target.value })}
                options={UNITS}
              />
              {formErrors.unitType && (
                <p className="mt-1 text-sm text-red-600">{formErrors.unitType}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                options={[
                  { value: '', label: 'Select Category' },
                  ...(categories?.map((c) => ({ value: c.id, label: c.nameEn })) || []),
                ]}
              />
              {formErrors.categoryId && (
                <p className="mt-1 text-sm text-red-600">{formErrors.categoryId}</p>
              )}
            </div>
          </div>

          <div className="flex space-x-6">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isFeatured}
                onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Featured</span>
            </label>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Product Images</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex flex-col items-center justify-center cursor-pointer py-4 hover:bg-gray-50 rounded-lg transition-colors">
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <span className="text-sm text-gray-600">Click to upload images</span>
                <span className="text-xs text-gray-400 mt-1">JPG, PNG or WebP (max 5MB each)</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};
