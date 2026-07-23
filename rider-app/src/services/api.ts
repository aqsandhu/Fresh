import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import { getCurrentTabName, setPendingRedirect } from '../navigation/navigationUtils';
import { API_BASE_URL, API_TIMEOUT } from '../utils/constants';
import { getStoredToken } from '../lib/secureTokens';
import { refreshAccessToken } from '../lib/tokenRefresh';

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
        const token = useAuthStore.getState().token || (await getStoredToken());
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor: try a token refresh + retry on 401 before logging out
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retried?: boolean;
        };

        if (error.response?.status === 401 && originalRequest && !originalRequest._retried) {
          const isRefreshCall = originalRequest.url?.includes('/auth/refresh');
          if (isRefreshCall) {
            this.forceLogout();
            return Promise.reject(error);
          }

          originalRequest._retried = true;
          const newToken = await refreshAccessToken();
          if (newToken) {
            originalRequest.headers = {
              ...(originalRequest.headers as Record<string, string> | undefined),
              Authorization: `Bearer ${newToken}`,
            } as InternalAxiosRequestConfig['headers'];
            return this.client.request(originalRequest);
          }

          // Refresh returned null: either a transient failure (network/5xx —
          // reject and let the caller retry later) or a genuine auth failure,
          // in which case tokenRefresh's onRefreshFailed already logged out.
          // Do NOT forceLogout here on a plain null.
        }

        return Promise.reject(error);
      }
    );
  }

  private forceLogout() {
    // Save current tab so user returns here after re-login
    const tabName = getCurrentTabName();
    if (tabName) {
      setPendingRedirect(tabName);
    }
    useAuthStore.getState().logout();
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

// Check network/backend status — backend serves /health at the root,
// not under /api.
export const checkNetworkStatus = async (): Promise<boolean> => {
  try {
    const rootUrl = API_BASE_URL.replace(/\/api\/?$/, '');
    const response = await apiService.getClient().get(`${rootUrl}/health`);
    return response.status === 200;
  } catch {
    return false;
  }
};

export const apiService = new ApiService();
export default apiService;
