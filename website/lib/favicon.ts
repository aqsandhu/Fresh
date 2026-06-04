import api from './api'

let cachedFaviconUrl: string | null | undefined

export async function fetchBrandFaviconUrl(): Promise<string | null> {
  if (cachedFaviconUrl !== undefined) return cachedFaviconUrl
  try {
    const res = await api.get('/site-settings/favicon')
    const url = res.data?.data?.faviconUrl || res.data?.data?.favicon_url
    cachedFaviconUrl = typeof url === 'string' && url.trim() ? url.trim() : null
  } catch {
    cachedFaviconUrl = null
  }
  return cachedFaviconUrl
}
