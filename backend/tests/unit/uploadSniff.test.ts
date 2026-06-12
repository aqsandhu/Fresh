// ============================================================================
// UPLOAD MAGIC-BYTE SNIFFING — content must match an allowed image format
// ----------------------------------------------------------------------------
// The multer fileFilter only sees the client-declared mimetype; sniffImageMime
// inspects the real bytes so an .exe renamed photo.jpg can't reach storage.
// ============================================================================

import { sniffImageMime } from '@/middleware/upload';

function jpeg(): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 0)]);
}

function png(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16, 0),
  ]);
}

function webp(): Buffer {
  const buf = Buffer.alloc(20, 0);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  return buf;
}

describe('sniffImageMime', () => {
  it('detects JPEG from its signature', () => {
    expect(sniffImageMime(jpeg())).toBe('image/jpeg');
  });

  it('detects PNG from its signature', () => {
    expect(sniffImageMime(png())).toBe('image/png');
  });

  it('detects WebP from its RIFF/WEBP signature', () => {
    expect(sniffImageMime(webp())).toBe('image/webp');
  });

  it('rejects a Windows executable disguised as an image', () => {
    const exe = Buffer.concat([Buffer.from('MZ', 'ascii'), Buffer.alloc(64, 0)]);
    expect(sniffImageMime(exe)).toBeNull();
  });

  it('rejects an HTML payload disguised as an image (stored-XSS vector)', () => {
    const html = Buffer.from('<script>alert(1)</script>', 'utf8');
    expect(sniffImageMime(html)).toBeNull();
  });

  it('rejects buffers too short to identify', () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });

  it('rejects a RIFF container that is not WebP (e.g. AVI)', () => {
    const avi = Buffer.alloc(20, 0);
    avi.write('RIFF', 0, 'ascii');
    avi.write('AVI ', 8, 'ascii');
    expect(sniffImageMime(avi)).toBeNull();
  });
});
