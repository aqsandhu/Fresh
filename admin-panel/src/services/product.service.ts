import { api } from './api';
import type { 
  Product, 
  CreateProductData,
  PaginatedResponse, 
  ApiResponse 
} from '@/types';

interface ProductFilters {
  page?: number;
  limit?: number;
  categoryId?: string;
  search?: string;
  isActive?: boolean;
}

export const productService = {
  getProducts: async (filters: ProductFilters = {}): Promise<{ products: Product[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    try {
      // Map frontend filter names to backend query param names
      const params: Record<string, any> = {};
      if (filters.page) params.page = filters.page;
      if (filters.limit) params.limit = filters.limit;
      if (filters.categoryId) params.category = filters.categoryId;
      if (filters.search) params.search = filters.search;
      if (filters.isActive !== undefined) params.is_active = filters.isActive;

      const response = await api.get<{ success: boolean; data: Product[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/admin/products', params);
      return { products: response.data, pagination: response.meta };
    } catch (error: any) {
      console.error('Error fetching products:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch products');
    }
  },

  getProductById: async (id: string): Promise<Product> => {
    try {
      const response = await api.get<ApiResponse<Product>>(`/admin/products/${id}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching product:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch product');
    }
  },

  createProduct: async (data: CreateProductData): Promise<Product> => {
    try {
      const formData = new FormData();
      formData.append('name_en', data.nameEn);
      if (data.nameUr) formData.append('name_ur', data.nameUr);
      if (data.descriptionEn) formData.append('description_en', data.descriptionEn);
      formData.append('price', data.price.toString());
      if (data.compareAtPrice) formData.append('compare_at_price', data.compareAtPrice.toString());
      if (data.halfKgPrice != null) formData.append('half_kg_price', String(data.halfKgPrice));
      if (data.quarterKgPrice != null) formData.append('quarter_kg_price', String(data.quarterKgPrice));
      if (data.halfDozenPrice != null) formData.append('half_dozen_price', String(data.halfDozenPrice));
      formData.append('stock_quantity', (data.stockQuantity || 0).toString());
      formData.append('unit_type', data.unitType || 'kg');
      if (data.unitValue) formData.append('unit_value', data.unitValue.toString());
      formData.append('category_id', data.categoryId);
      formData.append('is_active', (data.isActive !== false).toString());
      formData.append('is_featured', (data.isFeatured === true).toString());
      formData.append('is_variable_weight', (data.isVariableWeight === true).toString());
      if (data.variableWeightNote != null) {
        formData.append('variable_weight_note', data.variableWeightNote);
      }
      formData.append('allow_half_kg', (data.allowHalfKg !== false).toString());
      formData.append('allow_quarter_kg', (data.allowQuarterKg !== false).toString());
      formData.append('tags', JSON.stringify(data.tags || []));
      // Quality tiers: consumer B/C price + per-quality shared stock, "also for
      // restaurants" flag, and restaurant price per tier. (A = price + stock above.)
      if (data.priceB != null) formData.append('price_b', String(data.priceB));
      if (data.priceC != null) formData.append('price_c', String(data.priceC));
      if (data.stockQuantityB != null) formData.append('stock_quantity_b', String(data.stockQuantityB));
      if (data.stockQuantityC != null) formData.append('stock_quantity_c', String(data.stockQuantityC));
      formData.append('available_for_restaurants', (data.availableForRestaurants === true).toString());
      if (data.restaurantPriceA != null) formData.append('restaurant_price_a', String(data.restaurantPriceA));
      if (data.restaurantPriceB != null) formData.append('restaurant_price_b', String(data.restaurantPriceB));
      if (data.restaurantPriceC != null) formData.append('restaurant_price_c', String(data.restaurantPriceC));

      if (data.images && data.images.length > 0) {
        data.images.forEach((image) => {
          formData.append('images', image);
        });
      }

      const response = await api.postForm<ApiResponse<Product>>('/admin/products', formData);
      return response.data;
    } catch (error: any) {
      console.error('Error creating product:', error);
      throw new Error(error?.response?.data?.message || 'Failed to create product');
    }
  },

  updateProduct: async (id: string, data: Partial<CreateProductData>): Promise<Product> => {
    try {
      const formData = new FormData();
      
      if (data.nameEn !== undefined) formData.append('name_en', data.nameEn);
      if (data.nameUr !== undefined) formData.append('name_ur', data.nameUr);
      if (data.descriptionEn !== undefined) formData.append('description_en', data.descriptionEn);
      if (data.price !== undefined) formData.append('price', data.price.toString());
      if (data.compareAtPrice !== undefined) formData.append('compare_at_price', data.compareAtPrice.toString());
      if (data.halfKgPrice !== undefined) {
        formData.append('half_kg_price', data.halfKgPrice == null ? '' : String(data.halfKgPrice));
      }
      if (data.quarterKgPrice !== undefined) {
        formData.append('quarter_kg_price', data.quarterKgPrice == null ? '' : String(data.quarterKgPrice));
      }
      if (data.halfDozenPrice !== undefined) {
        formData.append('half_dozen_price', data.halfDozenPrice == null ? '' : String(data.halfDozenPrice));
      }
      if (data.stockQuantity !== undefined) formData.append('stock_quantity', data.stockQuantity.toString());
      if (data.unitType) formData.append('unit_type', data.unitType);
      if (data.categoryId) formData.append('category_id', data.categoryId);
      if (data.isActive !== undefined) formData.append('is_active', data.isActive.toString());
      if (data.isFeatured !== undefined) formData.append('is_featured', data.isFeatured.toString());
      if (data.isVariableWeight !== undefined) formData.append('is_variable_weight', data.isVariableWeight.toString());
      if (data.variableWeightNote !== undefined) formData.append('variable_weight_note', data.variableWeightNote ?? '');
      if (data.allowHalfKg !== undefined) formData.append('allow_half_kg', data.allowHalfKg.toString());
      if (data.allowQuarterKg !== undefined) formData.append('allow_quarter_kg', data.allowQuarterKg.toString());
      if (data.tags !== undefined) formData.append('tags', JSON.stringify(data.tags));
      if (data.priceB !== undefined) formData.append('price_b', data.priceB == null ? '' : String(data.priceB));
      if (data.priceC !== undefined) formData.append('price_c', data.priceC == null ? '' : String(data.priceC));
      if (data.stockQuantityB !== undefined) formData.append('stock_quantity_b', data.stockQuantityB == null ? '' : String(data.stockQuantityB));
      if (data.stockQuantityC !== undefined) formData.append('stock_quantity_c', data.stockQuantityC == null ? '' : String(data.stockQuantityC));
      if (data.availableForRestaurants !== undefined) formData.append('available_for_restaurants', data.availableForRestaurants.toString());
      if (data.restaurantPriceA !== undefined) formData.append('restaurant_price_a', data.restaurantPriceA == null ? '' : String(data.restaurantPriceA));
      if (data.restaurantPriceB !== undefined) formData.append('restaurant_price_b', data.restaurantPriceB == null ? '' : String(data.restaurantPriceB));
      if (data.restaurantPriceC !== undefined) formData.append('restaurant_price_c', data.restaurantPriceC == null ? '' : String(data.restaurantPriceC));
      
      if (data.images && data.images.length > 0) {
        data.images.forEach((image) => {
          formData.append('images', image);
        });
      }

      const response = await api.putForm<ApiResponse<Product>>(`/admin/products/${id}`, formData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating product:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update product');
    }
  },

  // Soft delete — sets is_active = false. Use ?soft=true explicitly.
  deleteProduct: async (id: string): Promise<void> => {
    try {
      await api.delete<ApiResponse<void>>(`/admin/products/${id}?soft=true`);
    } catch (error: any) {
      console.error('Error deleting product:', error);
      throw new Error(error?.response?.data?.message || 'Failed to delete product');
    }
  },

  // Permanent delete (default DELETE) — removes row + storage objects.
  hardDeleteProduct: async (id: string): Promise<void> => {
    try {
      await api.delete<ApiResponse<void>>(`/admin/products/${id}`);
    } catch (error: any) {
      console.error('Error hard-deleting product:', error);
      throw new Error(error?.response?.data?.message || 'Failed to permanently delete product');
    }
  },

  moveProductsToCategory: async (productIds: string[], categoryId: string): Promise<{ moved: number }> => {
    try {
      const response = await api.patch<ApiResponse<{ moved: number }>>(
        '/admin/products/move-category',
        { product_ids: productIds, category_id: categoryId }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error moving products:', error);
      throw new Error(error?.response?.data?.message || 'Failed to move products');
    }
  },

  updateProductStock: async (id: string, stockQuantity: number): Promise<Product> => {
    try {
      const response = await api.patch<ApiResponse<Product>>(`/admin/products/${id}/stock`, {
        stock_quantity: stockQuantity,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error updating product stock:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update stock');
    }
  },

  // Backend flips is_active server-side and returns the new value, so we
  // don't have to know the current state here. The previous endpoint
  // (`/products/:id/status`) didn't exist on the backend — every call was
  // 404'ing silently.
  toggleProductStatus: async (id: string): Promise<{ id: string; isActive: boolean }> => {
    try {
      const response = await api.patch<ApiResponse<{ id: string; isActive: boolean }>>(
        `/admin/products/${id}/toggle-active`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error toggling product status:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update status');
    }
  },

  getLowStockProducts: async (): Promise<Product[]> => {
    try {
      const response = await api.get<ApiResponse<Product[]>>('/admin/products/low-stock');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching low stock products:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch low stock products');
    }
  },

  uploadProductImages: async (id: string, images: File[]): Promise<string[]> => {
    try {
      const formData = new FormData();
      images.forEach((image) => {
        formData.append('images', image);
      });
      const response = await api.postForm<ApiResponse<{ imageUrls: string[] }>>(
        `/admin/products/${id}/images`,
        formData
      );
      return response.data.imageUrls;
    } catch (error: any) {
      console.error('Error uploading product images:', error);
      throw new Error(error?.response?.data?.message || 'Failed to upload images');
    }
  },

  deleteProductImage: async (productId: string, imageIndex: number): Promise<void> => {
    try {
      await api.delete<ApiResponse<void>>(`/admin/products/${productId}/images/${imageIndex}`);
    } catch (error: any) {
      console.error('Error deleting product image:', error);
      throw new Error(error?.response?.data?.message || 'Failed to delete image');
    }
  },
};
