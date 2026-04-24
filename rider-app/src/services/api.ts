import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { getCurrentTabName, setPendingRedirect } from '../navigation/navigationUtils';
import { API_BASE_URL, API_TIMEOUT, STORAGE_KEYS } from '../utils/constants';

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (config) => {
        const token = useAuthStore.getState().token || await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling + token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          if (!isRefreshing) {
            isRefreshing = true;
            try {
              const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
              if (refreshToken) {
                // Lazy import authService to avoid circular dependency
                const { authService } = require('../services/auth.service');
                const refreshResponse = await authService.refreshToken(refreshToken);
                
                if (refreshResponse.success && refreshResponse.data) {
                  const { accessToken, refreshToken: newRefreshToken } = refreshResponse.data;
                  await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, accessToken);
                  if (newRefreshToken) {
                    await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken);
                  }
                  useAuthStore.setState({ token: accessToken, refreshToken: newRefreshToken || refreshToken });
                  
                  onTokenRefreshed(accessToken);
                  isRefreshing = false;
                  
                  originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                  return this.client(originalRequest);
                }
              }
            } catch (refreshError) {
              console.error('Token refresh failed:', refreshError);
            } finally {
              isRefreshing = false;
            }
          } else {
            return new Promise((resolve) => {
              subscribeTokenRefresh((newToken: string) => {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                resolve(this.client(originalRequest));
              });
            });
          }
          
          // Refresh failed — save current tab and force logout
          const tabName = getCurrentTabName();
          if (tabName) {
            setPendingRedirect(tabName);
          }
          useAuthStore.getState().logout();
        }
        return Promise.reject(error);
      }
    );
  }

  getClient(): AxiosInstance {
    return this.client;
  }

  async get<T>(url: string, params?: Record<string, any>): Promise<T> {
    const response = await this.client.get(url, { params });
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.post(url, data);
    return response.data;
  }

  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.put(url, data);
    return response.data;
  }

  async patch<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.patch(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete(url);
    return response.data;
  }
}

// Check network/backend status
export const checkNetworkStatus = async (): Promise<boolean> => {
  try {
    const response = await apiService.getClient().get('/health');
    return response.status === 200;
  } catch {
    return false;
  }
};

export const apiService = new ApiService();
export default apiService;
