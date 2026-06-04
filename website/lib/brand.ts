import api from './api'

const DEFAULT_LOGO = '/logo.png'

let cachedLogoUrl: string | null = null

export async function fetchBrandLogoUrl(): Promise<string> {
  if (cachedLogoUrl) return cachedLogoUrl
  try {
    const res = await api.get('/site-settings/brand')
    const url = res.data?.data?.logoUrl || res.data?.data?.logo_url
    cachedLogoUrl = typeof url === 'string' && url.trim() ? url.trim() : DEFAULT_LOGO
  } catch {
    cachedLogoUrl = DEFAULT_LOGO
  }
  return cachedLogoUrl
}

export function getDefaultBrandLogo(): string {
  return DEFAULT_LOGO
}
