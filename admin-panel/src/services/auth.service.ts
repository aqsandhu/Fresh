import { api } from './api';
import type { 
  LoginCredentials, 
  AuthResponse, 
  User,
  ApiResponse 
} from '@/types';

export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    try {
      // Validate credentials before sending
      if (!credentials.phone || credentials.phone.trim().length === 0) {
        throw new Error('Phone number is required');
      }
      if (!credentials.password || credentials.password.length === 0) {
        throw new Error('Password is required');
      }

      const response = await api.post<ApiResponse<AuthResponse>>('/admin/login', credentials);
      if (response.success && response.data) {
        localStorage.setItem('admin_token', response.data.tokens.accessToken);
        localStorage.setItem('admin_refresh_token', response.data.tokens.refreshToken);
        localStorage.setItem('admin_user', JSON.stringify(response.data.user));
      }
      return response.data;
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Handle specific error cases
      if (error.response?.status === 401) {
        throw new Error('Invalid phone number or password');
      }
      if (error.response?.status === 403) {
        throw new Error('Account is disabled. Please contact admin.');
      }
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error(error.message || 'Login failed. Please try again.');
    }
  },

  logout: (): void => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_user');
  },

  getCurrentUser: (): User | null => {
    try {
      const userStr = localStorage.getItem('admin_user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Error parsing user data:', error);
      return null;
    }
  },

  getToken: (): string | null => {
    return localStorage.getItem('admin_token');
  },

  getRefreshToken: (): string | null => {
    return localStorage.getItem('admin_refresh_token');
  },

  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('admin_token');
  },

  verifyToken: async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return false;
      
      const response = await api.get<ApiResponse<{ valid: boolean }>>('/admin/verify-token');
      return response.success && response.data?.valid;
    } catch (error: any) {
      console.error('Token verification error:', error);
      return false;
    }
  },

  refreshToken: async (): Promise<boolean> => {
    try {
      const refreshToken = localStorage.getItem('admin_refresh_token');
      if (!refreshToken) return false;

      const response = await api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
        '/admin/refresh-token',
        { refreshToken }
      );

      if (response.success && response.data) {
        localStorage.setItem('admin_token', response.data.accessToken);
        localStorage.setItem('admin_refresh_token', response.data.refreshToken);
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Token refresh error:', error);
      // Clear tokens on refresh failure
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_refresh_token');
      localStorage.removeItem('admin_user');
      return false;
    }
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    try {
      // Validate passwords
      if (!currentPassword || currentPassword.length === 0) {
        throw new Error('Current password is required');
      }
      if (!newPassword || newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters');
      }

      await api.post<ApiResponse<void>>('/admin/change-password', {
        currentPassword,
        newPassword,
      });
    } catch (error: any) {
      console.error('Password change error:', error);
      if (error.response?.status === 401) {
        throw new Error('Current password is incorrect');
      }
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error(error.message || 'Failed to change password');
    }
  },

  updateProfile: async (data: { fullName?: string; email?: string }): Promise<User> => {
    try {
      const response = await api.put<ApiResponse<User>>('/admin/profile', data);
      
      if (response.success && response.data) {
        // Update stored user data
        const currentUser = authService.getCurrentUser();
        if (currentUser) {
          const updatedUser = { ...currentUser, ...response.data };
          localStorage.setItem('admin_user', JSON.stringify(updatedUser));
        }
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Profile update error:', error);
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error(error.message || 'Failed to update profile');
    }
  },
};
