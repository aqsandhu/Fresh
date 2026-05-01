import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit,
  Trash2,
  FolderOpen,
  Image as ImageIcon,
  Upload,
  X,
  ArrowRight,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { SafeImage } from '@/components/ui/SafeImage';
import { categoryService } from '@/services/category.service';
import type { Category, CreateCategoryData } from '@/types';
import { isRequired, isNonNegativeNumber } from '@/utils/validators';
import { resolveImageUrl } from '@/utils/formatters';
import toast from 'react-hot-toast';

interface FormErrors {
  [key: string]: string;
}

export const Categories: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Click handler for the card. The Edit / Delete buttons stop propagation,
  // so clicking elsewhere on the card jumps into the Products page filtered
  // to this category — same product CRUD as /admin/products, just scoped.
  const goToCategoryProducts = (categoryId: string) => {
    navigate(`/admin/products?category=${categoryId}`);
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateCategoryData>({
    nameEn: '',
    nameUr: '',
    icon: '',
    isActive: true,
    displayOrder: 0,
  });

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryService.getCategories(),
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => categoryService.createCategoryWithImage(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category created successfully');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create category');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormData }) =>
      categoryService.updateCategoryWithImage(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category updated successfully');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update category');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: categoryService.deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete category');
    },
  });

  const openAddModal = () => {
    setEditingCategory(null);
    setSelectedImage(null);
    setImagePreview(null);
    setFormErrors({});
    setFormData({
      nameEn: '',
      nameUr: '',
      icon: '',
      isActive: true,
      displayOrder: 0,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setSelectedImage(null);
    setFormErrors({});
    setFormData({
      nameEn: category.nameEn,
      nameUr: category.nameUr,
      icon: category.icon || '',
      isActive: category.isActive,
      displayOrder: category.displayOrder,
    });
    // Set image preview if category has an image
    setImagePreview(category.imageUrl ? resolveImageUrl(category.imageUrl) : null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setSelectedImage(null);
    setImagePreview(null);
    setFormErrors({});
  };

  // Image handling
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image is too large. Max size is 5MB');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please use JPG, PNG or WebP');
      return;
    }

    setSelectedImage(file);
    
    // Generate preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  // Form Validation
  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    // Category Name (English) - Required
    if (!isRequired(formData.nameEn)) {
      errors.nameEn = 'Category name (English) is required';
    } else if (formData.nameEn.length < 2) {
      errors.nameEn = 'Category name must be at least 2 characters';
    } else if (formData.nameEn.length > 100) {
      errors.nameEn = 'Category name must not exceed 100 characters';
    }

    // Category Name (Urdu) - Required
    if (!isRequired(formData.nameUr)) {
      errors.nameUr = 'Category name (Urdu) is required';
    } else if (formData.nameUr.length < 2) {
      errors.nameUr = 'Category name must be at least 2 characters';
    }

    // Display Order - Must be non-negative
    if (!isNonNegativeNumber(formData.displayOrder ?? 0)) {
      errors.displayOrder = 'Display order must be 0 or greater';
    }

    // Icon - Optional but validate length if provided
    if (formData.icon && formData.icon.length > 50) {
      errors.icon = 'Icon must not exceed 50 characters';
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

    // Create FormData for file upload
    const submitData = new FormData();
    submitData.append('nameEn', formData.nameEn);
    submitData.append('nameUr', formData.nameUr);
    if (formData.icon) submitData.append('icon', formData.icon);
    submitData.append('isActive', String(formData.isActive ?? true));
    submitData.append('displayOrder', String(formData.displayOrder ?? 0));
    
    if (selectedImage) {
      submitData.append('image', selectedImage);
    }

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this category?')) {
      deleteMutation.mutate(id);
    }
  };

  const getCategoryImageUrl = (category: Category): string | null => {
    return category.imageUrl ? resolveImageUrl(category.imageUrl) : null;
  };

  return (
    <Layout title="Categories" subtitle="Manage product categories">
      {/* Actions */}
      <div className="flex justify-end mb-6">
        <Button onClick={openAddModal} leftIcon={<Plus className="w-5 h-5" />}>
          Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-lg p-4">
              <div className="h-20 bg-gray-200 rounded-lg mb-4" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : !categories || categories.length === 0 ? (
        <Card className="text-center py-12">
          <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No categories found</h3>
          <p className="text-gray-500 mb-4">Get started by adding your first category</p>
          <Button onClick={openAddModal} leftIcon={<Plus className="w-5 h-5" />}>
            Add Category
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category) => (
            <Card
              key={category.id}
              className="relative cursor-pointer group hover:shadow-md transition-shadow"
              onClick={() => goToCategoryProducts(category.id)}
            >
              <div className="flex items-start space-x-4">
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <SafeImage
                    src={getCategoryImageUrl(category)}
                    alt={category.nameEn}
                    className="w-full h-full object-cover rounded-lg"
                    fallback={
                      category.icon ? (
                        <span className="text-2xl">{category.icon}</span>
                      ) : (
                        <ImageIcon className="w-8 h-8 text-gray-300" />
                      )
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-gray-900">{category.nameEn}</h3>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                  </div>
                  <p className="text-sm text-gray-500" dir="rtl">{category.nameUr}</p>
                  <div className="flex items-center mt-2 space-x-2">
                    <Badge variant={category.isActive ? 'success' : 'default'} size="sm">
                      {category.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {category.productCount !== undefined && (
                      <span className="text-xs text-gray-500">
                        {category.productCount} products
                      </span>
                    )}
                  </div>
                  {/* Actions — stopPropagation so the card-level click handler
                      doesn't navigate when the user actually wanted to edit. */}
                  <div className="flex items-center mt-3 space-x-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(category); }}
                      className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(category.id); }}
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
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingCategory ? 'Edit Category' : 'Add Category'}
        footer={
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </div>
        }
      >
        <form className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Category Name (English)"
              value={formData.nameEn}
              onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
              error={formErrors.nameEn}
              required
            />
            <Input
              label="Category Name (Urdu)"
              value={formData.nameUr}
              onChange={(e) => setFormData({ ...formData, nameUr: e.target.value })}
              error={formErrors.nameUr}
              dir="rtl"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Icon (emoji or icon name)"
              value={formData.icon || ''}
              onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
              error={formErrors.icon}
              placeholder="🥬"
            />
            <Input
              label="Display Order"
              type="number"
              value={formData.displayOrder?.toString() || '0'}
              onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
              error={formErrors.displayOrder}
              min={0}
              helperText="Lower numbers appear first"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category Image
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              {imagePreview ? (
                <div className="relative mb-4">
                  <img
                    src={imagePreview}
                    alt="Category preview"
                    className="w-full h-40 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center cursor-pointer py-8 hover:bg-gray-50 rounded-lg transition-colors">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600">Click to upload image</span>
                  <span className="text-xs text-gray-400 mt-1">JPG, PNG or WebP (max 5MB)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive ?? true}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-primary-600 rounded"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};
