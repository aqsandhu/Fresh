// The admin "Add / Edit product" form (moved out of pages/Products.tsx, W21).
// It is mounted per opening (the page keys it), so every opening starts from
// the form it was given and nothing from a previous product is left over.
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import TagInput from '@/components/ui/TagInput';
import { productService } from '@/services/product.service';
import type { Category, CreateProductData, Product } from '@/types';
import { resolveImageUrl } from '@/utils/formatters';
import {
  DEFAULT_VARIABLE_WEIGHT_NOTE,
  UNITS,
  productSubmitData,
  validateProductForm,
  type FormErrors,
} from './productForm';
import { QualityPriceBlock } from './QualityPriceBlock';

export interface ProductFormSession {
  /** Changes on every opening — the page uses it as the React key. */
  key: number;
  /** null = adding a new product. */
  product: Product | null;
  formData: CreateProductData;
  existingImages: string[];
}

export const ProductFormModal: React.FC<{
  session: ProductFormSession;
  categories?: Category[];
  canCreateProduct: boolean;
  canUpdateProduct: boolean;
  onClose: () => void;
}> = ({ session, categories, canCreateProduct, canUpdateProduct, onClose }) => {
  const queryClient = useQueryClient();
  const editingProduct = session.product;
  // Images are tracked as two separate lists: images already stored on the
  // product (existingImages, RAW stored URLs in the same order as the backend
  // array so indexes match deleteProductImage and the values can be echoed
  // back as `existing_images` on submit — resolved only at render time) and
  // newly picked files (selectedImages) with their local previews
  // (imagePreviews).
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>(session.existingImages);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<CreateProductData>(session.formData);

  // Only products inside a restaurant-enabled category can be offered to
  // restaurants. Look the flag up from the loaded categories by the form's pick.
  const selectedCategoryAllowsRestaurants =
    categories?.find((c) => c.id === formData.categoryId)?.availableForRestaurants ?? false;

  const createMutation = useMutation({
    mutationFn: productService.createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product created successfully');
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateProductData> }) =>
      productService.updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product updated successfully');
      onClose();
    },
  });

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

  // Remove a newly picked (not yet uploaded) file.
  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Remove an image already stored on the product — deletes it on the backend
  // immediately, then drops it from local state so indexes stay aligned.
  const removeExistingImage = async (index: number) => {
    if (!editingProduct) return;
    try {
      await productService.deleteProductImage(editingProduct.id, index);
      setExistingImages(prev => prev.filter((_, i) => i !== index));
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Image removed');
    } catch {
      // The API interceptor already showed the error toast.
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validateProductForm(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Please fix the form errors');
      return;
    }

    const submitData = productSubmitData(formData, selectedCategoryAllowsRestaurants);
    if (selectedImages.length > 0) {
      submitData.images = selectedImages;
    }
    if (editingProduct) {
      // Contract C1: always send the stored image URLs to KEEP so the backend
      // merges kept + newly uploaded instead of legacy-replacing (which would
      // wipe existing images whenever no new file was picked).
      submitData.existingImages = existingImages;
      updateMutation.mutate({ id: editingProduct.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editingProduct ? 'Edit Product' : 'Add Product'}
      size="xl"
      footer={
        <div className="flex justify-end space-x-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createMutation.isPending || updateMutation.isPending}
            disabled={editingProduct ? !canUpdateProduct : !canCreateProduct}
            title={
              (editingProduct ? canUpdateProduct : canCreateProduct)
                ? undefined
                : `You do not have permission to ${editingProduct ? 'update' : 'create'} products`
            }
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
          <label htmlFor="products-f1" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea id="products-f1"
            value={formData.descriptionEn}
            onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            rows={3}
          />
        </div>

        <div className="rounded-xl border-2 border-primary-200 bg-primary-50/50 p-4 space-y-2">
          <p className="text-sm font-semibold text-primary-900">Search keywords</p>
          <p className="text-xs text-primary-700">
            Add words customers might search (e.g. tamatar, tomato, sabzi). Unlimited tags.
          </p>
          <TagInput
            label=""
            value={formData.tags || []}
            onChange={(tags) => setFormData({ ...formData, tags })}
            placeholder="Type keyword and press Enter"
            hint=""
          />
        </div>

        {/* Original (compare-at) price — for showing a discount on Quality A. */}
        <Input
          label="Original Price (Optional)"
          type="number"
          // Blank = no original price (0). parseFloat('') was NaN, which an
          // update sent as "NaN" and the server refused — the product could
          // not be saved after clearing the field.
          value={formData.compareAtPrice || ''}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            setFormData({ ...formData, compareAtPrice: Number.isFinite(n) ? n : 0 });
          }}
          error={formErrors.compareAtPrice}
          min={0}
          step={0.01}
          helperText="Strike-through price shown on the storefront"
        />


        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="products-f2" className="block text-sm font-medium text-gray-700 mb-1">
              Unit <span className="text-red-500">*</span>
            </label>
            <Select id="products-f2"
              value={formData.unitType}
              onChange={(e) => setFormData({ ...formData, unitType: e.target.value })}
              options={UNITS}
            />
            {formErrors.unitType && (
              <p className="mt-1 text-sm text-red-600">{formErrors.unitType}</p>
            )}
          </div>
          <div>
            <label htmlFor="products-f3" className="block text-sm font-medium text-gray-700 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <Select id="products-f3"
              value={formData.categoryId}
              onChange={(e) => {
                const categoryId = e.target.value;
                const allows =
                  categories?.find((c) => c.id === categoryId)?.availableForRestaurants ?? false;
                // A product can't stay "also for restaurants" if its new
                // category doesn't allow restaurants.
                setFormData({
                  ...formData,
                  categoryId,
                  availableForRestaurants: allows ? (formData.availableForRestaurants ?? false) : false,
                });
              }}
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

        {/* Sell-by-fraction toggles (product-level) — gate the ½/¼ price inputs
            inside each quality block below. */}
        {(formData.unitType === 'kg' || formData.unitType === 'gram') && (
          <div className="flex flex-wrap gap-6 rounded-lg border border-gray-200 p-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={formData.allowHalfKg}
                onChange={(e) => setFormData({ ...formData, allowHalfKg: e.target.checked })}
                className="w-4 h-4 rounded" />
              <span className="text-sm font-medium text-gray-700">Sell in Half kg (½)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={formData.allowQuarterKg}
                onChange={(e) => setFormData({ ...formData, allowQuarterKg: e.target.checked })}
                className="w-4 h-4 rounded" />
              <span className="text-sm font-medium text-gray-700">Sell in Quarter kg (¼)</span>
            </label>
          </div>
        )}

        {/* Per-quality pricing: each tier's consumer price + ½/¼ (or ½ dozen)
            + single shared stock, a consumer allow toggle, and (when the category
            permits) restaurant prices. Quality A always shown; B/C open on demand. */}
        <div className="space-y-3">
          {(['A', 'B', 'C'] as const).map((q) => (
            <QualityPriceBlock
              key={q}
              quality={q}
              fd={formData}
              setFd={setFormData}
              restaurantAllowed={selectedCategoryAllowsRestaurants}
              priceError={q === 'A' ? formErrors.price : q === 'B' ? formErrors.priceB : formErrors.priceC}
            />
          ))}
          {formErrors.optionalPrices && (
            <p role="alert" className="text-sm text-red-600">{formErrors.optionalPrices}</p>
          )}
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

        {/* Variable weight (per-product) */}
        <div className="rounded-lg border border-gray-200 p-3">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isVariableWeight === true}
              onChange={(e) => {
                const on = e.target.checked;
                setFormData((prev) => ({
                  ...prev,
                  isVariableWeight: on,
                  variableWeightNote:
                    on && !prev.variableWeightNote
                      ? DEFAULT_VARIABLE_WEIGHT_NOTE
                      : prev.variableWeightNote,
                }));
              }}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-gray-800">Variable weight</span>
          </label>
          <p className="mt-1 text-xs text-gray-500">
            For items like cauliflower or watermelon whose packed weight differs from the order.
            The admin re-weighs at packing and the amount auto-adjusts. The customer sees the
            note below as a popup when adding this product.
          </p>
          {formData.isVariableWeight && (
            <div className="mt-2">
              <label htmlFor="products-f4" className="block text-xs font-medium text-gray-600 mb-1">
                Customer popup message (Urdu)
              </label>
              <textarea id="products-f4"
                value={formData.variableWeightNote ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, variableWeightNote: e.target.value })
                }
                dir="rtl"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder={DEFAULT_VARIABLE_WEIGHT_NOTE}
              />
              <p className="mt-1 text-xs text-gray-400">Leave as-is to use the default message.</p>
            </div>
          )}
        </div>

        {/* Image Upload */}
        <div>
          <label htmlFor="products-images" className="block text-sm font-medium text-gray-700 mb-2">Product Images</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
            {(existingImages.length > 0 || imagePreviews.length > 0) && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                {existingImages.map((url, index) => (
                  <div key={`existing-${index}`} className="relative group">
                    <img
                      src={resolveImageUrl(url)}
                      alt={`Image ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      aria-label={`Remove image ${index + 1}`}
                      onClick={() => removeExistingImage(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {imagePreviews.map((preview, index) => (
                  <div key={`new-${index}`} className="relative group">
                    <img
                      src={preview}
                      alt={`New image ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg ring-2 ring-primary-300"
                    />
                    <button
                      type="button"
                      aria-label={`Remove new image ${index + 1}`}
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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
                id="products-images"
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
  );
};
