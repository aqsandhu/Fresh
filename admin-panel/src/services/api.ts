import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import { CITY_STORAGE_KEY, clearCitySelection } from '@/lib/cityStorage';

// IMPORTANT: Set VITE_API_URL in production to point to the live backend.
// e.g., VITE_API_URL=https://api.freshbazar.pk/api
// The localhost fallback is for development only.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

if (!import.meta.env.VITE_API_URL) {
  console.warn('[Fresh Bazar Admin] VITE_API_URL is not set. Falling back to localhost:3000. Set this env var in production!');
}

// snake_case <-> camelCase conversion utilities
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

function convertKeys(obj: unknown, converter: (s: string) => string): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeys(item, converter));
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date) && !(obj instanceof File) && !(obj instanceof Blob)) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        converter(key),
        convertKeys(value, converter),
      ])
    );
  }
  return obj;
}

export function toCamelCase<T>(data: unknown): T {
  return convertKeys(data, snakeToCamel) as T;
}

export function toSnakeCase(data: unknown): unknown {
  return convertKeys(data, camelToSnake);
}

function cloneFormData(source: FormData): FormData {
  const clone = new FormData();
  source.forEach((value, key) => {
    clone.append(key, value);
  });
  return clone;
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retried?: boolean;
  _formDataBackup?: FormData;
};

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor to add auth token and convert camelCase to snake_case
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('admin_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const cityId = localStorage.getItem(CITY_STORAGE_KEY);
    if (cityId && cityId.length > 0 && config.headers) {
      config.headers['X-City-Id'] = cityId;
    }
    // Convert request body keys from camelCase to snake_case
    if (config.data && !(config.data instanceof FormData)) {
      config.data = toSnakeCase(config.data);
    } else if (config.data instanceof FormData) {
      // Let axios/browser set Content-Type with the multipart boundary.
      // Hard-coding 'multipart/form-data' without a boundary breaks parsing
      // on the server — req.body ends up empty and category/product creates fail.
      if (config.headers) {
        delete config.headers['Content-Type'];
      }
      // FormData streams are consumed on first send — keep a clone for 401 retries.
      (config as RetryableRequestConfig)._formDataBackup = cloneFormData(config.data);
    }
    // Convert query params
    if (config.params) {
      config.params = toSnakeCase(config.params);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Refresh-token machinery. When a request 401s with an expired access token
// we call POST /api/auth/refresh, swap the new tokens into localStorage, then
// retry the original request exactly once. Concurrent failed requests share a
// single in-flight refresh promise so we don't trigger N parallel refreshes.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const stored = localStorage.getItem('admin_refresh_token');
  if (!stored) return null;

  refreshPromise = (async () => {
    try {
      // Use a bare axios call (not apiClient) so this request bypasses the
      // 401 interceptor — otherwise a failing refresh would recurse.
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refreshToken: stored,
        refresh_token: stored,
      });
      const payload = data?.data ?? data;
      const tokens = payload?.tokens ?? payload;
      const accessToken = tokens?.accessToken || tokens?.access_token;
      const refreshToken = tokens?.refreshToken || tokens?.refresh_token;
      if (!accessToken) return null;

      localStorage.setItem('admin_token', accessToken);
      if (refreshToken) {
        localStorage.setItem('admin_refresh_token', refreshToken);
      }
      return accessToken;
    } catch {
      return null;
    } finally {
      // Clear the in-flight promise after it resolves either way so future
      // expirations can trigger a new refresh.
      setTimeout(() => { refreshPromise = null; }, 0);
    }
  })();

  return refreshPromise;
}

function redirectToLogin() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_refresh_token');
  localStorage.removeItem('admin_user');
  clearCitySelection();
  const currentPath = window.location.pathname;
  window.location.href = currentPath && currentPath !== '/admin/login'
    ? `/admin/login?redirect=${currentPath}`
    : '/admin/login';
}

// Response interceptor for error handling and snake_case -> camelCase conversion
apiClient.interceptors.response.use(
  (response) => {
    // Convert response data keys from snake_case to camelCase
    if (response.data) {
      response.data = toCamelCase(response.data);
    }
    return response;
  },
  async (error: AxiosError) => {
    const message = (error.response?.data as { message?: string })?.message || 'Something went wrong';
    const original = error.config as RetryableRequestConfig;

    if (error.response?.status === 401 && original && !original._retried) {
      // Try to refresh the access token transparently and retry the request.
      original._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        if (!original.headers) {
          original.headers = {} as InternalAxiosRequestConfig['headers'];
        }
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        // Restore FormData body — the first attempt may have consumed the stream.
        if (original._formDataBackup) {
          original.data = cloneFormData(original._formDataBackup);
        }
        return apiClient.request(original);
      }
      // Refresh failed → kick the user out.
      toast.error('Session expired. Please login again.');
      redirectToLogin();
    } else if (error.response?.status === 401) {
      // Already retried once — give up.
      redirectToLogin();
    } else if (error.response?.status === 403) {
      toast.error('You do not have permission to perform this action');
    } else if (error.response?.status && error.response.status >= 500) {
      toast.error('Server error. Please try again later.');
    } else {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

// Generic API methods
export const api = {
  get: <T>(url: string, params?: object) => 
    apiClient.get<T>(url, { params }).then(res => res.data),
  
  post: <T>(url: string, data?: object) => 
    apiClient.post<T>(url, data).then(res => res.data),
  
  put: <T>(url: string, data?: object) => 
    apiClient.put<T>(url, data).then(res => res.data),
  
  patch: <T>(url: string, data?: object) => 
    apiClient.patch<T>(url, data).then(res => res.data),
  
  delete: <T>(url: string) => 
    apiClient.delete<T>(url).then(res => res.data),
  
  postForm: <T>(url: string, data: FormData) => 
    apiClient.post<T>(url, data).then(res => res.data),
  
  putForm: <T>(url: string, data: FormData) => 
    apiClient.put<T>(url, data).then(res => res.data),
};
