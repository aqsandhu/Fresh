/**
 * The admin uploads full-size photos (live: a 4 MB hero JPEG, a 656 KB logo
 * PNG, a 610 KB favicon PNG — 5.3 of the home page's 6.1 MB). For images on a
 * host next.config allows (Supabase storage, Unsplash) this returns Next's
 * resizing URL, so the browser gets a small WebP instead. Anything else, data:
 * and blob: URLs, and relative paths are returned unchanged.
 *
 * `width` must be one of Next's default image widths (16 … 3840).
 */
const OPTIMISABLE_HOSTS = [/\.supabase\.co$/i, /^images\.unsplash\.com$/i];

export function isOptimisableImage(url: string | null | undefined): boolean {
  if (!url || !/^https:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname;
    return OPTIMISABLE_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

export function optimizedImageSrc(url: string, width: number, quality = 75): string {
  if (!isOptimisableImage(url)) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}
