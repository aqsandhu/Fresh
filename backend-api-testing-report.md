# FreshBazar Backend API Testing Report

## Executive Summary

This report provides a comprehensive analysis of the FreshBazar grocery delivery platform backend API. The codebase is well-structured with good separation of concerns, but several critical, high, medium, and low severity issues have been identified that require attention.

---

## Issues Summary by Severity

| Severity | Count | Categories |
|----------|-------|------------|
| Critical | 5 | Security vulnerabilities, data integrity issues |
| High | 8 | Missing validations, business logic errors |
| Medium | 12 | Missing features, incomplete implementations |
| Low | 10 | Code quality, missing optimizations |

---

## Critical Issues (Immediate Fix Required)

### 1. SQL Injection Vulnerability in Dynamic Query Building
**File:** `backend/src/controllers/product.controller.ts`  
**Line:** 81-107  
**Severity:** CRITICAL

**Issue:** The `sortBy` and `sortOrder` parameters are directly interpolated into SQL queries without proper sanitization:

```typescript
// VULNERABLE CODE (Line 102):
ORDER BY p.${sortField} ${order}
```

**Attack Vector:** An attacker could inject malicious SQL through the `sortBy` parameter.

**Suggested Fix:**
```typescript
// Use a whitelist approach
const allowedSortFields = ['created_at', 'price', 'name_en', 'popularity', 'view_count'];
const sortField = allowedSortFields.includes(sortBy as string) ? sortBy : 'created_at';
const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

// Use parameterized query for the entire ORDER BY clause
const productsSql = `
  SELECT ...
  ${sql}
  ORDER BY ${sortField === 'name_en' ? 'p.name_en' : 'p.' + sortField} ${order}
  LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
`;
```

---

### 2. Missing Input Sanitization in Search Queries
**File:** `backend/src/controllers/product.controller.ts`  
**Line:** 46-55, 294-328  
**Severity:** CRITICAL

**Issue:** Search terms are directly used in SQL LIKE clauses without sanitization:

```typescript
// VULNERABLE CODE:
params.push(`%${search}%`);
```

**Suggested Fix:**
```typescript
import { sanitizeString } from '../utils/validators';

// Sanitize search term before using in query
const sanitizedSearch = sanitizeString(search as string).replace(/[%_]/g, '\\$&');
params.push(`%${sanitizedSearch}%`);
```

---

### 3. No Rate Limiting on Public Product Endpoints
**File:** `backend/src/routes/product.routes.ts`  
**Severity:** CRITICAL

**Issue:** Public product endpoints lack rate limiting, making them vulnerable to scraping and DDoS attacks.

**Suggested Fix:**
```typescript
import { createRateLimiter } from '../middleware';

// Add product-specific rate limiter
const productRateLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  30, // 30 requests per minute
  'Too many product requests, please try again later'
);

router.get('/', optionalAuth, productRateLimiter, validate(productSchemas.list), productController.getProducts);
router.get('/search', optionalAuth, productRateLimiter, productController.searchProducts);
```

---

### 4. Missing Authorization Check in Order Tracking
**File:** `backend/src/controllers/order.controller.ts`  
**Line:** 149-203  
**Severity:** CRITICAL

**Issue:** The `trackOrder` endpoint is public but doesn't verify if the requester should have access to the order details.

**Suggested Fix:**
```typescript
export const trackOrder = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  // If user is authenticated, verify ownership
  if (req.user) {
    const ownershipCheck = await query(
      'SELECT 1 FROM orders WHERE id = $1 AND (user_id = $2 OR EXISTS (SELECT 1 FROM riders WHERE user_id = $2 AND id = orders.rider_id))',
      [id, req.user.id]
    );
    if (ownershipCheck.rows.length === 0) {
      return unauthorizedResponse(res, 'Not authorized to track this order');
    }
  }
  
  // Return limited info for public access
  const result = await query(
    `SELECT o.id, o.order_number, o.status, o.placed_at
     FROM orders o
     WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [id]
  );
  
  // ... rest of the implementation
});
```

---

### 5. Insecure Direct Object Reference (IDOR) in Cart Operations
**File:** `backend/src/controllers/cart.controller.ts`  
**Line:** 90-214  
**Severity:** CRITICAL

**Issue:** Cart operations don't properly validate that the cart belongs to the authenticated user in all paths.

**Suggested Fix:**
```typescript
// Add cart ownership verification helper
const verifyCartOwnership = async (cartId: string, userId: string): Promise<boolean> => {
  const result = await query(
    'SELECT 1 FROM carts WHERE id = $1 AND user_id = $2',
    [cartId, userId]
  );
  return result.rows.length > 0;
};

// Use in addToCart
if (!(await verifyCartOwnership(cart.id, req.user!.id))) {
  throw new UnauthorizedError('Cart does not belong to user');
}
```

---

## High Severity Issues

### 6. Missing Stock Decrement on Order Creation
**File:** `backend/src/controllers/order.controller.ts`  
**Line:** 209-383  
**Severity:** HIGH

**Issue:** When an order is created, product stock is not decremented, leading to overselling.

**Suggested Fix:**
```typescript
// In createOrder, after creating order items:
for (const item of cartItemsResult.rows) {
  // ... existing code ...
  
  // Decrement stock
  const stockUpdate = await client.query(
    `UPDATE products 
     SET stock_quantity = stock_quantity - $1,
         stock_status = CASE 
           WHEN stock_quantity - $1 <= 0 THEN 'out_of_stock'
           WHEN stock_quantity - $1 <= low_stock_threshold THEN 'low_stock'
           ELSE stock_status
         END
     WHERE id = $2 AND stock_quantity >= $1
     RETURNING stock_quantity`,
    [item.quantity, item.product_id]
  );
  
  if (stockUpdate.rows.length === 0) {
    throw new Error(`Insufficient stock for product ${item.product_id}`);
  }
}
```

---

### 7. Missing Validation for Order Cancellation Timing
**File:** `backend/src/controllers/order.controller.ts`  
**Line:** 389-436  
**Severity:** HIGH

**Issue:** Orders can be cancelled without checking if they've already been prepared or dispatched.

**Suggested Fix:**
```typescript
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  // ... existing code ...
  
  const order = orderResult.rows[0];
  
  // Add time-based cancellation window (e.g., 5 minutes after placing)
  const placedAt = new Date(order.placed_at);
  const now = new Date();
  const minutesSincePlaced = (now.getTime() - placedAt.getTime()) / (1000 * 60);
  
  if (minutesSincePlaced > 5 && order.status !== 'pending') {
    throw new Error('Order can only be cancelled within 5 minutes of placing or while pending');
  }
  
  // ... rest of implementation
});
```

---

### 8. Missing Rider Availability Check Before Assignment
**File:** `backend/src/controllers/admin.controller.ts`  
**Line:** 285-342  
**Severity:** HIGH

**Issue:** The `assignRider` function doesn't check if the rider is currently available before assignment.

**Suggested Fix:**
```typescript
export const assignRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { rider_id } = req.body;
  
  // Check if rider exists and is available
  const riderResult = await query(
    `SELECT r.id, r.status, u.full_name 
     FROM riders r
     JOIN users u ON r.user_id = u.id
     WHERE r.id = $1 AND r.verification_status = 'verified' AND r.status = 'available'`,
    [rider_id]
  );
  
  if (riderResult.rows.length === 0) {
    return notFoundResponse(res, 'Rider not found, not verified, or not available');
  }
  
  // ... rest of implementation
});
```

---

### 9. Missing Password Validation in Admin Login
**File:** `backend/src/controllers/auth.controller.ts`  
**Line:** 500-554  
**Severity:** HIGH

**Issue:** Admin login doesn't check if the password is null/empty before comparing.

**Suggested Fix:**
```typescript
export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  // ... existing code ...
  
  const user = result.rows[0];
  
  // Check if password exists
  if (!user.password_hash) {
    return unauthorizedResponse(res, 'Invalid credentials');
  }
  
  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  
  // ... rest of implementation
});
```

---

### 10. Missing Transaction in Product Stock Update
**File:** `backend/src/controllers/cart.controller.ts`  
**Line:** 90-214  
**Severity:** HIGH

**Issue:** Stock check and cart addition are not in the same transaction, creating race conditions.

**Suggested Fix:**
```typescript
export const addToCart = asyncHandler(async (req: Request, res: Response) => {
  // ... existing code ...
  
  await withTransaction(async (client) => {
    // Lock the product row for update
    const productResult = await client.query(
      `SELECT id, price, stock_quantity, stock_status, unit_value
       FROM products 
       WHERE id = $1 AND is_active = TRUE
       FOR UPDATE`,  // Add row lock
      [product_id]
    );
    
    // ... rest of implementation
  });
});
```

---

### 11. Missing Webhook Signature Verification
**File:** `backend/src/controllers/webhook.controller.ts`  
**Line:** 175-187  
**Severity:** HIGH

**Issue:** The `verifyWebhookSignature` function always returns `true`, making webhooks vulnerable to spoofing.

**Suggested Fix:**
```typescript
const verifyWebhookSignature = (payload: any, signature: string): boolean => {
  const crypto = require('crypto');
  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    logger.warn('WEBHOOK_SECRET not configured, accepting webhook without verification');
    return true;
  }
  
  if (!signature) {
    return false;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  // Use timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};
```

---

### 12. Missing Input Validation in Delivery Charge Calculation
**File:** `backend/src/utils/deliveryCalculator.ts`  
**Line:** 23-181  
**Severity:** HIGH

**Issue:** The `cartId` parameter is not validated before being used in SQL queries.

**Suggested Fix:**
```typescript
import { isValidUUID } from '../utils/validators';

export const calculateDeliveryCharge = async (
  cartId: string,
  timeSlotId?: string,
  orderTime: Date = new Date()
): Promise<DeliveryChargeResult> => {
  // Validate cartId
  if (!isValidUUID(cartId)) {
    throw new Error('Invalid cart ID format');
  }
  
  // Validate timeSlotId if provided
  if (timeSlotId && !isValidUUID(timeSlotId)) {
    throw new Error('Invalid time slot ID format');
  }
  
  // ... rest of implementation
};
```

---

### 13. Missing Error Handling in JWT Verification
**File:** `backend/src/config/jwt.ts`  
**Line:** 51-58  
**Severity:** HIGH

**Issue:** JWT verification doesn't handle all error cases properly.

**Suggested Fix:**
```typescript
export const verifyAccessToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, jwtSecret) as JwtPayload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw new Error('Token verification failed');
  }
};
```

---

## Medium Severity Issues

### 14. Missing Coupon Implementation
**File:** `backend/src/controllers/cart.controller.ts`  
**Line:** 419-429  
**Severity:** MEDIUM

**Issue:** Coupon functionality is not implemented (returns hardcoded error).

**Suggested Fix:**
```typescript
export const applyCoupon = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }
  
  const { coupon_code } = req.body;
  const cart = await getOrCreateCart(req.user.id);
  
  // Validate coupon
  const couponResult = await query(
    `SELECT * FROM coupons 
     WHERE code = $1 
     AND is_active = TRUE
     AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
     AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
     AND (usage_limit IS NULL OR usage_count < usage_limit)`,
    [coupon_code.toUpperCase()]
  );
  
  if (couponResult.rows.length === 0) {
    return errorResponse(res, 'Invalid or expired coupon code', 400);
  }
  
  const coupon = couponResult.rows[0];
  
  // Check minimum order value
  if (parseFloat(cart.subtotal) < parseFloat(coupon.min_order_value || 0)) {
    return errorResponse(res, `Minimum order value of Rs. ${coupon.min_order_value} required`, 400);
  }
  
  // Calculate discount
  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = parseFloat(cart.subtotal) * (parseFloat(coupon.discount_value) / 100);
    if (coupon.max_discount) {
      discount = Math.min(discount, parseFloat(coupon.max_discount));
    }
  } else {
    discount = parseFloat(coupon.discount_value);
  }
  
  // Update cart
  await query(
    `UPDATE carts 
     SET coupon_code = $1, 
         coupon_discount = $2,
         total_amount = subtotal + delivery_charge - discount_amount - $2,
         updated_at = NOW()
     WHERE id = $3`,
    [coupon_code, discount, cart.id]
  );
  
  // Increment coupon usage
  await query(
    'UPDATE coupons SET usage_count = usage_count + 1 WHERE id = $1',
    [coupon.id]
  );
  
  successResponse(res, { discount, coupon_code }, 'Coupon applied successfully');
});
```

---

### 15. Missing Address Coordinates Update
**File:** `backend/src/controllers/address.controller.ts`  
**Line:** 143-241  
**Severity:** MEDIUM

**Issue:** When updating an address, latitude and longitude cannot be updated.

**Suggested Fix:**
```typescript
export const updateAddress = asyncHandler(async (req: Request, res: Response) => {
  // ... existing code ...
  
  const {
    address_type,
    written_address,
    landmark,
    latitude,  // Add these
    longitude, // Add these
    // ... rest
  } = req.body;
  
  // ... existing code ...
  
  // Add location update if coordinates provided
  if (latitude !== undefined && longitude !== undefined) {
    updates.push(`location = ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography`);
    values.push(longitude, latitude);
    
    // Update zone based on new location
    const zoneResult = await query(
      `SELECT id FROM delivery_zones 
       WHERE is_active = TRUE 
       AND (boundary IS NULL OR ST_Within(
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography::geometry,
         boundary::geometry
       ))
       LIMIT 1`,
      [longitude, latitude]
    );
    
    if (zoneResult.rows.length > 0) {
      updates.push(`zone_id = $${paramIndex++}`);
      values.push(zoneResult.rows[0].id);
    }
  }
  
  // ... rest of implementation
});
```

---

### 16. Missing Pagination in Featured Products
**File:** `backend/src/controllers/product.controller.ts`  
**Line:** 210-227  
**Severity:** MEDIUM

**Issue:** Featured products endpoint doesn't support pagination.

**Suggested Fix:**
```typescript
export const getFeaturedProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
  
  const countResult = await query(
    'SELECT COUNT(*) FROM products WHERE is_active = TRUE AND is_featured = TRUE'
  );
  const total = parseInt(countResult.rows[0].count);
  
  const result = await query(
    `SELECT 
      p.id, p.name_ur, p.name_en, p.slug, p.price, p.compare_at_price,
      p.unit_type, p.unit_value, p.stock_quantity, p.primary_image,
      c.name_en as category_name, c.slug as category_slug
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = TRUE AND p.is_featured = TRUE
    ORDER BY p.created_at DESC, p.is_featured DESC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  
  paginatedResponse(res, result.rows, parseInt(page as string), parseInt(limit as string), total, 'Featured products retrieved successfully');
});
```

---

### 17. Missing Soft Delete for Products
**File:** `backend/src/controllers/admin.controller.ts`  
**Line:** 537-551  
**Severity:** MEDIUM

**Issue:** Product deletion only sets `is_active = FALSE` but doesn't set `deleted_at` timestamp.

**Suggested Fix:**
```typescript
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const result = await query(
    `UPDATE products 
     SET is_active = FALSE, 
         deleted_at = NOW(),
         updated_at = NOW() 
     WHERE id = $1 
     RETURNING id`,
    [id]
  );
  
  // ... rest of implementation
});
```

---

### 18. Missing Order Number Generation
**File:** `backend/src/controllers/order.controller.ts`  
**Line:** 209-383  
**Severity:** MEDIUM

**Issue:** Order creation doesn't explicitly generate an order number (relies on database default).

**Suggested Fix:**
```typescript
import { generateOrderNumber } from '../utils/validators';

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  // ... existing code ...
  
  const orderNumber = generateOrderNumber();
  
  const orderResult = await client.query(
    `INSERT INTO orders (
      order_number, user_id, address_id, ...
    ) VALUES (
      $1, $2, $3, ...
    ) RETURNING *`,
    [orderNumber, req.user!.id, address_id, ...]
  );
  
  // ... rest of implementation
});
```

---

### 19. Missing Notification System Integration
**File:** Multiple files  
**Severity:** MEDIUM

**Issue:** No notification system is integrated for order status updates, rider assignments, etc.

**Suggested Implementation:**
```typescript
// Create notification service
// backend/src/services/notification.service.ts

import { query } from '../config/database';
import logger from '../utils/logger';

export const createNotification = async (
  userId: string,
  type: string,
  title: string,
  message: string,
  orderId?: string
): Promise<void> => {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, order_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, orderId]
    );
    
    // TODO: Integrate with push notification service (Firebase, OneSignal, etc.)
    // TODO: Integrate with SMS service for critical notifications
  } catch (error) {
    logger.error('Failed to create notification', { error, userId, type });
  }
};
```

---

### 20. Missing Order Item Status Management
**File:** `backend/src/controllers/order.controller.ts`  
**Severity:** MEDIUM

**Issue:** Order items don't have individual status tracking for partial fulfillment.

**Suggested Fix:**
```typescript
// Add endpoint for updating individual item status
export const updateOrderItemStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }
  
  const { orderId, itemId } = req.params;
  const { status, reason } = req.body;
  
  const validStatuses = ['pending', 'picked', 'packed', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
  if (!validStatuses.includes(status)) {
    return errorResponse(res, 'Invalid status', 400);
  }
  
  await query(
    `UPDATE order_items 
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND order_id = $3
     RETURNING *`,
    [status, itemId, orderId]
  );
  
  successResponse(res, null, 'Item status updated successfully');
});
```

---

### 21. Missing Rider Task Batch Assignment
**File:** `backend/src/controllers/admin.controller.ts`  
**Severity:** MEDIUM

**Issue:** No batch assignment for multiple orders to a single rider.

**Suggested Fix:**
```typescript
export const batchAssignRider = asyncHandler(async (req: Request, res: Response) => {
  const { order_ids, rider_id } = req.body;
  
  if (!Array.isArray(order_ids) || order_ids.length === 0) {
    return errorResponse(res, 'Order IDs array required', 400);
  }
  
  const results = await withTransaction(async (client) => {
    const batchId = uuidv4();
    const tasks = [];
    
    for (let i = 0; i < order_ids.length; i++) {
      const orderId = order_ids[i];
      
      // Update order
      await client.query(
        `UPDATE orders 
         SET rider_id = $1, assigned_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [rider_id, orderId]
      );
      
      // Create rider task with sequence
      const taskResult = await client.query(
        `INSERT INTO rider_tasks (rider_id, task_type, order_id, status, assigned_at, sequence_number, batch_id)
         VALUES ($1, 'delivery', $2, 'assigned', NOW(), $3, $4)
         RETURNING *`,
        [rider_id, orderId, i + 1, batchId]
      );
      
      tasks.push(taskResult.rows[0]);
    }
    
    return { batchId, tasks };
  });
  
  successResponse(res, results, 'Batch assignment completed');
});
```

---

### 22. Missing Atta Request Number Generation
**File:** `backend/src/controllers/atta.controller.ts`  
**Line:** 15-67  
**Severity:** MEDIUM

**Issue:** Atta request creation doesn't generate a request number.

**Suggested Fix:**
```typescript
import { generateAttaRequestNumber } from '../utils/validators';

export const createAttaRequest = asyncHandler(async (req: Request, res: Response) => {
  // ... existing code ...
  
  const requestNumber = generateAttaRequestNumber();
  
  const result = await query(
    `INSERT INTO atta_requests (
      request_number, user_id, address_id, ...
    ) VALUES ($1, $2, $3, ...)
    RETURNING *`,
    [requestNumber, req.user!.id, address_id, ...]
  );
  
  // ... rest of implementation
});
```

---

### 23. Missing File Size Validation in Upload
**File:** `backend/src/middleware/upload.ts`  
**Line:** 52-60  
**Severity:** MEDIUM

**Issue:** File size validation only happens after upload, not before.

**Suggested Fix:**
```typescript
// Add pre-upload validation
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Check file size from headers if available
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength > MAX_FILE_SIZE) {
      return cb(new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`));
    }
    
    // Check file type
    if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`));
    }
  },
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },
});
```

---

### 24. Missing Request Logging for Sensitive Operations
**File:** Multiple files  
**Severity:** MEDIUM

**Issue:** Sensitive operations like password changes, order cancellations don't have audit logging.

**Suggested Fix:**
```typescript
// Add audit logging helper
const logAudit = async (
  action: string,
  userId: string,
  resourceType: string,
  resourceId: string,
  details?: any
): Promise<void> => {
  await query(
    `INSERT INTO audit_logs (action, user_id, resource_type, resource_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [action, userId, resourceType, resourceId, JSON.stringify(details), '', '']
  );
};

// Use in sensitive operations
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  // ... existing code ...
  
  await logAudit('password_change', req.user!.id, 'user', req.user!.id, { success: true });
  
  successResponse(res, null, 'Password changed successfully');
});
```

---

### 25. Missing Health Check for External Services
**File:** `backend/src/app.ts`  
**Line:** 118-128  
**Severity:** MEDIUM

**Issue:** Health check only verifies database, not external services like Twilio.

**Suggested Fix:**
```typescript
app.get('/health', async (req: Request, res: Response) => {
  const checks = {
    database: false,
    twilio: false,
    // Add more services as needed
  };
  
  // Check database
  checks.database = await testConnection().catch(() => false);
  
  // Check Twilio (optional - don't fail if not configured)
  checks.twilio = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
  
  const allHealthy = checks.database;
  
  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    message: allHealthy ? 'Service is healthy' : 'Some services are unhealthy',
    checks,
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});
```

---

## Low Severity Issues

### 26. Missing API Documentation
**File:** All route files  
**Severity:** LOW

**Issue:** No API documentation (Swagger/OpenAPI) is implemented.

**Suggested Fix:**
```typescript
// Install swagger-ui-express and swagger-jsdoc
// npm install swagger-ui-express swagger-jsdoc

import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FreshBazar API',
      version: '1.0.0',
      description: 'Pakistani Grocery Delivery Platform API',
    },
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

---

### 27. Missing CORS Preflight Handling
**File:** `backend/src/app.ts`  
**Line:** 51-72  
**Severity:** LOW

**Issue:** CORS preflight requests might not be handled properly for all routes.

**Suggested Fix:**
```typescript
// Add explicit OPTIONS handler
app.options('*', cors(corsOptions));

// Or use cors middleware with preflight
app.use(cors({
  ...corsOptions,
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));
```

---

### 28. Missing Response Compression Configuration
**File:** `backend/src/app.ts` 
**Line:** 98  
**Severity:** LOW

**Issue:** Compression is enabled without configuration for optimal performance.

**Suggested Fix:**
```typescript
import compression from 'compression';

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Balance between compression and CPU usage
}));
```

---

### 29. Missing Request ID for Tracing
**File:** `backend/src/app.ts`  
**Severity:** LOW

**Issue:** No request ID is generated for request tracing across logs.

**Suggested Fix:**
```typescript
import { v4 as uuidv4 } from 'uuid';

// Add request ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Update logger to include request ID
logger.info('Request started', { requestId: req.id, path: req.path });
```

---

### 30. Missing Environment Variable Validation
**File:** `backend/src/app.ts`  
**Severity:** LOW

**Issue:** Required environment variables are not validated at startup.

**Suggested Fix:**
```typescript
// Create config validation
const requiredEnvVars = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
];

const validateEnv = () => {
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
};

validateEnv();
```

---

### 31. Missing Database Connection Retry Logic
**File:** `backend/src/config/database.ts`  
**Line:** 96-107  
**Severity:** LOW

**Issue:** No retry logic for database connection failures.

**Suggested Fix:**
```typescript
export const testConnection = async (retries = 3, delay = 5000): Promise<boolean> => {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await query('SELECT NOW() as current_time');
      logger.info('Database connected successfully', { 
        time: result.rows[0].current_time 
      });
      return true;
    } catch (error) {
      logger.error(`Database connection attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        logger.info(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
};
```

---

### 32. Missing Type Safety in Query Parameters
**File:** Multiple controllers  
**Severity:** LOW

**Issue:** Query parameters are cast to strings without type checking.

**Suggested Fix:**
```typescript
// Use type guards
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && !isNaN(value);

// In controllers:
const page = isNumber(req.query.page) ? req.query.page : 1;
const search = isString(req.query.search) ? req.query.search : '';
```

---

### 33. Missing Index on Frequently Queried Columns
**File:** Database schema (not in code)  
**Severity:** LOW

**Suggested Indexes:**
```sql
-- Add these indexes for better performance
CREATE INDEX idx_orders_user_id_status ON orders(user_id, status);
CREATE INDEX idx_orders_status_placed_at ON orders(status, placed_at);
CREATE INDEX idx_products_category_id_active ON products(category_id, is_active);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX idx_addresses_user_id_default ON addresses(user_id, is_default);
CREATE INDEX idx_rider_tasks_rider_id_status ON rider_tasks(rider_id, status);
```

---

### 34. Missing Graceful Shutdown for Active Requests
**File:** `backend/src/app.ts`  
**Line:** 181-195  
**Severity:** LOW

**Issue:** Active requests might be terminated during shutdown.

**Suggested Fix:**
```typescript
import http from 'http';

const server = http.createServer(app);

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    // Close database pool
    await closePool();
    logger.info('Database connections closed');
    
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);
};
```

---

### 35. Missing Input Trimming
**File:** Multiple controllers  
**Severity:** LOW

**Issue:** String inputs are not trimmed before validation and storage.

**Suggested Fix:**
```typescript
// Add trim middleware
const trimBody = (req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    }
  }
  next();
};

app.use(trimBody);
```

---

## Positive Findings

### Security Best Practices Implemented

1. **Password Hashing**: Using bcrypt with 12 rounds (`SALT_ROUNDS = 12`)
2. **JWT Implementation**: Proper access and refresh token separation
3. **Rate Limiting**: Multiple rate limiters for different endpoints
4. **CORS Configuration**: Proper origin validation
5. **Helmet Security Headers**: Enabled for production
6. **SQL Parameterization**: Most queries use parameterized statements
7. **Soft Deletes**: Implemented for users, addresses, and products
8. **Transaction Support**: Using `withTransaction` for multi-step operations

### Code Quality

1. **Consistent Error Handling**: Custom error classes with proper HTTP status codes
2. **Logging**: Comprehensive logging with Winston
3. **Type Safety**: TypeScript interfaces for all entities
4. **Middleware Pattern**: Clean separation of concerns
5. **Response Helpers**: Consistent API response format

---

## Recommendations Summary

### Immediate Actions (Critical & High Priority)

1. Fix SQL injection vulnerabilities in product controller
2. Implement proper webhook signature verification
3. Add stock decrement on order creation
4. Fix rider availability check before assignment
5. Add transaction wrapping for stock-sensitive operations

### Short-term (Medium Priority)

1. Implement coupon functionality
2. Add notification system
3. Create audit logging for sensitive operations
4. Add batch rider assignment
5. Implement order item status tracking

### Long-term (Low Priority)

1. Add API documentation (Swagger)
2. Implement request tracing
3. Add database query performance monitoring
4. Create comprehensive test suite
5. Add CI/CD pipeline

---

## Files Analyzed

| File Path | Lines | Issues Found |
|-----------|-------|--------------|
| `backend/src/app.ts` | 212 | 4 |
| `backend/src/config/database.ts` | 116 | 1 |
| `backend/src/config/jwt.ts` | 114 | 1 |
| `backend/src/controllers/auth.controller.ts` | 624 | 2 |
| `backend/src/controllers/product.controller.ts` | 329 | 4 |
| `backend/src/controllers/cart.controller.ts` | 453 | 4 |
| `backend/src/controllers/order.controller.ts` | 464 | 4 |
| `backend/src/controllers/address.controller.ts` | 302 | 2 |
| `backend/src/controllers/rider.controller.ts` | 521 | 1 |
| `backend/src/controllers/atta.controller.ts` | 262 | 1 |
| `backend/src/controllers/admin.controller.ts` | 953 | 3 |
| `backend/src/controllers/webhook.controller.ts` | 221 | 1 |
| `backend/src/controllers/category.controller.ts` | 132 | 0 |
| `backend/src/middleware/auth.ts` | 184 | 0 |
| `backend/src/middleware/validation.ts` | 330 | 0 |
| `backend/src/middleware/errorHandler.ts` | 185 | 0 |
| `backend/src/middleware/rateLimiter.ts` | 141 | 0 |
| `backend/src/middleware/upload.ts` | 136 | 1 |
| `backend/src/utils/deliveryCalculator.ts` | 254 | 1 |
| `backend/src/utils/validators.ts` | 175 | 0 |
| `backend/src/services/otp.service.ts` | 98 | 0 |

---

## Conclusion

The FreshBazar backend API is well-structured with good security practices in place. However, several critical and high-priority issues need immediate attention, particularly around SQL injection vulnerabilities, stock management, and webhook security. Addressing these issues will significantly improve the security and reliability of the platform.

---

*Report generated on: 2024*  
*Total Issues Found: 35*  
*Critical: 5 | High: 8 | Medium: 12 | Low: 10*
