import apiService from './api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

let cachedRemoteUrl: string | null | undefined;

export async function fetchBrandLogoUrl(): Promise<string | null> {
  if (cachedRemoteUrl !== undefined) return cachedRemoteUrl;
  try {
    const response = await apiService.get<ApiResponse<{ logoUrl?: string; logo_url?: string }>>(
      '/site-settings/brand'
    );
    const url = response.data?.logoUrl || response.data?.logo_url;
    cachedRemoteUrl = typeof url === 'string' && url.trim() ? url.trim() : null;
  } catch {
    cachedRemoteUrl = null;
  }
  return cachedRemoteUrl;
}
