import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import { getCurrentTabName, setPendingRedirect } from '../navigation/navigationUtils';
import { API_BASE_URL, API_TIMEOUT } from '../utils/constants';
import { getStoredToken } from '../lib/secureTokens';
import { refreshAccessToken } from '../lib/tokenRefresh';
import { t } from '../i18n';

// ── Error helpers (used by stores/screens) ─────────────────────────────────

export class ApiError extends Error {
  status: number | null;
  isNetwork: boolean;
  constructor(message: string, status: number | null, isNetwork = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetwork = isNetwork;
  }
}

/** Backend `message` → Error.message → generic. Never leaks raw axios text. */
export const getApiErrorMessage = (error: unknown, fallback = 'Something went wrong'): string => {
  if (error instanceof ApiError) return error.message || fallback;
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (!error.response) return 'Check your internet connection';
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string') return error;
  return fallback;
};

export const getApiErrorStatus = (error: unknown): number | null => {
  if (error instanceof ApiError) return error.status;
  if (axios.isAxiosError(error)) return error.response?.status ?? null;
  return null;
};

/** 4xx — deterministic, never retried offline. */
export const isClientError = (error: unknown): boolean => {
  const status = getApiErrorStatus(error);
  return typeof status === 'number' && status >= 400 && status < 500;
};

/** No response at all (offline / DNS / timeout). */
export const isNetworkError = (error: unknown): boolean => {
  if (error instanceof ApiError) return error.isNetwork;
  return axios.isAxiosError(error) && !error.response;
};

/** Messages from verifyRiderActive / socket auth that mean "this account may not work". */
const RIDER_BLOCKED_RE = /rider account/i;

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(
      async (config) => {
        const token = useAuthStore.getState().token || (await getStoredToken());
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        // Let axios set the multipart boundary itself.
        if (config.data instanceof FormData) {
          delete (config.headers as Record<string, unknown>)['Content-Type'];
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
        const status = error.response?.status;

        if (status === 401 && originalRequest && !originalRequest._retried) {
          if (originalRequest.url?.includes('/auth/refresh')) {
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
          // null → transient failure (caller retries later) or a genuine auth
          // failure already handled by tokenRefresh.onRefreshFailed.
        }

        // Rider deactivated / unverified while signed in: verifyRiderActive
        // answers 403 on every rider route. End the session with the reason
        // so the Login screen can explain instead of spinning forever.
        if (status === 403) {
          const message = (error.response?.data as { message?: string } | undefined)?.message || '';
          if (RIDER_BLOCKED_RE.test(message)) {
            useAuthStore.getState().endSession(message);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private forceLogout() {
    const tabName = getCurrentTabName();
    if (tabName) setPendingRedirect(tabName);
    useAuthStore.getState().endSession(t('auth.sessionEnded'));
  }

  getClient(): AxiosInstance {
    return this.client;
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.get(url, { params });
    return response.data;
  }

  async post<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.post(url, data);
    return response.data;
  }

  async put<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.put(url, data);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.patch(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete(url);
    return response.data;
  }
}

/** Backend serves /health at the root, not under /api. */
export const checkNetworkStatus = async (): Promise<boolean> => {
  try {
    const rootUrl = API_BASE_URL.replace(/\/api\/?$/, '');
    const response = await apiService.getClient().get(`${rootUrl}/health`, { timeout: 8000 });
    return response.status === 200;
  } catch {
    return false;
  }
};

export const apiService = new ApiService();
export default apiService;
