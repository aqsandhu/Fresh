import { shrinkImage, IMAGE_LIMITS } from '../shrinkImage';

// Live site, 20 Nov: the admin's uploads went to customers as-is — a 4 MB
// hero, a 656 KB logo, a 610 KB favicon (5.3 of the home page's 6.1 MB).
const bigFile = (type: string, bytes = 900 * 1024) => new File([new Uint8Array(bytes)], 'photo', { type });

describe('shrinkImage', () => {
  const realBitmap = (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  const realToBlob = HTMLCanvasElement.prototype.toBlob;
  let drawn: { w: number; h: number } | null;

  beforeEach(() => {
    drawn = null;
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = jest.fn(async () => ({ width: 4000, height: 3000, close: jest.fn() }));
    HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
      const { width, height } = this; // set before drawImage by shrinkImage
      return { drawImage: () => { drawn = { w: width, h: height }; } } as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback, type?: string) {
      cb(new Blob([new Uint8Array(120 * 1024)], { type }));
    };
  });
  afterAll(() => {
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = realBitmap;
    HTMLCanvasElement.prototype.getContext = realGetContext;
    HTMLCanvasElement.prototype.toBlob = realToBlob;
  });

  it('scales a big photo to the longest side and keeps its type and name', async () => {
    const out = await shrinkImage(bigFile('image/jpeg'), IMAGE_LIMITS.hero);
    expect(drawn).toEqual({ w: 1920, h: 1440 });
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('photo');
    expect(out.size).toBe(120 * 1024);
  });

  it('a logo stays PNG (transparency) and becomes at most 512 px', async () => {
    const out = await shrinkImage(bigFile('image/png'), IMAGE_LIMITS.logo);
    expect(drawn).toEqual({ w: 512, h: 384 });
    expect(out.type).toBe('image/png');
  });

  it('small files, other types and a result that is not smaller are sent unchanged', async () => {
    const small = bigFile('image/jpeg', 50 * 1024);
    expect(await shrinkImage(small, IMAGE_LIMITS.hero)).toBe(small);
    const gif = bigFile('image/gif');
    expect(await shrinkImage(gif, IMAGE_LIMITS.hero)).toBe(gif);
    HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback, type?: string) {
      cb(new Blob([new Uint8Array(2 * 1024 * 1024)], { type }));
    };
    const f = bigFile('image/jpeg');
    expect(await shrinkImage(f, IMAGE_LIMITS.hero)).toBe(f);
  });

  it('a browser that cannot decode the picture → the original file', async () => {
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = jest.fn(async () => { throw new Error('decode failed'); });
    const f = bigFile('image/webp');
    expect(await shrinkImage(f, IMAGE_LIMITS.product)).toBe(f);
    delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
    expect(await shrinkImage(f, IMAGE_LIMITS.product)).toBe(f);
  });
});
