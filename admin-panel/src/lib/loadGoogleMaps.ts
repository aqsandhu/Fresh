import { apiClient } from '@/services/api';

// Loads the Google Maps JavaScript API on demand for the admin panel. The
// browser key is public; it comes from the backend (Render GOOGLE_MAPS_API_KEY)
// via the existing public /site-settings/maps-key endpoint.

let loader: Promise<any | null> | null = null;
let cachedKey: string | null = null;

export async function fetchMapsKey(): Promise<string> {
  if (cachedKey !== null) return cachedKey;
  try {
    const res = await apiClient.get('/site-settings/maps-key');
    const key = String(res.data?.data?.key || res.data?.key || '').trim();
    cachedKey = key;
    return key;
  } catch {
    cachedKey = '';
    return '';
  }
}

/** Resolves to the google.maps namespace, or null when no key is configured. */
export async function loadGoogleMaps(): Promise<any | null> {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { google?: { maps?: any } };
  if (w.google?.maps) return w.google.maps;

  const key = await fetchMapsKey();
  if (!key) return null;

  if (!loader) {
    loader = new Promise<any | null>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        key
      )}&v=weekly&loading=async`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(w.google?.maps ?? null);
      script.onerror = () => reject(new Error('Failed to load Google Maps'));
      document.head.appendChild(script);
    });
  }
  return loader;
}
