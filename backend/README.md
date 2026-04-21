# Pakistani Grocery Delivery Platform - Backend API

A production-ready Node.js/Express backend API for a Pakistani grocery delivery platform with smart delivery charge calculation, Atta Chakki service, and comprehensive order management.

## Features

### Authentication
- Phone-based registration with Pakistani number validation
- JWT token authentication with refresh tokens
- Role-based access control (customer, rider, admin, super_admin)
- Password hashing with bcrypt

### Customer Features
- Browse categories and products with bilingual support (Urdu/English)
- Smart cart management with delivery charge calculation
- Address management with GPS location and door pictures
- Order placement with time slot selection
- Order tracking
- Atta Chakki (flour mill) service requests

### Smart Delivery Charge Calculation
- Free delivery for morning slots (10AM-2PM) when ordered before 10AM
- Free delivery for vegetable/fruit/dry fruit orders above minimum amount
- Category-based delivery charges (chicken/meat always paid)
- Configurable delivery rules via database

### Admin Features
- Dashboard with statistics (daily/weekly/monthly sales)
- Order management with rider assignment
- Product management
- Rider management
- WhatsApp order creation
- House number assignment
- Atta request management

### Rider Features
- Task management (pickup/delivery)
- Privacy-protected customer calls
- Real-time location updates
- Delivery confirmation with proof

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with PostGIS extension
- **ORM**: Raw SQL with pg (node-postgres)
- **Authentication**: JWT (jsonwebtoken)
- **Validation**: Joi
- **File Upload**: Multer
- **Security**: Helmet, CORS, Rate Limiting
- **Logging**: Winston

## Project Structure

```
backend/
├── src/
│   ├── config/         # Database, JWT configuration
│   │   ├── database.ts
│   │   └── jwt.ts
│   ├── controllers/    # All controllers
│   │   ├── auth.controller.ts
│   │   ├── category.controller.ts
│   │   ├── product.controller.ts
│   │   ├── cart.controller.ts
│   │   ├── address.controller.ts
│   │   ├── order.controller.ts
│   │   ├── atta.controller.ts
│   │   ├── admin.controller.ts
│   │   ├── rider.controller.ts
│   │   └── webhook.controller.ts
│   ├── middleware/     # Auth, validation, error handler
│   │   ├── auth.ts
│   │   ├── validation.ts
│   │   ├── errorHandler.ts
│   │   ├── rateLimiter.ts
│   │   └── upload.ts
│   ├── routes/         # All routes
│   │   ├── auth.routes.ts
│   │   ├── category.routes.ts
│   │   ├── product.routes.ts
│   │   ├── cart.routes.ts
│   │   ├── address.routes.ts
│   │   ├── order.routes.ts
│   │   ├── atta.routes.ts
│   │   ├── admin.routes.ts
│   │   ├── rider.routes.ts
│   │   ├── webhook.routes.ts
│   │   └── index.ts
│   ├── types/          # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/          # Helper functions
│   │   ├── logger.ts
│   │   ├── response.ts
│   │   ├── validators.ts
│   │   └── deliveryCalculator.ts
│   └── app.ts          # Main application
├── package.json
├── tsconfig.json
└── .env.example
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```env
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=grocery_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_super_secret_key
JWT_REFRESH_SECRET=your_refresh_secret

# File Upload
UPLOAD_DIR=uploads
```

5. Run database migrations (see schema.sql)

6. Start the server:
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API Documentation

### Authentication Endpoints

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "phone": "+923001234567",
  "full_name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "phone": "+923001234567",
  "password": "SecurePass123"
}
```

#### Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "your_refresh_token"
}
```

### Customer Endpoints

#### Categories
```http
GET /api/categories                    # List all categories
GET /api/categories/tree               # Get category tree
GET /api/categories/:slug              # Get category by slug
```

#### Products
```http
GET /api/products                      # List products with filters
GET /api/products?category=:id         # Filter by category
GET /api/products?search=:query        # Search products
GET /api/products?minPrice=100&maxPrice=500  # Price range
GET /api/products/:id                  # Get product details
GET /api/products/featured/list        # Featured products
GET /api/products/new-arrivals         # New arrivals
```

#### Cart
```http
GET /api/cart                          # View cart
POST /api/cart/add                     # Add item
{
  "product_id": "uuid",
  "quantity": 2,
  "special_instructions": "Ripe please"
}

PUT /api/cart/update/:itemId           # Update quantity
DELETE /api/cart/remove/:itemId        # Remove item
POST /api/cart/delivery-charge         # Calculate delivery charge
{
  "time_slot_id": "uuid"
}
```

#### Addresses
```http
GET /api/addresses                     # List addresses
POST /api/addresses                    # Create address (multipart/form-data)
{
  "address_type": "home",
  "written_address": "House 123, Street 4",
  "landmark": "Near Mosque",
  "latitude": 24.8607,
  "longitude": 67.0011,
  "door_picture": [file]
}

PUT /api/addresses/:id                 # Update address
DELETE /api/addresses/:id              # Delete address
```

#### Orders
```http
GET /api/orders                        # Order history
GET /api/orders/:id                    # Order details
GET /api/orders/track/:id              # Track order (public)
GET /api/orders/time-slots             # Available time slots
POST /api/orders                       # Place order
{
  "address_id": "uuid",
  "time_slot_id": "uuid",
  "payment_method": "cash_on_delivery",
  "customer_notes": "Call before delivery"
}

PUT /api/orders/:id/cancel             # Cancel order
```

#### Atta Chakki Service
```http
GET /api/atta-requests                 # List requests
GET /api/atta-requests/:id             # Request details
GET /api/atta-requests/track/:id       # Track request (public)
POST /api/atta-requests                # Create request
{
  "address_id": "uuid",
  "wheat_quality": "desi",
  "wheat_quantity_kg": 20,
  "flour_type": "fine"
}

PUT /api/atta-requests/:id/cancel      # Cancel request
```

### Admin Endpoints

#### Dashboard
```http
GET /api/admin/dashboard               # Statistics
```

#### Orders
```http
GET /api/admin/orders                  # All orders with filters
GET /api/admin/orders/:id              # Order details
PUT /api/admin/orders/:id/status       # Update status
PUT /api/admin/orders/:id/assign-rider # Assign rider
```

#### Riders
```http
GET /api/admin/riders                  # List riders
```

#### Products
```http
POST /api/admin/products               # Create product
PUT /api/admin/products/:id            # Update product
```

#### WhatsApp Orders
```http
POST /api/admin/whatsapp-orders        # Create manual order
```

#### Addresses
```http
PUT /api/admin/addresses/:id/house-number  # Assign house number
```

#### Atta Requests
```http
GET /api/admin/atta-requests           # List requests
PUT /api/admin/atta-requests/:id/status    # Update status
```

### Rider Endpoints

#### Login
```http
POST /api/rider/login
{
  "phone": "+923001234567",
  "password": "password"
}
```

#### Tasks
```http
GET /api/rider/tasks                   # Assigned tasks
GET /api/rider/tasks/:id               # Task details
PUT /api/rider/tasks/:id/accept        # Accept task
PUT /api/rider/tasks/:id/pickup        # Confirm pickup
PUT /api/rider/tasks/:id/deliver       # Confirm delivery
```

#### Location & Status
```http
PUT /api/rider/location                # Update GPS location
{
  "latitude": 24.8607,
  "longitude": 67.0011
}

PUT /api/rider/status                  # Update status
{
  "status": "available"
}
```

#### Call Request (Privacy Protected)
```http
POST /api/rider/call-request
{
  "order_id": "uuid"
}
```

## Smart Delivery Charge Rules

1. **Morning Slot Free Delivery**: Order before 10AM for 10AM-2PM slot = FREE
2. **Vegetables/Fruits/Dry Fruits**: Above minimum order value = FREE
3. **Chicken/Meat Only Orders**: Always Rs. 100
4. **Standard Delivery**: Rs. 100 for all other orders

Configure rules in `delivery_charges_config` table.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Server port | `3000` |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` |
| `DB_NAME` | Database name | `grocery_db` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | JWT secret key | - |
| `JWT_REFRESH_SECRET` | JWT refresh secret | - |
| `JWT_EXPIRES_IN` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | `7d` |
| `UPLOAD_DIR` | Upload directory | `uploads` |
| `MAX_FILE_SIZE` | Max file size | `5242880` (5MB) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` (15min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |

## Security Features

- Helmet.js for security headers
- CORS configuration
- Rate limiting per endpoint
- JWT authentication
- Password hashing with bcrypt
- Input validation with Joi
- SQL injection protection via parameterized queries
- File upload restrictions

## Error Handling

Standard error response format:
```json
{
  "success": false,
  "message": "Error message",
  "error": { /* details in development */ }
}
```

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `429` - Too Many Requests
- `500` - Internal Server Error

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Run type checking
npm run typecheck

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use strong JWT secrets
3. Configure CORS for your domain
4. Set up PostgreSQL with SSL
5. Use PM2 or similar process manager
6. Set up reverse proxy (Nginx)
7. Enable request logging

Example PM2 config:
```json
{
  "apps": [{
    "name": "grocery-api",
    "script": "./dist/app.js",
    "instances": "max",
    "exec_mode": "cluster",
    "env": {
      "NODE_ENV": "production"
    }
  }]
}
```

## License

MIT

## Support

For support, email support@example.com or join our Slack channel.
