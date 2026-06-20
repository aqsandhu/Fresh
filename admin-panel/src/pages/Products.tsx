import React, { useState, useEffect } from 'react';
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
  Upload,
  X,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { SafeImage } from '@/components/ui/SafeImage';
import { Badge } from '@/components/ui/Badge';
import TagInput from '@/components/ui/TagInput';
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

/** Default Urdu popup shown when a customer adds a variable-weight product. */
const DEFAULT_VARIABLE_WEIGHT_NOTE =
  'آرڈر پیک کرتے ہوئے اس پروڈکٹ کا وزن آپ کے آرڈر سے کم یا زیادہ ہو سکتا ہے۔ ایسی صورت میں آپ کا آرڈر اور اس کی رقم آپ کے اصل وزن کے مطابق تبدیل ہو جائے گی۔';

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

// Catalog v2 — default per-quality channel flags + explicit fraction prices.
const CATALOG_V2_DEFAULTS: Partial<CreateProductData> = {
  consumerEnabledA: true, consumerEnabledB: true, consumerEnabledC: true,
  restaurantEnabledA: false, restaurantEnabledB: false, restaurantEnabledC: false,
  halfKgPriceB: null, quarterKgPriceB: null, halfDozenPriceB: null,
  halfKgPriceC: null, quarterKgPriceC: null, halfDozenPriceC: null,
  restaurantHalfKgPriceA: null, restaurantQuarterKgPriceA: null, restaurantHalfDozenPriceA: null,
  restaurantHalfKgPriceB: null, restaurantQuarterKgPriceB: null, restaurantHalfDozenPriceB: null,
  restaurantHalfKgPriceC: null, restaurantQuarterKgPriceC: null, restaurantHalfDozenPriceC: null,
};

// Per-quality field-name map so one <QualityPriceBlock> serves A/B/C.
type QKeys = {
  base: keyof CreateProductData; half: keyof CreateProductData; quarter: keyof CreateProductData;
  halfDozen: keyof CreateProductData; stock: keyof CreateProductData;
  consumer: keyof CreateProductData; restEnabled: keyof CreateProductData;
  restBase: keyof CreateProductData; restHalf: keyof CreateProductData;
  restQuarter: keyof CreateProductData; restHalfDozen: keyof CreateProductData;
};
const QUALITY_FIELDS: Record<'A' | 'B' | 'C', QKeys> = {
  A: { base: 'price', half: 'halfKgPrice', quarter: 'quarterKgPrice', halfDozen: 'halfDozenPrice', stock: 'stockQuantity', consumer: 'consumerEnabledA', restEnabled: 'restaurantEnabledA', restBase: 'restaurantPriceA', restHalf: 'restaurantHalfKgPriceA', restQuarter: 'restaurantQuarterKgPriceA', restHalfDozen: 'restaurantHalfDozenPriceA' },
  B: { base: 'priceB', half: 'halfKgPriceB', quarter: 'quarterKgPriceB', halfDozen: 'halfDozenPriceB', stock: 'stockQuantityB', consumer: 'consumerEnabledB', restEnabled: 'restaurantEnabledB', restBase: 'restaurantPriceB', restHalf: 'restaurantHalfKgPriceB', restQuarter: 'restaurantQuarterKgPriceB', restHalfDozen: 'restaurantHalfDozenPriceB' },
  C: { base: 'priceC', half: 'halfKgPriceC', quarter: 'quarterKgPriceC', halfDozen: 'halfDozenPriceC', stock: 'stockQuantityC', consumer: 'consumerEnabledC', restEnabled: 'restaurantEnabledC', restBase: 'restaurantPriceC', restHalf: 'restaurantHalfKgPriceC', restQuarter: 'restaurantQuarterKgPriceC', restHalfDozen: 'restaurantHalfDozenPriceC' },
};

const QUALITY_TONE: Record<'A' | 'B' | 'C', string> = {
  A: 'border-emerald-200 bg-emerald-50/40',
  B: 'border-blue-200 bg-blue-50/40',
  C: 'border-amber-200 bg-amber-50/40',
};

/**
 * One product quality tier (A/B/C). A is always shown; B/C open via the
 * "Offer this quality" checkbox. Each tier carries its own consumer price +
 * ½/¼ (or ½ dozen) overrides + single stock, a consumer allow toggle, and a
 * restaurant allow toggle that reveals the tier's restaurant prices. Stock is
 * shared between consumer + restaurant (one bucket per quality).
 */
const QualityPriceBlock: React.FC<{
  quality: 'A' | 'B' | 'C';
  fd: CreateProductData;
  setFd: React.Dispatch<React.SetStateAction<CreateProductData>>;
  restaurantAllowed: boolean;
  priceError?: string;
}> = ({ quality, fd, setFd, restaurantAllowed, priceError }) => {
  const f = QUALITY_FIELDS[quality];
  const isKg = fd.unitType === 'kg' || fd.unitType === 'gram';
  const isDozen = fd.unitType === 'dozen';
  const set = (key: keyof CreateProductData, val: any) => setFd((prev) => ({ ...prev, [key]: val }));
  const numVal = (key: keyof CreateProductData) => { const v = fd[key] as any; return v == null ? '' : v; };
  const onNum = (key: keyof CreateProductData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(key, e.target.value === '' ? null : parseFloat(e.target.value));
  const baseNum = Number(fd[f.base]) || 0;

  // B/C open when they carry a base price; A is always open.
  const open = quality === 'A' || fd[f.base] != null;
  const toggleOffer = (on: boolean) => {
    if (on) { set(f.base, 0); }
    else {
      // Clear the whole tier so it is no longer offered anywhere.
      setFd((prev) => ({
        ...prev,
        [f.base]: null, [f.half]: null, [f.quarter]: null, [f.halfDozen]: null, [f.stock]: null,
        [f.restEnabled]: false, [f.restBase]: null, [f.restHalf]: null, [f.restQuarter]: null, [f.restHalfDozen]: null,
      }));
    }
  };

  const fractionInputs = (baseKey: keyof CreateProductData, halfKey: keyof CreateProductData, quarterKey: keyof CreateProductData, halfDozenKey: keyof CreateProductData) => {
    const bn = Number(fd[baseKey]) || 0;
    return (
      <>
        {isKg && fd.allowHalfKg !== false && (
          <Input label="½ kg (Rs.)" type="number" min={0} step={0.01} value={numVal(halfKey)} onChange={onNum(halfKey)}
            placeholder={`auto ${(bn * 0.5).toFixed(0)}`} helperText="Blank = 50%" />
        )}
        {isKg && fd.allowQuarterKg !== false && (
          <Input label="¼ kg (Rs.)" type="number" min={0} step={0.01} value={numVal(quarterKey)} onChange={onNum(quarterKey)}
            placeholder={`auto ${(bn * 0.25).toFixed(0)}`} helperText="Blank = 25%" />
        )}
        {isDozen && (
          <Input label="½ dozen (Rs.)" type="number" min={0} step={0.01} value={numVal(halfDozenKey)} onChange={onNum(halfDozenKey)}
            placeholder={`auto ${(bn * 0.5).toFixed(0)}`} helperText="Blank = 50%" />
        )}
      </>
    );
  };

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${QUALITY_TONE[quality]}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">Quality {quality}</h4>
        {quality !== 'A' && (
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={open} onChange={(e) => toggleOffer(e.target.checked)} className="w-4 h-4 rounded" />
            Offer Quality {quality}
          </label>
        )}
      </div>

      {open && (
        <>
          {/* Consumer */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={fd[f.consumer] !== false} onChange={(e) => set(f.consumer, e.target.checked)} className="w-4 h-4 rounded" />
              Allow for consumers
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input label={`Consumer price / ${fd.unitType} (Rs.)`} type="number" min={0} step={0.01}
                value={numVal(f.base)} onChange={onNum(f.base)} error={priceError}
                required={quality === 'A'} />
              {fractionInputs(f.base, f.half, f.quarter, f.halfDozen)}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quality {quality} stock</label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700">
                  {Number(fd[f.stock]) || 0} {fd.unitType}
                  <span className="ml-1 text-xs text-gray-400">(read-only · managed in Management)</span>
                </div>
              </div>
            </div>
            {(Number(fd[f.stock]) || 0) <= 0 && (
              <p className="text-xs text-red-600">No stock for Quality {quality} yet — add it via Management → Expenses (Stock purchase) before it can sell.</p>
            )}
            {baseNum > 0 && <p className="text-xs text-gray-400">A blank ½/¼ price auto-charges 50% / 25% of the per-unit price.</p>}
          </div>

          {/* Restaurant */}
          <div className="rounded-lg border border-amber-200 bg-white/60 p-3 space-y-2">
            <label className={`flex items-center gap-2 text-sm font-medium ${restaurantAllowed ? 'cursor-pointer text-gray-700' : 'cursor-not-allowed text-gray-400'} select-none`}>
              <input type="checkbox" disabled={!restaurantAllowed} checked={restaurantAllowed && fd[f.restEnabled] === true} onChange={(e) => set(f.restEnabled, e.target.checked)} className="w-4 h-4 rounded" />
              Allow for restaurants
            </label>
            {restaurantAllowed && fd[f.restEnabled] === true && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input label="Restaurant price (Rs.)" type="number" min={0} step={0.01}
                  value={numVal(f.restBase)} onChange={onNum(f.restBase)} helperText="Blank → consumer price" />
                {fractionInputs(f.restBase, f.restHalf, f.restQuarter, f.restHalfDozen)}
              </div>
            )}
            {!restaurantAllowed && <p className="text-xs text-gray-400">Enable “Category also for restaurants” first.</p>}
          </div>
        </>
      )}
    </div>
  );
};

export const Products: React.FC = () => {
  const queryClient = useQueryClient();
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
    isVariableWeight: false,
    variableWeightNote: '',
    allowHalfKg: true,
    allowQuarterKg: true,
    tags: [],
    priceB: null,
    priceC: null,
    stockQuantityB: null,
    stockQuantityC: null,
    availableForRestaurants: false,
    restaurantPriceA: null,
    restaurantPriceB: null,
    restaurantPriceC: null,
    ...CATALOG_V2_DEFAULTS,
  });

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

  // Only products inside a restaurant-enabled category can be offered to
  // restaurants. Look the flag up from the loaded categories by the form's pick.
  const selectedCategoryAllowsRestaurants =
    categories?.find((c) => c.id === formData.categoryId)?.availableForRestaurants ?? false;

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
    mutationFn: productService.hardDeleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete product');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: productService.deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deactivated (in order history — cannot permanently delete)');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to deactivate product');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: productService.toggleProductStatus,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(res.isActive ? 'Product activated' : 'Product deactivated');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update product');
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
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to move products');
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
      halfKgPrice: null,
      quarterKgPrice: null,
      halfDozenPrice: null,
      stockQuantity: 0,
      unitType: 'kg',
      categoryId: '',
      isActive: true,
      isFeatured: false,
      isVariableWeight: false,
      variableWeightNote: '',
      allowHalfKg: true,
      allowQuarterKg: true,
      tags: [],
      priceB: null,
      priceC: null,
      stockQuantityB: null,
      stockQuantityC: null,
      availableForRestaurants: false,
      restaurantPriceA: null,
      restaurantPriceB: null,
      restaurantPriceC: null,
      ...CATALOG_V2_DEFAULTS,
    });
    setIsModalOpen(true);
  };

  const openEditModal = async (product: Product) => {
    setEditingProduct(product);
    setSelectedImages([]);
    setFormErrors({});
    let tags: string[] = product.tags || [];
    let isVariableWeight = product.isVariableWeight ?? false;
    let variableWeightNote = product.variableWeightNote ?? '';
    // Default TRUE so legacy products (before migration 25) keep showing the
    // half/quarter options until an admin explicitly unchecks them.
    let allowHalfKg = product.allowHalfKg ?? true;
    let allowQuarterKg = product.allowQuarterKg ?? true;
    let detail: Product = product;
    try {
      detail = await productService.getProductById(product.id);
      tags = detail.tags || [];
      isVariableWeight = detail.isVariableWeight ?? false;
      variableWeightNote = detail.variableWeightNote ?? '';
      allowHalfKg = detail.allowHalfKg ?? true;
      allowQuarterKg = detail.allowQuarterKg ?? true;
    } catch {
      // Keep list tags if detail fetch fails
    }
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
      halfKgPrice: product.halfKgPrice ?? null,
      quarterKgPrice: product.quarterKgPrice ?? null,
      halfDozenPrice: product.halfDozenPrice ?? null,
      stockQuantity: product.stockQuantity,
      unitType: product.unitType,
      categoryId: product.categoryId,
      isActive: product.isActive,
      isFeatured: product.isFeatured,
      isVariableWeight,
      variableWeightNote,
      allowHalfKg,
      allowQuarterKg,
      tags,
      priceB: detail.priceB ?? null,
      priceC: detail.priceC ?? null,
      stockQuantityB: detail.stockQuantityB ?? null,
      stockQuantityC: detail.stockQuantityC ?? null,
      availableForRestaurants: detail.availableForRestaurants ?? false,
      restaurantPriceA: detail.restaurantPriceA ?? null,
      restaurantPriceB: detail.restaurantPriceB ?? null,
      restaurantPriceC: detail.restaurantPriceC ?? null,
      // Catalog v2 — per-quality channel flags + explicit fractions (default-safe).
      consumerEnabledA: detail.consumerEnabledA ?? true,
      consumerEnabledB: detail.consumerEnabledB ?? true,
      consumerEnabledC: detail.consumerEnabledC ?? true,
      restaurantEnabledA: detail.restaurantEnabledA ?? false,
      restaurantEnabledB: detail.restaurantEnabledB ?? false,
      restaurantEnabledC: detail.restaurantEnabledC ?? false,
      halfKgPriceB: detail.halfKgPriceB ?? null,
      quarterKgPriceB: detail.quarterKgPriceB ?? null,
      halfDozenPriceB: detail.halfDozenPriceB ?? null,
      halfKgPriceC: detail.halfKgPriceC ?? null,
      quarterKgPriceC: detail.quarterKgPriceC ?? null,
      halfDozenPriceC: detail.halfDozenPriceC ?? null,
      restaurantHalfKgPriceA: detail.restaurantHalfKgPriceA ?? null,
      restaurantQuarterKgPriceA: detail.restaurantQuarterKgPriceA ?? null,
      restaurantHalfDozenPriceA: detail.restaurantHalfDozenPriceA ?? null,
      restaurantHalfKgPriceB: detail.restaurantHalfKgPriceB ?? null,
      restaurantQuarterKgPriceB: detail.restaurantQuarterKgPriceB ?? null,
      restaurantHalfDozenPriceB: detail.restaurantHalfDozenPriceB ?? null,
      restaurantHalfKgPriceC: detail.restaurantHalfKgPriceC ?? null,
      restaurantQuarterKgPriceC: detail.restaurantQuarterKgPriceC ?? null,
      restaurantHalfDozenPriceC: detail.restaurantHalfDozenPriceC ?? null,
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

    // Quality A price — must be greater than 0.
    if (!isPositiveNumber(formData.price)) {
      errors.price = 'Price must be greater than 0';
    }
    // Quality B / C — if the tier is offered, its price must be greater than 0.
    if (formData.priceB != null && !isPositiveNumber(formData.priceB)) {
      errors.priceB = 'Quality B price must be greater than 0 (or remove the tier)';
    }
    if (formData.priceC != null && !isPositiveNumber(formData.priceC)) {
      errors.priceC = 'Quality C price must be greater than 0 (or remove the tier)';
    }

    // Compare At Price - If provided, must be non-negative and greater than price
    if (formData.compareAtPrice && formData.compareAtPrice > 0) {
      if (!isNonNegativeNumber(formData.compareAtPrice)) {
        errors.compareAtPrice = 'Compare at price must be non-negative';
      } else if (formData.compareAtPrice <= formData.price) {
        errors.compareAtPrice = 'Compare at price should be higher than regular price';
      }
    }
    // Stock is NOT set here — it is managed via Management → Expenses/Stock.

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

    // The legacy "available for restaurants" flag is now derived from the
    // per-quality restaurant toggles (and only when the category permits) — it
    // gates whether the product appears on the restaurant storefront at all.
    const anyRestaurantQuality =
      formData.restaurantEnabledA === true ||
      formData.restaurantEnabledB === true ||
      formData.restaurantEnabledC === true;
    const submitData: CreateProductData = {
      ...formData,
      availableForRestaurants: selectedCategoryAllowsRestaurants && anyRestaurantQuality,
      // If the category forbids restaurants, force all restaurant toggles off.
      ...(selectedCategoryAllowsRestaurants
        ? {}
        : { restaurantEnabledA: false, restaurantEnabledB: false, restaurantEnabledC: false }),
    };
    // Stock is NEVER added/updated from the product form — it only comes from
    // Management → Expenses (stock purchase) / Stock. Drop the stock fields so a
    // create starts at 0 and an update leaves existing stock untouched.
    delete (submitData as Partial<CreateProductData>).stockQuantity;
    delete (submitData as Partial<CreateProductData>).stockQuantityB;
    delete (submitData as Partial<CreateProductData>).stockQuantityC;
    if (selectedImages.length > 0) {
      submitData.images = selectedImages;
    }
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleDelete = (product: Product) => {
    const message =
      `Delete "${product.nameEn}"?\n\n` +
      'If this product was never ordered, it will be permanently removed.\n' +
      'Products in past orders can only be deactivated.';

    if (!confirm(message)) return;

    deleteMutation.mutate(product.id, {
      onError: (error: any) => {
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
      onSearch={setSearchQuery}
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
              placeholder="All Categories"
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
      ) : (productsData?.products || []).length === 0 ? (
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
                        title={product.isActive ? 'Deactivate (hide from store)' : 'Activate'}
                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        {product.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openEditModal(product)}
                        title="Edit"
                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        title="Delete product"
                        disabled={deleteMutation.isPending || deactivateMutation.isPending}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
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
        size="xl"
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
            value={formData.compareAtPrice}
            onChange={(e) => setFormData({ ...formData, compareAtPrice: parseFloat(e.target.value) })}
            error={formErrors.compareAtPrice}
            min={0}
            step={0.01}
            helperText="Strike-through price shown on the storefront"
          />


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
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Customer popup message (Urdu)
                </label>
                <textarea
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
