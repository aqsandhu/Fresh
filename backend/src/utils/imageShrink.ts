// ============================================================================
// Shrink an uploaded picture before it is stored (owner's decision, 21 Nov).
//
// Uploads were stored exactly as sent. On the live site the home page carried
// a 4 MB hero JPEG, a 656 KB logo and a 610 KB favicon (5.3 of its 6.1 MB), the
// customer app downloads the same files on mobile data, and riders' door /
// proof photos arrive at full camera resolution.
//
// Every picture is turned upright (phone EXIF rotation), scaled to fit the
// folder's longest side, re-encoded in its own format (PNG keeps transparency)
// and loses its metadata (EXIF can hold the phone's GPS position). The result
// is used only when it is smaller; any error keeps the original.
// ============================================================================

import sharp from 'sharp';
import logger from './logger';

// One picture at a time and no cache: the free Render instance has 512 MB.
sharp.cache(false);
sharp.concurrency(1);

/** Longest side in pixels for each storage folder (default 1600). */
export function maxSideFor(folder: string): number {
  if (folder.startsWith('favicon')) return 512;
  if (folder.startsWith('brand')) return 1024;
  if (folder.startsWith('hero')) return 2048;
  return 1600;
}

export interface ShrinkResult {
  buffer: Buffer;
  changed: boolean;
}

export async function shrinkImageBuffer(input: Buffer, mimetype: string, maxSide: number): Promise<ShrinkResult> {
  try {
    let pipeline = sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
    if (mimetype === 'image/jpeg') pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
    else if (mimetype === 'image/png') pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: 90 });
    else if (mimetype === 'image/webp') pipeline = pipeline.webp({ quality: 80 });
    else return { buffer: input, changed: false };
    const out = await pipeline.toBuffer();
    return out.length < input.length ? { buffer: out, changed: true } : { buffer: input, changed: false };
  } catch (errCaught: unknown) {
    logger.warn('Image could not be shrunk; storing the original', {
      error: errCaught instanceof Error ? errCaught.message : String(errCaught),
    });
    return { buffer: input, changed: false };
  }
}

/** Shrink a multer file in place (buffer + size). */
export async function shrinkUploadedFile(file: Express.Multer.File, folder: string): Promise<void> {
  if (!file?.buffer) return;
  const before = file.buffer.length;
  const { buffer, changed } = await shrinkImageBuffer(file.buffer, file.mimetype, maxSideFor(folder));
  if (!changed) return;
  file.buffer = buffer;
  file.size = buffer.length;
  logger.info('Upload shrunk', { folder, from: before, to: buffer.length });
}
