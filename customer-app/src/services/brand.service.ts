import apiClient from './api';

let cachedRemoteUrl: string | null | undefined;

export async function fetchBrandLogoUrl(): Promise<string | null> {
  if (cachedRemoteUrl !== undefined) return cachedRemoteUrl;
  try {
    const response = await apiClient.get('/site-settings/brand');
    const payload = response.data?.data ?? response.data;
    const url = payload?.logoUrl || payload?.logo_url;
    cachedRemoteUrl = typeof url === 'string' && url.trim() ? url.trim() : null;
  } catch {
    cachedRemoteUrl = null;
  }
  return cachedRemoteUrl;
}
