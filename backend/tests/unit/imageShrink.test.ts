// Owner's decision 21 Nov: uploads are shrunk on the server (live: 4 MB hero,
// 656 KB logo, 610 KB favicon; riders' photos at full camera size).
import sharp from 'sharp';
import { maxSideFor, shrinkImageBuffer, shrinkUploadedFile } from '../../src/utils/imageShrink';

const noisyJpeg = async (w: number, h: number, exif = false) => {
  // Random pixels so the JPEG is big, like a real photo.
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
  let img = sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 98 });
  if (exif) img = img.withExif({ IFD0: { Make: 'TestPhone', Copyright: 'gps-here' } });
  return img.toBuffer();
};

describe('imageShrink', () => {
  it('sizes per folder', () => {
    expect(maxSideFor('hero')).toBe(2048);
    expect(maxSideFor('brand')).toBe(1024);
    expect(maxSideFor('favicon')).toBe(512);
    expect(maxSideFor('addresses/door-pictures')).toBe(1600);
  });

  it('a big phone photo: fits 1600 px, much smaller, metadata gone', async () => {
    const input = await noisyJpeg(4000, 3000, true);
    const { buffer, changed } = await shrinkImageBuffer(input, 'image/jpeg', 1600);
    expect(changed).toBe(true);
    expect(buffer.length).toBeLessThan(input.length / 3);
    const meta = await sharp(buffer).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1600, 1200, 'jpeg']);
    expect(meta.exif).toBeUndefined();
  });

  it('a PNG logo keeps its transparency and its format', async () => {
    const input = await sharp({ create: { width: 2400, height: 1200, channels: 4, background: { r: 20, g: 120, b: 60, alpha: 0.5 } } }).png({ compressionLevel: 0 }).toBuffer();
    const { buffer, changed } = await shrinkImageBuffer(input, 'image/png', 1024);
    expect(changed).toBe(true);
    const meta = await sharp(buffer).metadata();
    expect([meta.width, meta.height, meta.format, meta.hasAlpha]).toEqual([1024, 512, 'png', true]);
  });

  it('never enlarges, and keeps the original when the result is not smaller', async () => {
    const tiny = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ffffff' } }).jpeg({ quality: 50 }).toBuffer();
    const r = await shrinkImageBuffer(tiny, 'image/jpeg', 1600);
    expect(r.buffer).toBe(tiny);
    expect(r.changed).toBe(false);
  });

  it('a broken file is stored as sent (never refused here)', async () => {
    const junk = Buffer.from([0xff, 0xd8, 0xff, 0x00, 1, 2, 3, 4, 5, 6, 7, 8]);
    const r = await shrinkImageBuffer(junk, 'image/jpeg', 1600);
    expect(r).toEqual({ buffer: junk, changed: false });
  });

  it('updates the multer file in place', async () => {
    const buffer = await noisyJpeg(3000, 2000);
    const file = { buffer, size: buffer.length, mimetype: 'image/jpeg' } as Express.Multer.File;
    await shrinkUploadedFile(file, 'orders/delivery-proof');
    expect(file.size).toBe(file.buffer.length);
    expect(file.size).toBeLessThan(buffer.length);
    expect((await sharp(file.buffer).metadata()).width).toBe(1600);
  });
});
