import type { ExpoSecureStorageKeys, SecureStoreLike, TokenStorage } from './types';

export function createExpoSecureTokenStorage(
  store: SecureStoreLike,
  keys: ExpoSecureStorageKeys
): TokenStorage {
  return {
    async getAccessToken() {
      try {
        return await store.getItemAsync(keys.accessToken);
      } catch {
        return null;
      }
    },

    async getRefreshToken() {
      try {
        return await store.getItemAsync(keys.refreshToken);
      } catch {
        return null;
      }
    },

    async setAccessToken(accessToken: string) {
      await store.setItemAsync(keys.accessToken, accessToken);
    },

    async storeTokens(accessToken: string, refreshToken?: string | null) {
      await store.setItemAsync(keys.accessToken, accessToken);
      if (refreshToken) {
        await store.setItemAsync(keys.refreshToken, refreshToken);
      }
    },

    async clearTokens() {
      await store.deleteItemAsync(keys.accessToken);
      await store.deleteItemAsync(keys.refreshToken);
    },
  };
}
