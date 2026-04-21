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
      formData.append('stock_quantity', (data.stockQuantity || 0).toString());
      formData.append('unit_type', data.unitType || 'kg');
      if (data.unitValue) formData.append('unit_value', data.unitValue.toString());
      formData.append('category_id', data.categoryId);
      formData.append('is_active', (data.isActive !== false).toString());
      formData.append('is_featured', (data.isFeatured === true).toString());
      
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
      if (data.stockQuantity !== undefined) formData.append('stock_quantity', data.stockQuantity.toString());
      if (data.unitType) formData.append('unit_type', data.unitType);
      if (data.categoryId) formData.append('category_id', data.categoryId);
      if (data.isActive !== undefined) formData.append('is_active', data.isActive.toString());
      if (data.isFeatured !== undefined) formData.append('is_featured', data.isFeatured.toString());
      
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

  deleteProduct: async (id: string): Promise<void> => {
    try {
      await api.delete<ApiResponse<void>>(`/admin/products/${id}`);
    } catch (error: any) {
      console.error('Error deleting product:', error);
      throw new Error(error?.response?.data?.message || 'Failed to delete product');
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

  toggleProductStatus: async (id: string, isActive: boolean): Promise<Product> => {
    try {
      const response = await api.patch<ApiResponse<Product>>(`/admin/products/${id}/status`, {
        is_active: isActive,
      });
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
