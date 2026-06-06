import * as SecureStore from 'expo-secure-store';

// SecureStore keys must match [A-Za-z0-9._-] (the '@'-prefixed AsyncStorage
// keys are not valid here), so we use dedicated key names.
const TOKEN_KEY = 'freshbazar_rider_token';
const REFRESH_TOKEN_KEY = 'freshbazar_rider_refresh_token';

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getStoredRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function storeTokens(
  accessToken: string,
  refreshToken?: string | null
): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  if (refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
