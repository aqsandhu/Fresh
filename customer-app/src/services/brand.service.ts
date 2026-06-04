import api from './api';

const DEFAULT_LOGO = require('../../assets/logo.png') as number;

let cachedRemoteUrl: string | null = null;

export async function fetchBrandLogoSource(): Promise<string | number> {
  if (cachedRemoteUrl) return cachedRemoteUrl;
  try {
    const res = await api.get('/site-settings/brand');
    const url = res.data?.data?.logoUrl || res.data?.data?.logo_url;
    if (typeof url === 'string' && url.trim()) {
      cachedRemoteUrl = url.trim();
      return cachedRemoteUrl;
    }
  } catch {
    /* use bundled default */
  }
  return DEFAULT_LOGO;
}

export function getDefaultBrandLogoSource(): number {
  return DEFAULT_LOGO;
}
