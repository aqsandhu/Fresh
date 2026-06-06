import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, API_TIMEOUT, STORAGE_KEYS } from '@utils/constants';
import { getCurrentTabName, setPendingRedirect } from '@navigation/navigationUtils';
import { refreshAccessToken } from '@/lib/tokenRefresh';
import { getStoredToken, clearTokens } from '@/lib/secureTokens';
import { hydrateCachedCityId } from '@/lib/apiHelpers';
import { clearAppSession } from '@/lib/sessionEvents';

hydrateCachedCityId();

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getStoredToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _retried?: boolean;
    };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retried) {
      const isRefreshCall = originalRequest.url?.includes('/auth/refresh');
      if (isRefreshCall) {
        await forceLogout();
        return Promise.reject(error);
      }

      originalRequest._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient.request(originalRequest);
      }

      await forceLogout();
    }

    return Promise.reject(error);
  }
);

async function forceLogout() {
  const tabName = getCurrentTabName();
  if (tabName) {
    setPendingRedirect(tabName);
  }

  await clearTokens();
  await AsyncStorage.removeItem(STORAGE_KEYS.USER);
  clearAppSession();
}

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
