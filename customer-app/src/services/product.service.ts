import apiClient, { handleApiError } from './api';
import { ApiResponse, Category, Product, Banner, PaginatedResponse } from '@types';
import { API_BASE_URL } from '@utils/constants';

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

function mapBackendProduct(raw: any): Product {
  const price = parseFloat(raw.price) || 0;
  const compareAt = parseFloat(raw.compare_at_price) || 0;
  const primaryImage = resolveImageUrl(raw.primary_image);
  const images = raw.images && Array.isArray(raw.images) && raw.images.length > 0
    ? raw.images.map(resolveImageUrl)
    : (primaryImage ? [primaryImage] : []);

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
    inStock: (parseInt(raw.stock_quantity) || 0) > 0,
    rating: parseFloat(raw.rating_average) || 0,
    reviewCount: parseInt(raw.order_count || raw.review_count) || 0,
    isFeatured: raw.is_featured || false,
    tags: raw.tags || [],
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
}

class ProductService {
  async getCategories(): Promise<ApiResponse<Category[]>> {
    try {
      const response = await apiClient.get('/categories');
      const raw = response.data;
      const items = (raw.data || []).map(mapBackendCategory);
      return { success: true, data: items };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getCategoryById(id: string): Promise<ApiResponse<Category>> {
    try {
      const response = await apiClient.get(`/categories/${id}`);
      const raw = response.data;
      return { success: true, data: mapBackendCategory(raw.data || raw, 0) };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getProducts(params: GetProductsParams = {}): Promise<ApiResponse<PaginatedResponse<Product>>> {
    try {
      const apiParams: any = { ...params };
      if (params.featured) {
        apiParams.featured = 'true';
      }
      const response = await apiClient.get('/products', { params: apiParams });
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

  async getProductById(id: string): Promise<ApiResponse<Product>> {
    try {
      const response = await apiClient.get(`/products/${id}`);
      const raw = response.data;
      return { success: true, data: mapBackendProduct(raw.data || raw) };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getFeaturedProducts(): Promise<ApiResponse<Product[]>> {
    try {
      const response = await apiClient.get('/products/featured/list');
      const raw = response.data;
      const items = (raw.data || []).map(mapBackendProduct);
      return { success: true, data: items };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getProductsByCategory(categoryId: string): Promise<ApiResponse<Product[]>> {
    try {
      const response = await apiClient.get('/products', { params: { category: categoryId } });
      const raw = response.data;
      const items = (raw.data || []).map(mapBackendProduct);
      return { success: true, data: items };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async searchProducts(query: string): Promise<ApiResponse<Product[]>> {
    try {
      const response = await apiClient.get('/products/search', { params: { q: query } });
      const raw = response.data;
      const items = (raw.data || []).map(mapBackendProduct);
      return { success: true, data: items };
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getBanners(): Promise<ApiResponse<Banner[]>> {
    // Backend does not have image banners – return empty array gracefully
    return { success: true, data: [] };
  }
}

export const productService = new ProductService();
export default productService;
