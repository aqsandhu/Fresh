import apiClient, { handleApiError } from './api';
import { ApiResponse, Category, StoreProduct, Banner, PaginatedResponse } from '@app-types';
import { API_BASE_URL } from '@utils/constants';
import { withCityParams, getCachedCityId } from '@/lib/apiHelpers';

function hasSelectedCity(): boolean {
  return !!getCachedCityId();
}

// ============================================================================
// DATA MAPPING: Backend snake_case → Customer App types
// ============================================================================

const BACKEND_URL = API_BASE_URL.replace('/api', '');

function resolveImageUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('data:')) return path;
  // Re-host any absolute URL pointing at a dev / LAN host onto the current API base.
  // Backend used to store absolute http://localhost:3000/... which is unreachable
  // from real devices. Relative paths come straight through.
  const absMatch = path.match(/^https?:\/\/([^/]+)(\/.*)?$/);
  if (absMatch) {
    const host = absMatch[1].split(':')[0];
    const rest = absMatch[2] || '';
    const isLocalOrLan = host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    if (isLocalOrLan) return `${BACKEND_URL}${rest}`;
    return path;
  }
  if (path.startsWith('//')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${normalizedPath}`;
}

// Category color palette for display
const CATEGORY_COLORS = ['#4CAF50', '#FF9800', '#8D6E63', '#F44336', '#FFC107', '#2196F3', '#9C27B0', '#00BCD4', '#E91E63', '#795548'];
const CATEGORY_ICONS: Record<string, string> = {
  sabzi: 'leaf', vegetable: 'leaf', vegetables: 'leaf',
  fruit: 'fruit-cherries', fruits: 'fruit-cherries',
  chicken: 'food-drumstick', meat: 'food-steak',
  'dry-fruit': 'seed', 'dry fruit': 'seed', dryfruits: 'seed',
  atta: 'grain', 'atta-chakki': 'grain', wheat: 'grain',
  dairy: 'cup', milk: 'cup',
  grocery: 'cart', spices: 'shaker-outline',
};

function getCategoryIcon(raw: any): string {
  const slug = (raw.slug || '').toLowerCase();
  const name = (raw.name_en || '').toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (slug.includes(key) || name.includes(key)) return icon;
  }
  return 'tag-outline';
}

function mapBackendCategory(raw: any, index: number): Category {
  return {
    id: raw.id,
    name: raw.name_en || raw.name || '',
    nameUrdu: raw.name_ur || '',
    icon: getCategoryIcon(raw),
    image: resolveImageUrl(raw.image_url || raw.icon_url),
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    productCount: parseInt(raw.product_count) || 0,
  };
}

function mapBackendProduct(raw: any): StoreProduct {
  const price = parseFloat(raw.price) || 0;
  const compareAt = parseFloat(raw.compare_at_price) || 0;
  const toOptionalPrice = (v: unknown): number | null | undefined => {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const primaryImage = resolveImageUrl(raw.primary_image);
  const images = raw.images && Array.isArray(raw.images) && raw.images.length > 0
    ? raw.images.map(resolveImageUrl)
    : (primaryImage ? [primaryImage] : []);
  const stockA = parseFloat(raw.stock_quantity ?? raw.stockQuantity) || 0;
  const priceB = toOptionalPrice(raw.price_b ?? raw.priceB);
  const priceC = toOptionalPrice(raw.price_c ?? raw.priceC);
  const stockB = parseFloat(raw.stock_quantity_b ?? raw.stockQuantityB) || 0;
  const stockC = parseFloat(raw.stock_quantity_c ?? raw.stockQuantityC) || 0;
  const consumerEnabledA = (raw.consumer_enabled_a ?? raw.consumerEnabledA) !== false;
  const consumerEnabledB = (raw.consumer_enabled_b ?? raw.consumerEnabledB) !== false;
  const consumerEnabledC = (raw.consumer_enabled_c ?? raw.consumerEnabledC) !== false;
  const hasStock =
    (consumerEnabledA && stockA > 0) ||
    (consumerEnabledB && priceB != null && stockB > 0) ||
    (consumerEnabledC && priceC != null && stockC > 0);

  return {
    id: raw.id,
    name: raw.name_en || raw.name || '',
    nameUrdu: raw.name_ur || '',
    description: raw.description_en || raw.short_description || '',
    price,
    originalPrice: compareAt > price ? compareAt : undefined,
    unit: raw.unit_type || 'kg',
    images,
    categoryId: raw.category_id || '',
    categoryName: raw.category_name || '',
    categorySlug: raw.category_slug || raw.categorySlug || '',
    stock: stockA,
    inStock: hasStock,
    isFresh: raw.is_fresh !== false && hasStock,
    rating: parseFloat(raw.rating_average) || 0,
    reviewCount:
      raw.review_count != null
        ? parseInt(raw.review_count) || 0
        : parseInt(raw.order_count) || 0,
    isFeatured: raw.is_featured || false,
    tags: raw.tags || [],
    halfKgPrice: toOptionalPrice(raw.half_kg_price ?? raw.halfKgPrice),
    quarterKgPrice: toOptionalPrice(raw.quarter_kg_price ?? raw.quarterKgPrice),
    halfDozenPrice: toOptionalPrice(raw.half_dozen_price ?? raw.halfDozenPrice),
    // Quality tiers (B/C optional). Each tier has its own consumer price + stock.
    priceB,
    priceC,
    stockQuantityB: stockB,
    stockQuantityC: stockC,
    allowHalfKg: (raw.allow_half_kg ?? raw.allowHalfKg) !== false,
    allowQuarterKg: (raw.allow_quarter_kg ?? raw.allowQuarterKg) !== false,
    qualifiesForFreeDelivery:
      (raw.qualifies_for_free_delivery ?? raw.qualifiesForFreeDelivery) === true,
    isVariableWeight: raw.is_variable_weight === true || raw.isVariableWeight === true,
    variableWeightNote: raw.variable_weight_note ?? raw.variableWeightNote ?? null,
  };
}

// ============================================================================
// SERVICE
// ============================================================================

interface GetProductsParams {
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
  featured?: boolean;
  sortBy?: string;
  sortOrder?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: string;
}

class ProductService {
  async getCategories(): Promise<ApiResponse<Category[]>> {
    if (!hasSelectedCity()) return { success: true, data: [] };
    try {
      const response = await apiClient.get('/categories', { params: withCityParams() });
      const raw = response.data;
      const items = (raw.data || []).map(mapBackendCategory);
      return { success: true, data: items };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getCategoryById(id: string): Promise<ApiResponse<Category>> {
    try {
      const response = await apiClient.get(`/categories/${id}`, { params: withCityParams() });
      const raw = response.data;
      return { success: true, data: mapBackendCategory(raw.data || raw, 0) };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getProducts(params: GetProductsParams = {}): Promise<ApiResponse<PaginatedResponse<StoreProduct>>> {
    if (!hasSelectedCity()) {
      return {
        success: true,
        data: { data: [], total: 0, page: 1, limit: 20, totalPages: 0 },
      };
    }
    try {
      const apiParams: any = { ...params };
      if (params.featured) {
        apiParams.featured = 'true';
      }
      const response = await apiClient.get('/products', { params: withCityParams(apiParams) });
      const raw = response.data;
      const items = (raw.data || []).map(mapBackendProduct);
      const meta = raw.meta || {};
      return {
        success: true,
        data: {
          data: items,
          total: meta.total || items.length,
          page: meta.page || 1,
          limit: meta.limit || 20,
          totalPages: meta.totalPages || 1,
        },
      };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getProductById(id: string): Promise<ApiResponse<StoreProduct>> {
    try {
      const response = await apiClient.get(`/products/${id}`, { params: withCityParams() });
      const raw = response.data;
      return { success: true, data: mapBackendProduct(raw.data || raw) };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getFeaturedProducts(limit = 500): Promise<ApiResponse<StoreProduct[]>> {
    if (!hasSelectedCity()) return { success: true, data: [] };
    try {
      const response = await apiClient.get('/products/featured/list', {
        params: withCityParams({ limit }),
      });
      const raw = response.data;
      const items = (raw.data || []).map(mapBackendProduct);
      return { success: true, data: items };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getProductsByCategory(
    categoryId: string,
    params: Omit<GetProductsParams, 'category'> = {}
  ): Promise<ApiResponse<StoreProduct[]>> {
    if (!hasSelectedCity()) return { success: true, data: [] };
    try {
      const response = await apiClient.get('/products', {
        params: withCityParams({ category: categoryId, ...params, limit: params.limit || 200 }),
      });
      const raw = response.data;
      const items = (raw.data || []).map(mapBackendProduct);
      return { success: true, data: items };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async searchProducts(query: string): Promise<ApiResponse<StoreProduct[]>> {
    if (!hasSelectedCity()) return { success: true, data: [] };
    try {
      const response = await apiClient.get('/products/search', { params: withCityParams({ q: query }) });
      const raw = response.data;
      const items = (raw.data || []).map(mapBackendProduct);
      return { success: true, data: items };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getWhatsAppOrderUrl(): Promise<ApiResponse<{ url: string }>> {
    try {
      const response = await apiClient.get('/site-settings/whatsapp-order', {
        params: withCityParams(),
      });
      const raw = response.data?.data || response.data || {};
      const url = String(raw.whatsapp_order_url || raw.whatsappOrderUrl || '').trim();
      return { success: true, data: { url } };
    } catch {
      return { success: true, data: { url: '' } };
    }
  }

  /** Per-city homepage hero image (admin-managed). Empty string = use default. */
  async getHeroImage(): Promise<ApiResponse<{ url: string }>> {
    try {
      const response = await apiClient.get('/site-settings/hero', {
        params: withCityParams(),
      });
      const raw = response.data?.data || response.data || {};
      const url = String(raw.hero_image_url || raw.heroImageUrl || '').trim();
      return { success: true, data: { url } };
    } catch {
      return { success: true, data: { url: '' } };
    }
  }

  async getBannerSettings(): Promise<
    ApiResponse<{
      leftText: string;
      middleText: string;
      rightTextEn: string;
      rightTextUr: string;
      whatsappOrderUrl?: string;
    }>
  > {
    try {
      const response = await apiClient.get('/site-settings/banner', { params: withCityParams() });
      const raw = response.data?.data || response.data || {};
      return {
        success: true,
        data: {
          leftText: raw.banner_left_text || raw.leftText || '0300-1234567',
          middleText: raw.banner_middle_text || raw.middleText || 'Free Delivery 10AM-2PM',
          rightTextEn: raw.banner_right_text_en || raw.rightTextEn || 'Fresh Sabzi at Your Doorstep',
          rightTextUr: raw.banner_right_text_ur || raw.rightTextUr || 'تازہ سبزیاں آپ کے دروازے پر',
          whatsappOrderUrl: String(raw.whatsapp_order_url || raw.whatsappOrderUrl || '').trim(),
        },
      };
    } catch {
      return {
        success: true,
        data: {
          leftText: '0300-1234567',
          middleText: 'Free Delivery 10AM-2PM',
          rightTextEn: 'Fresh Sabzi at Your Doorstep',
          rightTextUr: 'تازہ سبزیاں آپ کے دروازے پر',
        },
      };
    }
  }

  async getBanners(): Promise<ApiResponse<Banner[]>> {
    return { success: true, data: [] };
  }

  // Global feature flags / config (public). Defaults to "off" on any error so a
  // paused feature never shows its full UI.
  async getPublicConfig(): Promise<ApiResponse<{ atta_chakki_enabled: boolean }>> {
    try {
      const response = await apiClient.get('/site-settings/public-config');
      const raw = response.data?.data || response.data || {};
      return { success: true, data: { atta_chakki_enabled: raw.atta_chakki_enabled === true } };
    } catch {
      return { success: true, data: { atta_chakki_enabled: false } };
    }
  }

  // Today's Basket combos (public) for the selected city.
  async getBaskets(): Promise<
    ApiResponse<
      Array<{
        id: string;
        name: string;
        description: string | null;
        total_price: number;
        image_url: string | null;
        items: Array<{
          product_id: string;
          name: string;
          image: string | null;
          quality: string;
          quantity: number;
          unit: string;
        }>;
      }>
    >
  > {
    try {
      const response = await apiClient.get('/site-settings/baskets', {
        params: withCityParams(),
      });
      const raw = response.data?.data || response.data || [];
      return { success: true, data: Array.isArray(raw) ? raw : [] };
    } catch {
      return { success: true, data: [] };
    }
  }

  // Map-based service area for the selected city (active polygons + popup copy).
  async getServiceArea(): Promise<
    ApiResponse<{
      enabled: boolean;
      polygons: [number, number][][];
      message: { title: string; message_en: string; message_ur: string; whatsapp: string };
    }>
  > {
    const empty = {
      enabled: false,
      polygons: [] as [number, number][][],
      message: { title: '', message_en: '', message_ur: '', whatsapp: '' },
    };
    try {
      const response = await apiClient.get('/site-settings/service-area', {
        params: withCityParams(),
      });
      const raw = response.data?.data || response.data || {};
      return {
        success: true,
        data: {
          enabled: !!raw.enabled,
          polygons: Array.isArray(raw.polygons) ? raw.polygons : [],
          message: raw.message || empty.message,
        },
      };
    } catch {
      return { success: true, data: empty };
    }
  }
}

export const productService = new ProductService();
export default productService;
