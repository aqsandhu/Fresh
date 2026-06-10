import * as SecureStore from 'expo-secure-store';
import { createExpoSecureTokenStorage } from '@freshbazar/core-auth';

export const tokenStorage = createExpoSecureTokenStorage(SecureStore, {
  accessToken: 'freshbazar_token',
  refreshToken: 'freshbazar_refresh_token',
});

export const getStoredToken = () => tokenStorage.getAccessToken();
export const getStoredRefreshToken = () => tokenStorage.getRefreshToken();
export const setStoredToken = (accessToken: string) =>
  tokenStorage.setAccessToken!(accessToken);
export const storeTokens = (
  accessToken: string,
  refreshToken?: string | null
) => tokenStorage.storeTokens(accessToken, refreshToken);
export const clearTokens = () => tokenStorage.clearTokens();
