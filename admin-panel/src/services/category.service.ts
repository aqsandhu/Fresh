import { api } from './api';
import type { 
  Category, 
  CreateCategoryData,
  ApiResponse 
} from '@/types';

export const categoryService = {
  getCategories: async (): Promise<Category[]> => {
    try {
      const response = await api.get<ApiResponse<Category[]>>('/admin/categories');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching categories:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch categories');
    }
  },

  getCategoryTree: async (): Promise<Category[]> => {
    try {
      const response = await api.get<ApiResponse<Category[]>>('/categories/tree');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching category tree:', error);
      throw new Error(error?.response?.data?.message || 'Failed to fetch category tree');
    }
  },

  createCategory: async (data: CreateCategoryData): Promise<Category> => {
    try {
      const response = await api.post<ApiResponse<Category>>('/admin/categories', data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating category:', error);
      throw new Error(error?.response?.data?.message || 'Failed to create category');
    }
  },

  createCategoryWithImage: async (formData: FormData): Promise<Category> => {
    try {
      const response = await api.postForm<ApiResponse<Category>>('/admin/categories', formData);
      return response.data;
    } catch (error: any) {
      console.error('Error creating category with image:', error);
      throw new Error(error?.response?.data?.message || 'Failed to create category');
    }
  },

  updateCategory: async (id: string, data: Partial<CreateCategoryData>): Promise<Category> => {
    try {
      const response = await api.put<ApiResponse<Category>>(`/admin/categories/${id}`, data);
      return response.data;
    } catch (error: any) {
      console.error('Error updating category:', error);
      throw new Error(error?.response?.data?.message || 'Failed to update category');
    }
  },

  updateCategoryWithImage: async (id: string, formData: FormData): Promise<Category> => {
    try {
      const response = await api.putForm<ApiResponse<Category>>(`/admin/categories/${id}`, formData);
      return response.data;
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

  uploadCategoryImage: async (id: string, image: File): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append('image', image);
      const response = await api.postForm<ApiResponse<{ imageUrl: string }>>(
        `/admin/categories/${id}/image`,
        formData
      );
      return response.data.imageUrl;
    } catch (error: any) {
      console.error('Error uploading category image:', error);
      throw new Error(error?.response?.data?.message || 'Failed to upload image');
    }
  },
};
