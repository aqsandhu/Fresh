import * as SecureStore from 'expo-secure-store';
import { createExpoSecureTokenStorage } from '@freshbazar/core-auth';

export const tokenStorage = createExpoSecureTokenStorage(SecureStore, {
  accessToken: 'freshbazar_rider_token',
  refreshToken: 'freshbazar_rider_refresh_token',
});

export const getStoredToken = () => tokenStorage.getAccessToken();
export const getStoredRefreshToken = () => tokenStorage.getRefreshToken();
export const storeTokens = (
  accessToken: string,
  refreshToken?: string | null
) => tokenStorage.storeTokens(accessToken, refreshToken);
export const clearTokens = () => tokenStorage.clearTokens();
