import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import { CITY_STORAGE_KEY, clearCitySelection } from '@/lib/cityStorage';
import { API_BASE_URL, AUTH_COOKIES_ENABLED } from '@/config/env';

if (!process.env.VITE_API_URL) {
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

// Create axios instance. In cookie mode the session rides in HttpOnly
// cookies (withCredentials) instead of a JS-readable bearer token.
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: AUTH_COOKIES_ENABLED,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor to add auth token and convert camelCase to snake_case
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (config.headers) {
      // Tells the backend which cookie policy applies (and to strip token
      // strings from auth responses in cookie mode).
      config.headers['X-Client-Platform'] = 'admin';
    }
    if (!AUTH_COOKIES_ENABLED) {
      const token = localStorage.getItem('admin_token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
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

import { refreshAdminAccessToken } from '@/lib/adminTokenRefresh';

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

/** Only force login redirect when user had a session (not guest/login-page API noise). */
function shouldForceLoginRedirect(): boolean {
  if (window.location.pathname.startsWith('/admin/login')) return false;
  // Cookie mode has no JS-readable refresh token — the cached user marks
  // an active session instead.
  if (AUTH_COOKIES_ENABLED) {
    return Boolean(localStorage.getItem('admin_user'));
  }
  return Boolean(localStorage.getItem('admin_refresh_token'));
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
      const isRefreshCall = original.url?.includes('/auth/refresh');
      if (isRefreshCall) {
        if (shouldForceLoginRedirect()) redirectToLogin();
        return Promise.reject(error);
      }

      if (!shouldForceLoginRedirect()) {
        return Promise.reject(error);
      }

      // Try to refresh the access token transparently and retry the request.
      original._retried = true;
      const newToken = await refreshAdminAccessToken();
      if (newToken) {
        if (!original.headers) {
          original.headers = {} as InternalAxiosRequestConfig['headers'];
        }
        // Cookie mode: the refreshed session is in HttpOnly cookies — the
        // sentinel must NOT be sent as a bearer token.
        if (!AUTH_COOKIES_ENABLED) {
          (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        }
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
      if (shouldForceLoginRedirect()) {
        redirectToLogin();
      }
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
  
  delete: <T>(url: string, data?: object) =>
    apiClient.delete<T>(url, data ? { data: toSnakeCase(data) } : undefined).then(res => res.data),
  
  postForm: <T>(url: string, data: FormData) => 
    apiClient.post<T>(url, data).then(res => res.data),
  
  putForm: <T>(url: string, data: FormData) => 
    apiClient.put<T>(url, data).then(res => res.data),
};
