import api from './api'

let cachedLogoUrl: string | null | undefined

export async function fetchBrandLogoUrl(): Promise<string | null> {
  if (cachedLogoUrl !== undefined) return cachedLogoUrl
  try {
    const res = await api.get('/site-settings/brand')
    const url = res.data?.data?.logoUrl || res.data?.data?.logo_url
    cachedLogoUrl = typeof url === 'string' && url.trim() ? url.trim() : null
  } catch {
    cachedLogoUrl = null
  }
  return cachedLogoUrl
}
