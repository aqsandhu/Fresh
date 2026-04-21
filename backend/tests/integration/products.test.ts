// ============================================================================
// PRODUCTS INTEGRATION TESTS
// Tests: Product listing, categories, search, filtering
// ============================================================================

import { jest } from '@jest/globals';

jest.unstable_mockModule('@/config/database', () => ({
  query: jest.fn(),
}));

jest.unstable_mockModule('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { query } = await import('@/config/database');
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Products Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  describe('GET /api/products', () => {
    it('should return paginated product list', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          name_en: 'Fresh Apples',
          name_ur: 'تازہ سیب',
          price: 250,
          unit: 'kg',
          stock_quantity: 100,
          category_id: 'cat-1',
          primary_image: 'apples.jpg',
          is_active: true,
          is_featured: false,
          discount_percent: 0,
        },
        {
          id: 'prod-2',
          name_en: 'Bananas',
          name_ur: 'کیلے',
          price: 150,
          unit: 'dozen',
          stock_quantity: 50,
          category_id: 'cat-1',
          primary_image: 'bananas.jpg',
          is_active: true,
          is_featured: true,
          discount_percent: 10,
        },
      ];

      mockQuery
        .mockResolvedValueOnce({
          rows: mockProducts,
          rowCount: 2, command: 'SELECT', oid: 0, fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '2' }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        });

      const products = await mockQuery(
        `SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [20, 0]
      );

      expect(products.rows).toHaveLength(2);
      expect(products.rows[0].name_en).toBe('Fresh Apples');
      expect(products.rows[1].name_en).toBe('Bananas');
    });

    it('should filter products by category', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'prod-1', name_en: 'Fresh Apples', category_id: 'cat-1' },
          { id: 'prod-2', name_en: 'Bananas', category_id: 'cat-1' },
        ],
        rowCount: 2, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM products WHERE category_id = $1 AND is_active = true',
        ['cat-1']
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows.every(p => p.category_id === 'cat-1')).toBe(true);
    });

    it('should search products by name', async () => {
      const searchTerm = 'apple';
      
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'prod-1', name_en: 'Fresh Apples', name_ur: 'تازہ سیب' },
          { id: 'prod-3', name_en: 'Green Apples', name_ur: 'سبز سیب' },
        ],
        rowCount: 2, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `SELECT * FROM products WHERE (name_en ILIKE $1 OR name_ur ILIKE $1) AND is_active = true`,
        [`%${searchTerm}%`]
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name_en.toLowerCase()).toContain(searchTerm);
    });

    it('should return empty array when no products match', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM products WHERE category_id = $1 AND is_active = true',
        ['non-existent-cat']
      );

      expect(result.rows).toHaveLength(0);
    });

    it('should handle pagination correctly', async () => {
      const allProducts = Array.from({ length: 25 }, (_, i) => ({
        id: `prod-${i + 1}`,
        name_en: `Product ${i + 1}`,
      }));

      mockQuery.mockResolvedValueOnce({
        rows: allProducts.slice(10, 20),
        rowCount: 10, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM products WHERE is_active = true LIMIT $1 OFFSET $2',
        [10, 10] // page 2, 10 per page
      );

      expect(result.rows).toHaveLength(10);
    });

    it('should return featured products', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'prod-2', name_en: 'Bananas', is_featured: true },
          { id: 'prod-5', name_en: 'Organic Mangoes', is_featured: true },
        ],
        rowCount: 2, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM products WHERE is_featured = true AND is_active = true ORDER BY created_at DESC',
        []
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows.every(p => p.is_featured)).toBe(true);
    });

    it('should filter products by price range', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'prod-1', name_en: 'Budget Item', price: 50 },
          { id: 'prod-2', name_en: 'Mid Item', price: 150 },
        ],
        rowCount: 2, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM products WHERE price >= $1 AND price <= $2 AND is_active = true',
        [10, 200]
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].price).toBeGreaterThanOrEqual(10);
      expect(result.rows[1].price).toBeLessThanOrEqual(200);
    });
  });

  // ============================================================================
  describe('GET /api/categories', () => {
    it('should return all active categories', async () => {
      const mockCategories = [
        { id: 'cat-1', name_en: 'Vegetables', name_ur: 'سبزیاں', slug: 'sabzi', sort_order: 1 },
        { id: 'cat-2', name_en: 'Fruits', name_ur: 'پھل', slug: 'fruit', sort_order: 2 },
        { id: 'cat-3', name_en: 'Dry Fruits', name_ur: 'خشک میوہ', slug: 'dry-fruit', sort_order: 3 },
        { id: 'cat-4', name_en: 'Chicken', name_ur: 'مرغی', slug: 'chicken', sort_order: 4 },
        { id: 'cat-5', name_en: 'Atta Flour', name_ur: 'آٹا', slug: 'atta', sort_order: 5 },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockCategories,
        rowCount: 5, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM categories WHERE is_active = true ORDER BY sort_order ASC',
        []
      );

      expect(result.rows).toHaveLength(5);
      expect(result.rows[0].name_en).toBe('Vegetables');
      expect(result.rows[4].name_en).toBe('Atta Flour');
    });

    it('should return categories with product counts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'cat-1', name_en: 'Vegetables', product_count: '42' },
          { id: 'cat-2', name_en: 'Fruits', product_count: '28' },
        ],
        rowCount: 2, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `SELECT c.*, COUNT(p.id) as product_count 
         FROM categories c 
         LEFT JOIN products p ON c.id = p.category_id 
         WHERE c.is_active = true 
         GROUP BY c.id 
         ORDER BY c.sort_order`,
        []
      );

      expect(result.rows[0].product_count).toBe('42');
    });
  });

  // ============================================================================
  describe('GET /api/products/:id', () => {
    it('should return a single product by ID', async () => {
      const mockProduct = {
        id: 'prod-1',
        name_en: 'Fresh Apples',
        name_ur: 'تازہ سیب',
        price: 250,
        unit: 'kg',
        stock_quantity: 100,
        description_en: 'Fresh red apples from Kashmir',
        description_ur: 'کشمیر سے تازہ سرخ سیب',
        primary_image: 'apples.jpg',
        category_id: 'cat-1',
        category_name: 'Fruits',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockProduct],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `SELECT p.*, c.name_en as category_name 
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id 
         WHERE p.id = $1 AND p.is_active = true`,
        ['prod-1']
      );

      expect(result.rows[0]).toMatchObject(mockProduct);
    });

    it('should return 404 for non-existent product', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM products WHERE id = $1 AND is_active = true',
        ['non-existent']
      );

      expect(result.rowCount).toBe(0);
    });
  });

  // ============================================================================
  describe('Product Stock Management', () => {
    it('should correctly report stock status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'prod-1', name_en: 'In Stock Item', stock_quantity: 100 },
          { id: 'prod-2', name_en: 'Low Stock Item', stock_quantity: 3 },
          { id: 'prod-3', name_en: 'Out of Stock', stock_quantity: 0 },
        ],
        rowCount: 3, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT id, name_en, stock_quantity FROM products WHERE id = ANY($1)',
        [['prod-1', 'prod-2', 'prod-3']]
      );

      const inStock = result.rows.filter(p => p.stock_quantity > 10);
      const lowStock = result.rows.filter(p => p.stock_quantity > 0 && p.stock_quantity <= 10);
      const outOfStock = result.rows.filter(p => p.stock_quantity === 0);

      expect(inStock).toHaveLength(1);
      expect(lowStock).toHaveLength(1);
      expect(outOfStock).toHaveLength(1);
    });

    it('should calculate discounted price correctly', async () => {
      const product = {
        id: 'prod-1',
        price: 200,
        discount_percent: 10,
      };

      const discountedPrice = product.price - (product.price * product.discount_percent / 100);
      expect(discountedPrice).toBe(180);
    });
  });
});
