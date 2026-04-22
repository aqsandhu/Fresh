// ============================================================================
// SWAGGER / OPENAPI DOCUMENTATION CONFIGURATION
// ============================================================================
// Provides interactive API documentation at /api/docs
// Uses swagger-jsdoc to generate specs from JSDoc comments in route files.
// ============================================================================

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application, Request, Response } from 'express';
import logger from '../utils/logger';

/**
 * Swagger definition
 */
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FreshBazar API',
      version: '1.0.0',
      description: `
# FreshBazar - Pakistani Grocery Delivery Platform API

## Authentication
Most endpoints require Bearer token authentication. Obtain a token from 
\`/api/auth/login\` or \`/api/auth/verify-otp\` and include it in the 
Authorization header:

\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Roles
- **customer** - Regular app/website users
- **rider** - Delivery personnel
- **admin** - Dashboard administrators
- **super_admin** - Full system access

## Rate Limiting
API endpoints are rate-limited. Check response headers for limit details.

## Webhooks
Webhook endpoints require \`x-webhook-signature\` header for HMAC-SHA256 
verification. Optional \`x-idempotency-key\` header prevents duplicate processing.
      `.trim(),
      contact: {
        name: 'FreshBazar Support',
        email: 'support@freshbazar.pk',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000/api',
        description: 'API Server',
      },
    ],
    tags: [
      { name: 'Authentication', description: 'User login, OTP, token refresh' },
      { name: 'Products', description: 'Product catalog, search, filtering' },
      { name: 'Categories', description: 'Product categories' },
      { name: 'Cart', description: 'Shopping cart operations' },
      { name: 'Orders', description: 'Order placement and tracking' },
      { name: 'Addresses', description: 'Delivery address management' },
      { name: 'Atta Chakki', description: 'Flour mill service requests' },
      { name: 'Riders', description: 'Rider endpoints' },
      { name: 'Admin', description: 'Admin dashboard operations' },
      { name: 'Webhooks', description: 'External service webhooks' },
      { name: 'Settings', description: 'Site settings and configuration' },
      { name: 'Chat', description: 'Customer support chat' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token obtained from login/OTP verification',
        },
      },
      schemas: {
        // Auth schemas
        LoginRequest: {
          type: 'object',
          properties: {
            phone: { type: 'string', example: '+923001234567' },
          },
          required: ['phone'],
        },
        VerifyOtpRequest: {
          type: 'object',
          properties: {
            phone: { type: 'string', example: '+923001234567' },
            otp: { type: 'string', example: '123456' },
          },
          required: ['phone', 'otp'],
        },
        TokenResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'string', example: '15m' },
                refreshExpiresIn: { type: 'string', example: '7d' },
              },
            },
          },
        },
        // Product schemas
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name_ur: { type: 'string' },
            name_en: { type: 'string' },
            slug: { type: 'string' },
            price: { type: 'number', example: 250.00 },
            compare_at_price: { type: 'number', example: 300.00 },
            unit_type: { type: 'string', enum: ['kg', 'gram', 'piece', 'dozen', 'liter', 'ml', 'pack'] },
            unit_value: { type: 'number', example: 1 },
            stock_quantity: { type: 'integer', example: 100 },
            primary_image: { type: 'string', format: 'uri' },
            description_ur: { type: 'string' },
            description_en: { type: 'string' },
            is_active: { type: 'boolean' },
            is_featured: { type: 'boolean' },
            is_new_arrival: { type: 'boolean' },
          },
        },
        // Order schemas
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            order_number: { type: 'string', example: 'ORD-20240001' },
            status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'],
            },
            subtotal: { type: 'number', example: 1500.00 },
            delivery_charge: { type: 'number', example: 100.00 },
            total_amount: { type: 'number', example: 1600.00 },
            payment_method: {
              type: 'string',
              enum: ['cash_on_delivery', 'card', 'easypaisa', 'jazzcash', 'bank_transfer'],
            },
            payment_status: {
              type: 'string',
              enum: ['pending', 'completed', 'failed', 'refunded', 'partially_refunded'],
            },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateOrderRequest: {
          type: 'object',
          properties: {
            address_id: { type: 'string', format: 'uuid' },
            payment_method: { type: 'string', example: 'cash_on_delivery' },
            delivery_notes: { type: 'string' },
          },
          required: ['address_id', 'payment_method'],
        },
        // Cart schemas
        CartItem: {
          type: 'object',
          properties: {
            product_id: { type: 'string', format: 'uuid' },
            quantity: { type: 'integer', minimum: 1, example: 2 },
            special_instructions: { type: 'string' },
          },
          required: ['product_id', 'quantity'],
        },
        // Address schemas
        Address: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            address_type: { type: 'string', example: 'home' },
            written_address: { type: 'string' },
            landmark: { type: 'string' },
            location: {
              type: 'object',
              properties: {
                lat: { type: 'number', example: 31.5204 },
                lng: { type: 'number', example: 74.3587 },
              },
            },
            city: { type: 'string', example: 'Lahore' },
            is_default: { type: 'boolean' },
          },
        },
        // Atta Chakki schemas
        AttaRequest: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            request_number: { type: 'string' },
            wheat_quality: { type: 'string', enum: ['desi', 'imported', 'mixed'] },
            wheat_quantity_kg: { type: 'number', example: 10 },
            flour_type: { type: 'string', enum: ['fine', 'medium', 'coarse'] },
            service_charge: { type: 'number', example: 50 },
            milling_charge: { type: 'number', example: 50 },
            delivery_charge: { type: 'number', example: 100 },
            total_amount: { type: 'number', example: 200 },
            status: {
              type: 'string',
              enum: ['pending_pickup', 'picked_up', 'at_mill', 'milling', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'],
            },
          },
        },
        CreateAttaRequest: {
          type: 'object',
          properties: {
            address_id: { type: 'string', format: 'uuid' },
            wheat_quality: { type: 'string', enum: ['desi', 'imported', 'mixed'], default: 'desi' },
            wheat_quantity_kg: { type: 'number', minimum: 1, example: 10 },
            wheat_description: { type: 'string' },
            flour_type: { type: 'string', enum: ['fine', 'medium', 'coarse'], default: 'fine' },
            special_instructions: { type: 'string' },
          },
          required: ['address_id', 'wheat_quantity_kg'],
        },
        // Webhook schemas
        OrderStatusWebhook: {
          type: 'object',
          properties: {
            order_id: { type: 'string', format: 'uuid' },
            status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'],
            },
            metadata: { type: 'object' },
          },
          required: ['order_id', 'status'],
        },
        PaymentWebhook: {
          type: 'object',
          properties: {
            order_id: { type: 'string', format: 'uuid' },
            transaction_id: { type: 'string' },
            amount: { type: 'number' },
            status: { type: 'string', enum: ['completed', 'failed', 'pending'] },
            payment_method: { type: 'string' },
            gateway_response: { type: 'object' },
          },
          required: ['order_id', 'transaction_id', 'status'],
        },
        // Error schemas
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            error: { type: 'object' },
          },
        },
        // Admin schemas
        AdminLoginRequest: {
          type: 'object',
          properties: {
            phone: { type: 'string', example: '+923001234567' },
            password: { type: 'string', format: 'password' },
          },
          required: ['phone', 'password'],
        },
        UpdateOrderStatusRequest: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'],
            },
          },
          required: ['status'],
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Unauthorized - Invalid or missing token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                message: 'Access token required',
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Forbidden - Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                message: 'Insufficient permissions',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                message: 'Resource not found',
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                message: 'Validation failed',
                error: [{ field: 'phone', message: 'Invalid phone number' }],
              },
            },
          },
        },
      },
    },
  },
  // Path to route files containing JSDoc annotations
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
  ],
};

/**
 * Generate Swagger specification
 */
const swaggerSpec = swaggerJsdoc(swaggerOptions);

/**
 * Setup Swagger UI in Express app
 */
export const setupSwagger = (app: Application): void => {
  // Serve Swagger UI
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'FreshBazar API Documentation',
  }));

  // Serve raw OpenAPI spec as JSON
  app.get('/api/docs.json', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  logger.info('Swagger documentation initialized at /api/docs');
};

export default swaggerSpec;
