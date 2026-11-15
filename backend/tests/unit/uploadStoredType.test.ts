// The stored picture's type must come from its bytes, not from what the
// client declared — the object's Content-Type and extension are built from it.
import express from 'express';
import request from 'supertest';

const stored: Array<{ mimetype: string; originalname: string }> = [];
jest.mock('../../src/config/storage', () => ({
  isStorageConfigured: () => true,
  uploadFileToStorage: jest.fn(async (file: { mimetype: string; originalname: string }) => {
    stored.push({ mimetype: file.mimetype, originalname: file.originalname });
    return { url: 'https://cdn.test/x', path: 'x' };
  }),
}));

import { uploadSingle } from '../../src/middleware/upload';
import { errorHandler } from '../../src/middleware/errorHandler';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);

function app() {
  const a = express();
  a.post('/upload', ...uploadSingle('image', 'test'), (req, res) => res.json({ url: req.file?.url ?? null }));
  a.use(errorHandler);
  return a;
}

it('a JPEG declared as PNG (named .html) is stored as a JPEG', async () => {
  stored.length = 0;
  const res = await request(app()).post('/upload').attach('image', JPEG, { filename: 'photo.html', contentType: 'image/png' });
  expect(res.status).toBe(200);
  expect(stored).toEqual([{ mimetype: 'image/jpeg', originalname: 'photo.html' }]);
});

it('a storage failure on the address route does not show the customer internal details', async () => {
  const { uploadFileToStorage } = jest.requireMock('../../src/config/storage');
  (uploadFileToStorage as jest.Mock).mockRejectedValueOnce(new Error('Storage bucket "uploads" is not registered in Supabase Storage for project https://secret-project.supabase.co'));
  const { uploadDoorPicture, handleUploadError } = jest.requireActual('../../src/middleware/upload');
  const a = express();
  a.post('/addresses', ...uploadDoorPicture, handleUploadError, (_req, res) => res.json({ saved: true }));
  a.use(errorHandler);
  const res = await request(a).post('/addresses').attach('door_picture', JPEG, { filename: 'd.jpg', contentType: 'image/jpeg' });
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toMatch(/supabase|secret-project|bucket/i);
});
