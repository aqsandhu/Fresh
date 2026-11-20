/**
 * Make a photo a sensible size in the browser before it is uploaded.
 *
 * The live site was sending its customers the admin's uploads as-is: a 4 MB
 * hero JPEG, a 656 KB logo PNG and a 610 KB favicon PNG (5.3 of the home
 * page's 6.1 MB, and the customer app downloads the same files on mobile
 * data). The browser's own canvas scales the picture down — no extra library.
 *
 * Safe by design: anything that is not a JPEG / PNG / WebP, a file that is
 * already small, a browser without createImageBitmap / canvas, any error, or
 * a result that is not smaller → the ORIGINAL file is returned unchanged.
 * PNG stays PNG (logos and favicons keep their transparency).
 */
export interface ShrinkOptions {
  /** Longest side in pixels after shrinking. */
  maxSide: number;
  /** JPEG / WebP quality 0–1. */
  quality?: number;
  /** Files at or below this size (bytes) are left alone. */
  minBytes?: number;
}

const SHRINKABLE = ['image/jpeg', 'image/png', 'image/webp'];

export async function shrinkImage(file: File, { maxSide, quality = 0.82, minBytes = 200 * 1024 }: ShrinkOptions): Promise<File> {
  try {
    if (!SHRINKABLE.includes(file.type) || file.size <= minBytes) return file;
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: file.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Per-use sizes — one place to change them. */
export const IMAGE_LIMITS = {
  hero: { maxSide: 1920 },
  logo: { maxSide: 512 },
  favicon: { maxSide: 256 },
  product: { maxSide: 1200 },
} satisfies Record<string, ShrinkOptions>;
