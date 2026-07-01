import { api, unwrap } from './api';
import type { 
  Category, 
  CreateCategoryData,
  ApiResponse 
} from '@/types';

export const categoryService = {
  getCategories: async (): Promise<Category[]> => {
    try {
      const response = await api.get<ApiResponse<Category[]>>('/admin/categories');
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching categories:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch categories');
    }
  },

  getCategoryTree: async (): Promise<Category[]> => {
    try {
      const response = await api.get<ApiResponse<Category[]>>('/categories/tree');
      return unwrap(response);
    } catch (error: any) {
      console.error('Error fetching category tree:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch category tree');
    }
  },

  createCategory: async (data: CreateCategoryData): Promise<Category> => {
    try {
      const response = await api.post<ApiResponse<Category>>('/admin/categories', data);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error creating category:', error);
      throw new Error(error?.response?.data?.message || 'Failed to create category');
    }
  },

  createCategoryWithImage: async (formData: FormData): Promise<Category> => {
    try {
      const response = await api.postForm<ApiResponse<Category>>('/admin/categories', formData);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error creating category with image:', error);
      throw new Error(error?.response?.data?.message || 'Failed to create category');
    }
  },

  updateCategory: async (id: string, data: Partial<CreateCategoryData>): Promise<Category> => {
    try {
      const response = await api.put<ApiResponse<Category>>(`/admin/categories/${id}`, data);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error updating category:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update category');
    }
  },

  updateCategoryWithImage: async (id: string, formData: FormData): Promise<Category> => {
    try {
      const response = await api.putForm<ApiResponse<Category>>(`/admin/categories/${id}`, formData);
      return unwrap(response);
    } catch (error: any) {
      console.error('Error updating category with image:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update category');
    }
  },

  deleteCategory: async (id: string): Promise<void> => {
    try {
      await api.delete<ApiResponse<void>>(`/admin/categories/${id}`);
    } catch (error: any) {
      console.error('Error deleting category:', error);
      throw new Error(error?.response?.data?.message || 'Failed to delete category');
    }
  },

  // Visibility flip without deleting the row — useful when a category is
  // temporarily out of season or the admin wants to hide it from the
  // storefront without losing its products.
  toggleCategoryActive: async (id: string): Promise<{ id: string; isActive: boolean }> => {
    try {
      const response = await api.patch<ApiResponse<{ id: string; isActive: boolean }>>(
        `/admin/categories/${id}/toggle-active`
      );
      return unwrap(response);
    } catch (error: any) {
      console.error('Error toggling category status:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update category status');
    }
  },

  uploadCategoryImage: async (id: string, image: File): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append('image', image);
      const response = await api.postForm<ApiResponse<{ imageUrl: string }>>(
        `/admin/categories/${id}/image`,
        formData
      );
      return unwrap(response).imageUrl;
    } catch (error: any) {
      console.error('Error uploading category image:', error);
      throw new Error(error?.response?.data?.message || 'Failed to upload image');
    }
  },
};
