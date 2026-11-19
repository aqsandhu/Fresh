// A picture sent when file storage is not set up must be REFUSED, not dropped:
// the request used to succeed and the picture was silently thrown away
// (a product saved with no image, a waste entry with no proof).
import express from 'express';
import request from 'supertest';

jest.mock('../../src/config/storage', () => ({
  isStorageConfigured: () => false,
  uploadFileToStorage: jest.fn(),
}));

import { uploadSingle, uploadMultiple } from '../../src/middleware/upload';
import { errorHandler } from '../../src/middleware/errorHandler';

// Smallest valid PNG (so the content check passes and storage is the only problem).
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

function app() {
  const a = express();
  a.post('/upload', ...uploadSingle('image', 'test'), (req, res) => res.json({ saved: true, url: (req.file as any)?.url ?? null }));
  a.use(errorHandler);
  return a;
}

describe('upload when storage is not configured', () => {
  it('refuses a request that carries a picture, with a clear reason', async () => {
    const res = await request(app()).post('/upload').attach('image', PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(503);
    expect(res.body.saved).toBeUndefined();
    expect(res.body.message).toMatch(/storage is not set up/);
  });

  it('lets a request without a picture through', async () => {
    const res = await request(app()).post('/upload').field('name', 'no picture');
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
  });

  it('a multi-picture field with NO picture is not an upload (round 7: a product without pictures was refused 503)', async () => {
    const a = express();
    a.post('/products', ...uploadMultiple('images', 5), (req, res) => res.json({ saved: true, files: (req.files as unknown[] | undefined)?.length ?? 0 }));
    a.use(errorHandler);
    const res = await request(a).post('/products').field('name_en', 'UI Test Tomato');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: true, files: 0 });
    const withPic = await request(a).post('/products').attach('images', PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(withPic.status).toBe(503);
  });
});

describe('upload limits outside the address routes (global error handler)', () => {
  it('a file over the size limit is a 413, not a 500', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    const res = await request(app()).post('/upload').attach('image', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
  });

  it('a declared non-image type is a 400, not a 500', async () => {
    const res = await request(app()).post('/upload').attach('image', Buffer.from('MZ'), { filename: 'a.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(400);
  });

  it('a file under an unexpected field name is a 400, not a 500', async () => {
    const res = await request(app()).post('/upload').attach('other', PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });
});
