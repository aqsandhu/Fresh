import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, API_TIMEOUT, STORAGE_KEYS } from '@utils/constants';
import { getCurrentTabName, setPendingRedirect } from '@navigation/navigationUtils';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

// Request interceptor
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    
    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Attempt token refresh if not already refreshing
      if (!isRefreshing) {
        isRefreshing = true;
        
        try {
          const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
          if (refreshToken) {
            // Lazy import authService to avoid circular dependency
            const { authService } = require('@services/auth.service');
            const refreshResponse = await authService.refreshToken(refreshToken);
            
            if (refreshResponse.success && refreshResponse.data) {
              const { accessToken, refreshToken: newRefreshToken } = refreshResponse.data;
              await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, accessToken);
              if (newRefreshToken) {
                await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken);
              }
              
              // Update auth store state
              const { useAuthStore } = require('@store/authStore');
              useAuthStore.setState({ token: accessToken, refreshToken: newRefreshToken || refreshToken });
              
              onTokenRefreshed(accessToken);
              isRefreshing = false;
              
              // Retry original request with new token
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              }
              return apiClient(originalRequest);
            }
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        // Wait for refresh to complete and retry
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            resolve(apiClient(originalRequest));
          });
        });
      }
      
      // Refresh failed or no refresh token — force logout
      // Save current tab so user returns here after re-login
      const tabName = getCurrentTabName();
      if (tabName) {
        setPendingRedirect(tabName);
      }

      // Clear token and force logout
      await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
      await AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      await AsyncStorage.removeItem(STORAGE_KEYS.USER);
      
      // Update store state directly (lazy import to avoid circular dependency)
      const { useAuthStore } = require('@store/authStore');
      useAuthStore.setState({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
    
    return Promise.reject(error);
  }
);

// API Error Handler
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const handleApiError = (error: any): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }
  
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message || error.message || 'Something went wrong';
    return new ApiError(message, error.response?.status, error.response?.data);
  }
  
  return new ApiError(error?.message || 'Something went wrong');
};

export default apiClient;
