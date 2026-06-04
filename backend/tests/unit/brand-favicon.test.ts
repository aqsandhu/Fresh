// ============================================================================
// BRAND FAVICON — site_settings helpers (CRUD storage paths)
// ============================================================================

import { jest } from '@jest/globals';

const mockDeleteStoragePaths = jest.fn<() => Promise<number>>();

jest.unstable_mockModule('@/config/database', () => ({
  query: jest.fn(),
}));

jest.unstable_mockModule('@/config/storage', () => ({
  deleteStoragePaths: mockDeleteStoragePaths,
  objectPathFromSupabasePublicUrl: (url: string) => {
    const m = url.match(/\/uploads\/(.+)$/);
    return m ? m[1] : null;
  },
}));

jest.unstable_mockModule('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { query } = await import('@/config/database');
const mockQuery = query as jest.MockedFunction<typeof query>;

const {
  brandFaviconStoragePaths,
  deleteBrandFaviconFromStorage,
  clearBrandFaviconSettings,
  fetchBrandFaviconSettings,
  BRAND_FAVICON_URL_KEY,
  BRAND_FAVICON_STORAGE_PATH_KEY,
} = await import('@/utils/siteSettings');

describe('Brand favicon site settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteStoragePaths.mockResolvedValue(1);
  });

  describe('brandFaviconStoragePaths', () => {
    it('collects storage path and path parsed from public URL', () => {
      const paths = brandFaviconStoragePaths({
        brand_favicon_url:
          'https://x.supabase.co/storage/v1/object/public/uploads/favicon/abc.png',
        brand_favicon_storage_path: 'favicon/abc.png',
      });
      expect(paths).toContain('favicon/abc.png');
      expect(paths.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty when no favicon configured', () => {
      expect(
        brandFaviconStoragePaths({ brand_favicon_url: '', brand_favicon_storage_path: '' })
      ).toEqual([]);
    });
  });

  describe('deleteBrandFaviconFromStorage', () => {
    it('deletes previous paths but skips newly uploaded path', async () => {
      const count = await deleteBrandFaviconFromStorage(
        {
          brand_favicon_url: '',
          brand_favicon_storage_path: 'favicon/old.png',
        },
        'favicon/new.png'
      );
      expect(mockDeleteStoragePaths).toHaveBeenCalledWith(['favicon/old.png']);
      expect(count).toBe(1);
    });
  });

  describe('clearBrandFaviconSettings', () => {
    it('upserts empty URL and storage path keys', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({
          rows: [
            { key: BRAND_FAVICON_URL_KEY, value: '' },
            { key: BRAND_FAVICON_STORAGE_PATH_KEY, value: '' },
          ],
          rowCount: 2,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const result = await clearBrandFaviconSettings('admin-1');
      expect(result.brand_favicon_url).toBe('');
      expect(result.brand_favicon_storage_path).toBe('');
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('fetchBrandFaviconSettings', () => {
    it('reads favicon keys from site_settings', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { key: BRAND_FAVICON_URL_KEY, value: 'https://cdn.example/favicon/x.png' },
          { key: BRAND_FAVICON_STORAGE_PATH_KEY, value: 'favicon/x.png' },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await fetchBrandFaviconSettings();
      expect(result.brand_favicon_url).toContain('favicon/x.png');
      expect(result.brand_favicon_storage_path).toBe('favicon/x.png');
    });
  });
});
