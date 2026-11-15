import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, API_TIMEOUT, STORAGE_KEYS } from '@utils/constants';
import { getCurrentTabName, setPendingRedirect } from '@navigation/navigationUtils';
import { refreshAccessToken } from '@/lib/tokenRefresh';
import { getStoredToken, clearTokens } from '@/lib/secureTokens';
import { hydrateCachedCityId } from '@/lib/apiHelpers';
import { clearAppSession } from '@/lib/sessionEvents';
import { friendlyErrorMessage, isNetworkFailure } from '@/lib/networkErrors';

hydrateCachedCityId();

export const NETWORK_RETRY_DELAY_MS = 1500;

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
      _netRetried?: boolean;
    };

    // A READ that got no answer at all (weak signal, the server waking up) is
    // tried once more before the customer sees an error. Writes are never
    // repeated automatically — an order must not be placed twice.
    if (
      isNetworkFailure(error) &&
      originalRequest &&
      !originalRequest._netRetried &&
      (originalRequest.method || 'get').toLowerCase() === 'get'
    ) {
      originalRequest._netRetried = true;
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
      return apiClient.request(originalRequest);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retried) {
      const isRefreshCall = originalRequest.url?.includes('/auth/refresh');
      if (isRefreshCall) {
        await forceLogout();
        return Promise.reject(error);
      }

      originalRequest._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        originalRequest.headers = {
          ...(originalRequest.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${newToken}`,
        } as typeof originalRequest.headers;
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
    return new ApiError(friendlyErrorMessage(error), error.response?.status, error.response?.data);
  }

  return new ApiError(error?.message || 'Something went wrong');
};

export default apiClient;
