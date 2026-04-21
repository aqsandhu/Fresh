// ============================================================================
// COMPREHENSIVE API TEST SCRIPT - FreshBazar
// ============================================================================

const http = require('http');

const BASE = 'http://localhost:3000/api';
let ADMIN_TOKEN = '';
let CUSTOMER_TOKEN = '';
let CUSTOMER_ID = '';
let CATEGORY_ID = '';
let PRODUCT_ID = '';
let ADDRESS_ID = '';
let ORDER_ID = '';
let ATTA_REQUEST_ID = '';

const results = [];

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function log(test, status, pass, detail = '') {
  const icon = pass ? '✅' : '❌';
  const line = `${icon} [${status}] ${test}${detail ? ' - ' + detail : ''}`;
  console.log(line);
  results.push({ test, pass, status, detail });
}

async function runTests() {
  console.log('\n========================================');
  console.log('  FRESHBAZAR API COMPREHENSIVE TESTS');
  console.log('========================================\n');

  // ==================== AUTH TESTS ====================
  console.log('--- AUTH TESTS ---');

  // 1. Admin Login
  let r = await request('POST', '/admin/login', { phone: '+923001234567', password: 'admin123' });
  if (r.body.success && r.body.data?.tokens?.accessToken) {
    ADMIN_TOKEN = r.body.data.tokens.accessToken;
    log('Admin Login', r.status, true);
  } else {
    log('Admin Login', r.status, false, JSON.stringify(r.body));
  }

  // 2. Register Customer
  r = await request('POST', '/auth/register', {
    phone: '+923009876543',
    full_name: 'Test Customer',
    password: 'Test@1234',
  });
  if (r.body.success) {
    CUSTOMER_TOKEN = r.body.data?.tokens?.accessToken;
    CUSTOMER_ID = r.body.data?.user?.id;
    log('Register Customer', r.status, true);
  } else if (r.body.message?.includes('already exists')) {
    // Customer already exists, login instead
    r = await request('POST', '/auth/login', { phone: '+923009876543', password: 'Test@1234' });
    if (r.body.success) {
      CUSTOMER_TOKEN = r.body.data?.tokens?.accessToken;
      CUSTOMER_ID = r.body.data?.user?.id;
      log('Register Customer (exists, logged in)', r.status, true);
    } else {
      log('Register/Login Customer', r.status, false, r.body.message);
    }
  } else {
    log('Register Customer', r.status, false, JSON.stringify(r.body));
  }

  // 3. Get Me (Customer)
  r = await request('GET', '/auth/me', null, CUSTOMER_TOKEN);
  log('GET /auth/me (Customer)', r.status, r.body.success === true, r.body.message);

  // 4. Get Me (Admin)
  r = await request('GET', '/auth/me', null, ADMIN_TOKEN);
  log('GET /auth/me (Admin)', r.status, r.body.success === true, r.body.message);

  // 5. Token Refresh
  // First get a refresh token
  const loginR = await request('POST', '/auth/login', { phone: '+923009876543', password: 'Test@1234' });
  if (loginR.body.success && loginR.body.data?.tokens?.refreshToken) {
    r = await request('POST', '/auth/refresh', { refreshToken: loginR.body.data.tokens.refreshToken });
    log('Token Refresh', r.status, r.body.success === true, r.body.message);
    if (r.body.success) CUSTOMER_TOKEN = r.body.data?.tokens?.accessToken || CUSTOMER_TOKEN;
  } else {
    log('Token Refresh', 0, false, 'No refresh token');
  }

  // ==================== CATEGORIES TESTS ====================
  console.log('\n--- CATEGORIES TESTS ---');

  // 6. Get categories (empty)
  r = await request('GET', '/categories');
  log('GET /categories', r.status, r.status === 200, `Count: ${r.body.data?.length || 0}`);

  // 7. Admin create category
  r = await request('POST', '/admin/products', null, ADMIN_TOKEN); // Check if there's a category creation endpoint
  // Actually, let me check - categories might need to be created via SQL or admin endpoint
  // Let me create categories via the admin product creation flow

  // Create categories via SQL since there's no dedicated admin category endpoint
  // We'll test via direct API

  // ==================== ADMIN PRODUCT CRUD ====================
  console.log('\n--- ADMIN PRODUCT CRUD TESTS ---');

  // First, we need a category. Let me check if there's a category creation admin endpoint
  r = await request('GET', '/categories');
  if (r.body.data && r.body.data.length > 0) {
    CATEGORY_ID = r.body.data[0].id;
    log('Categories exist', r.status, true, `Using: ${r.body.data[0].name_en}`);
  } else {
    log('No categories found', r.status, false, 'Need to create categories first');
  }

  // 8. Create Product (Admin)
  if (CATEGORY_ID) {
    r = await request('POST', '/admin/products', {
      name_ur: 'ٹماٹر ٹیسٹ ' + Date.now(),
      name_en: 'Tomato Test ' + Date.now(),
      category_id: CATEGORY_ID,
      price: 120,
      unit_type: 'kg',
      unit_value: 1,
      stock_quantity: 100,
      description_en: 'Fresh red tomatoes',
      description_ur: 'تازہ سرخ ٹماٹر',
      is_active: true,
    }, ADMIN_TOKEN);
    if (r.body.success) {
      PRODUCT_ID = r.body.data?.id;
      log('Create Product', r.status, true, `ID: ${PRODUCT_ID}`);
    } else {
      log('Create Product', r.status, false, JSON.stringify(r.body));
    }
  }

  // 9. Get Products
  r = await request('GET', '/products');
  log('GET /products', r.status, r.status === 200, `Count: ${r.body.data?.products?.length || r.body.data?.length || 0}`);

  // 10. Get Product by ID
  if (PRODUCT_ID) {
    r = await request('GET', `/products/${PRODUCT_ID}`);
    log('GET /products/:id', r.status, r.body.success === true);
  }

  // 11. Update Product (Admin)
  if (PRODUCT_ID) {
    r = await request('PUT', `/admin/products/${PRODUCT_ID}`, {
      price: 150,
      stock_quantity: 200,
    }, ADMIN_TOKEN);
    log('Update Product', r.status, r.body.success === true, r.body.message);
  }

  // 12. Featured Products
  r = await request('GET', '/products/featured/list');
  log('GET /products/featured/list', r.status, r.status === 200);

  // 13. New Arrivals
  r = await request('GET', '/products/new-arrivals');
  log('GET /products/new-arrivals', r.status, r.status === 200);

  // 14. Search Products
  r = await request('GET', '/products/search?q=tomato');
  log('GET /products/search', r.status, r.status === 200);

  // ==================== ADDRESS TESTS ====================
  console.log('\n--- ADDRESS TESTS ---');

  // 15. Create Address (no file for now - may fail)
  r = await request('POST', '/addresses', {
    written_address: 'House 123, Block A, DHA Phase 5, Lahore',
    landmark: 'Near Park',
    latitude: 31.4697,
    longitude: 74.2728,
    area_name: 'DHA Phase 5',
    city: 'Lahore',
    province: 'Punjab',
    is_default: true,
    address_type: 'home',
  }, CUSTOMER_TOKEN);
  if (r.body.success) {
    ADDRESS_ID = r.body.data?.id;
    log('Create Address', r.status, true, `ID: ${ADDRESS_ID}`);
  } else {
    log('Create Address', r.status, false, JSON.stringify(r.body));
  }

  // 16. Get Addresses
  r = await request('GET', '/addresses', null, CUSTOMER_TOKEN);
  log('GET /addresses', r.status, r.status === 200, `Count: ${r.body.data?.length || 0}`);
  if (r.body.data && r.body.data.length > 0 && !ADDRESS_ID) {
    ADDRESS_ID = r.body.data[0].id;
  }

  // ==================== CART TESTS ====================
  console.log('\n--- CART TESTS ---');

  // 17. Get Cart
  r = await request('GET', '/cart', null, CUSTOMER_TOKEN);
  log('GET /cart', r.status, r.status === 200, r.body.message);

  // 18. Add to Cart
  if (PRODUCT_ID) {
    r = await request('POST', '/cart/add', {
      product_id: PRODUCT_ID,
      quantity: 2,
    }, CUSTOMER_TOKEN);
    log('Add to Cart', r.status, r.body.success === true, r.body.message);
  } else {
    log('Add to Cart', 0, false, 'No product ID');
  }

  // 19. Get Cart (with items)
  r = await request('GET', '/cart', null, CUSTOMER_TOKEN);
  log('GET /cart (with items)', r.status, r.status === 200, `Items: ${r.body.data?.items?.length || 0}`);

  // 20. Calculate Delivery Charge
  r = await request('POST', '/cart/delivery-charge', {}, CUSTOMER_TOKEN);
  log('Calculate Delivery Charge', r.status, r.status === 200, r.body.message);

  // ==================== ORDER TESTS ====================
  console.log('\n--- ORDER TESTS ---');

  // 21. Get Time Slots
  r = await request('GET', '/orders/time-slots');
  log('GET /orders/time-slots', r.status, r.status === 200);

  // 22. Create Order
  if (ADDRESS_ID) {
    r = await request('POST', '/orders', {
      address_id: ADDRESS_ID,
      payment_method: 'cash_on_delivery',
      customer_notes: 'Test order from API test',
    }, CUSTOMER_TOKEN);
    if (r.body.success) {
      ORDER_ID = r.body.data?.id || r.body.data?.order?.id;
      log('Create Order', r.status, true, `ID: ${ORDER_ID}`);
    } else {
      log('Create Order', r.status, false, JSON.stringify(r.body));
    }
  } else {
    log('Create Order', 0, false, 'No address available');
  }

  // 23. Get Orders
  r = await request('GET', '/orders', null, CUSTOMER_TOKEN);
  log('GET /orders', r.status, r.status === 200, `Count: ${r.body.data?.orders?.length || r.body.data?.length || 0}`);
  if (!ORDER_ID && r.body.data?.orders?.length > 0) {
    ORDER_ID = r.body.data.orders[0].id;
  }

  // 24. Get Order Details
  if (ORDER_ID) {
    r = await request('GET', `/orders/${ORDER_ID}`, null, CUSTOMER_TOKEN);
    log('GET /orders/:id', r.status, r.body.success === true);
  }

  // 25. Track Order
  if (ORDER_ID) {
    r = await request('GET', `/orders/track/${ORDER_ID}`);
    log('Track Order', r.status, r.status === 200);
  }

  // ==================== ADMIN ORDER MANAGEMENT ====================
  console.log('\n--- ADMIN ORDER MANAGEMENT ---');

  // 26. Admin Get Orders
  r = await request('GET', '/admin/orders', null, ADMIN_TOKEN);
  log('Admin GET /orders', r.status, r.status === 200, `Count: ${r.body.data?.orders?.length || 0}`);

  // 27. Admin Get Order Details
  if (ORDER_ID) {
    r = await request('GET', `/admin/orders/${ORDER_ID}`, null, ADMIN_TOKEN);
    log('Admin GET /orders/:id', r.status, r.body.success === true);

    // 28. Admin Update Order Status
    r = await request('PUT', `/admin/orders/${ORDER_ID}/status`, {
      status: 'confirmed',
    }, ADMIN_TOKEN);
    log('Admin Update Order Status', r.status, r.body.success === true, r.body.message);
  }

  // ==================== ADMIN DASHBOARD ====================
  console.log('\n--- ADMIN DASHBOARD ---');

  // 29. Dashboard Stats
  r = await request('GET', '/admin/dashboard', null, ADMIN_TOKEN);
  log('Admin Dashboard Stats', r.status, r.body.success === true, r.body.message);

  // ==================== ATTA CHAKKI SERVICE ====================
  console.log('\n--- ATTA CHAKKI SERVICE ---');

  // 30. Create Atta Request
  if (ADDRESS_ID) {
    r = await request('POST', '/atta-requests', {
      address_id: ADDRESS_ID,
      wheat_quality: 'desi',
      wheat_quantity_kg: 40,
      flour_type: 'fine',
      special_instructions: 'Please make it medium fine',
    }, CUSTOMER_TOKEN);
    if (r.body.success) {
      ATTA_REQUEST_ID = r.body.data?.id;
      log('Create Atta Request', r.status, true, `ID: ${ATTA_REQUEST_ID}`);
    } else {
      log('Create Atta Request', r.status, false, JSON.stringify(r.body));
    }
  }

  // 31. Get Atta Requests
  r = await request('GET', '/atta-requests', null, CUSTOMER_TOKEN);
  log('GET /atta-requests', r.status, r.status === 200);

  // 32. Admin Get Atta Requests
  r = await request('GET', '/admin/atta-requests', null, ADMIN_TOKEN);
  log('Admin GET /atta-requests', r.status, r.status === 200);

  // 33. Admin Update Atta Status
  if (ATTA_REQUEST_ID) {
    r = await request('PUT', `/admin/atta-requests/${ATTA_REQUEST_ID}/status`, {
      status: 'picked_up',
    }, ADMIN_TOKEN);
    log('Admin Update Atta Status', r.status, r.body.success === true, r.body.message);
  }

  // ==================== ADMIN RIDERS ====================
  console.log('\n--- ADMIN RIDERS ---');

  // 34. Get Riders
  r = await request('GET', '/admin/riders', null, ADMIN_TOKEN);
  log('Admin GET /riders', r.status, r.status === 200, `Count: ${r.body.data?.length || 0}`);

  // ==================== ADMIN WHATSAPP ORDERS ====================
  console.log('\n--- ADMIN WHATSAPP ORDER ---');

  // 35. Create WhatsApp Order
  if (PRODUCT_ID) {
    r = await request('POST', '/admin/whatsapp-orders', {
      whatsapp_number: '+923331234567',
      customer_name: 'WhatsApp Customer',
      items: [{ product_id: PRODUCT_ID, quantity: 3 }],
      address_text: 'House 456, Block B, DHA Phase 6',
      latitude: 31.47,
      longitude: 74.27,
      delivery_charge: 100,
      admin_notes: 'WhatsApp order test',
    }, ADMIN_TOKEN);
    log('Create WhatsApp Order', r.status, r.body.success === true, r.body.message || JSON.stringify(r.body));
  }

  // ==================== ADMIN ADDRESS MANAGEMENT ====================
  console.log('\n--- ADMIN ADDRESS MGMT ---');

  // 36. Assign House Number
  if (ADDRESS_ID) {
    r = await request('PUT', `/admin/addresses/${ADDRESS_ID}/house-number`, {
      house_number: 'H-123',
    }, ADMIN_TOKEN);
    log('Assign House Number', r.status, r.body.success === true, r.body.message);
  }

  // ==================== CATEGORY TREE ====================
  console.log('\n--- CATEGORY EXTRAS ---');

  r = await request('GET', '/categories/tree');
  log('GET /categories/tree', r.status, r.status === 200);

  // ==================== SUMMARY ====================
  console.log('\n========================================');
  console.log('  TEST RESULTS SUMMARY');
  console.log('========================================');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  TOTAL:  ${results.length}`);
  console.log('========================================');
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ❌ ${r.test} [${r.status}] - ${r.detail}`);
    });
  }
  console.log('');
}

runTests().catch(console.error);
