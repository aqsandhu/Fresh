# System Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PAKISTAN GROCERY DELIVERY PLATFORM                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐
│  Customer App   │  │  Customer Web   │  │   Admin Panel   │  │  Rider App  │
│  (React Native) │  │   (Next.js)     │  │    (React)      │  │(React Native│
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘
         │                    │                    │                  │
         └────────────────────┴──────────┬─────────┴──────────────────┘
                                         │
                              ┌──────────▼──────────┐
                              │   Backend API       │
                              │  (Node.js/Express)  │
                              └──────────┬──────────┘
                                         │
                              ┌──────────▼──────────┐
                              │    PostgreSQL       │
                              │      Database       │
                              └─────────────────────┘
```

## Database Schema Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE TABLES                                 │
└─────────────────────────────────────────────────────────────────────────────┘

USERS & AUTH
├── users (customers)
├── riders
├── admins
└── refresh_tokens

PRODUCT CATALOG
├── categories (Urdu + English names)
├── products
└── product_images

SHOPPING
├── carts
├── cart_items
└── delivery_charges_config (smart rules)

ORDERS
├── orders
├── order_items
├── time_slots
└── payments

ADDRESSES
├── addresses
│   ├── gps_coordinates (PostGIS)
│   ├── door_picture
│   └── house_number (admin assigned)
└── delivery_zones

ATTA CHAKKI SERVICE
├── atta_requests
├── mills
└── atta_status_history

RIDER OPERATIONS
├── rider_tasks
├── rider_locations (GPS tracking)
└── call_requests (privacy protection)

ADMIN & CONFIG
├── whatsapp_orders (manual entry)
├── notifications
└── system_settings
```

## Smart Delivery Logic Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DELIVERY CHARGE CALCULATION                          │
└─────────────────────────────────────────────────────────────────────────────┘

Customer adds items to cart
         │
         ▼
┌─────────────────┐
│  Check Time Slot│
│  10AM-2PM?      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
   YES       NO
    │         │
    ▼         ▼
┌────────┐  ┌─────────────────┐
│Ordered │  │ Check Cart Items│
│before  │  │                 │
│10AM?   │  └────────┬────────┘
└───┬────┘           │
    │           ┌────┴────┐
   YES          │         │
    │      Veg/Fruit/   Chicken
    │      Dry Fruit    Only
    │      >= Rs.500    in cart?
    │          │            │
    │         YES          YES
    │          │            │
    ▼          ▼            ▼
┌────────┐  ┌────────┐  ┌────────┐
│  FREE  │  │  FREE  │  │ Rs.100 │
│DELIVERY│  │DELIVERY│  │ CHARGE │
└────────┘  └────────┘  └────────┘
```

## Order Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORDER LIFECYCLE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Customer                    Admin                      Rider
   │                          │                          │
   │  Place Order             │                          │
   │─────────────────────────>│                          │
   │                          │                          │
   │                          │  Assign Rider            │
   │                          │─────────────────────────>│
   │                          │                          │
   │  Order Confirmed         │                          │
   │<─────────────────────────│                          │
   │                          │                          │
   │                          │                          │  Update Status
   │  Status: Preparing       │<─────────────────────────│
   │<─────────────────────────│                          │
   │                          │                          │
   │                          │                          │  Out for Delivery
   │  Status: Out for Delivery│<─────────────────────────│
   │<─────────────────────────│                          │
   │                          │                          │
   │  Push Notification       │                          │
   │  "Order at your door!"   │                          │
   │<────────────────────────────────────────────────────│
   │                          │                          │
   │                          │                          │  Mark Delivered
   │  Status: Delivered       │<─────────────────────────│
   │<─────────────────────────│                          │
   │                          │                          │
```

## Atta Chakki Service Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ATTA CHAKKI WORKFLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

Customer                    System                     Rider
   │                          │                          │
   │  Create Request          │                          │
   │  (weight, address, time) │                          │
   │─────────────────────────>│                          │
   │                          │                          │
   │                          │  Create Pickup Task      │
   │                          │─────────────────────────>│
   │                          │                          │
   │  Request Confirmed       │                          │
   │<─────────────────────────│                          │
   │                          │                          │
   │                          │                          │  Pickup Wheat
   │  Status: Picked Up       │<─────────────────────────│
   │<─────────────────────────│                          │
   │                          │                          │
   │                          │                          │  Deliver to Mill
   │  Status: At Mill         │<─────────────────────────│
   │<─────────────────────────│                          │
   │                          │                          │
   │                          │  Mill processes wheat    │
   │                          │  (manual update)         │
   │                          │                          │
   │  Status: Ready           │<─────────────────────────│
   │<─────────────────────────│                          │
   │                          │                          │
   │                          │  Create Delivery Task    │
   │                          │─────────────────────────>│
   │                          │                          │
   │                          │                          │  Deliver Atta
   │  Status: Delivered       │<─────────────────────────│
   │<─────────────────────────│                          │
   │                          │                          │
```

## Privacy Protection Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PRIVACY-PROTECTED CALLING                               │
└─────────────────────────────────────────────────────────────────────────────┘

Rider wants to call customer
         │
         ▼
┌─────────────────┐
│ Rider App shows │
│ "Call Customer" │
│ button (NO      │
│ phone number)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ POST /api/rider │
│ /call-request   │
│ {order_id}      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ System creates  │
│ call_request    │
│ record          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Rider sees:     │     │ Customer gets   │
│ "Calling..."    │     │ push notification│
└─────────────────┘     │ "Order at your  │
                        │  door!"         │
                        └─────────────────┘
```

## API Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API ENDPOINTS                                     │
└─────────────────────────────────────────────────────────────────────────────┘

AUTHENTICATION
├── POST /api/auth/register
├── POST /api/auth/login
├── POST /api/auth/refresh
└── GET  /api/auth/profile

CUSTOMER
├── GET  /api/categories
├── GET  /api/products
├── GET  /api/products/:id
├── POST /api/cart/add
├── GET  /api/cart
├── PUT  /api/cart/update
├── POST /api/addresses
├── GET  /api/addresses
├── POST /api/orders
├── GET  /api/orders
├── GET  /api/orders/:id/track
├── POST /api/atta-requests
└── GET  /api/atta-requests/:id/track

ADMIN
├── POST /api/admin/login
├── GET  /api/admin/dashboard
├── GET  /api/admin/orders
├── PUT  /api/admin/orders/:id/assign-rider
├── PUT  /api/admin/orders/:id/status
├── GET  /api/admin/riders
├── POST /api/admin/products
├── PUT  /api/admin/products/:id
├── POST /api/admin/whatsapp-orders
├── PUT  /api/admin/addresses/:id/house-number
└── GET  /api/admin/atta-requests

RIDER
├── POST /api/rider/login
├── GET  /api/rider/tasks
├── GET  /api/rider/tasks/:id
├── PUT  /api/rider/tasks/:id/pickup
├── PUT  /api/rider/tasks/:id/deliver
├── POST /api/rider/call-request
└── PUT  /api/rider/location
```

## Security Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SECURITY LAYERS                                   │
└─────────────────────────────────────────────────────────────────────────────┘

1. NETWORK LAYER
   ├── HTTPS/TLS encryption
   ├── CORS configuration
   └── Rate limiting

2. AUTHENTICATION LAYER
   ├── JWT tokens
   ├── Password hashing (bcrypt)
   └── Token refresh mechanism

3. AUTHORIZATION LAYER
   ├── Role-based access control
   ├── Middleware protection
   └── Resource ownership checks

4. DATA LAYER
   ├── Parameterized queries (SQL injection protection)
   ├── Input validation (Joi)
   └── XSS protection

5. PRIVACY LAYER
   ├── Customer phone hidden from riders
   ├── App-mediated calling
   └── Address verification system
```

## Scalability Considerations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SCALING STRATEGY                                    │
└─────────────────────────────────────────────────────────────────────────────┘

CURRENT (Single Server)
┌─────────────┐
│   App + DB  │
└─────────────┘

PHASE 1 (Separate Services)
┌─────────┐  ┌─────────┐  ┌─────────┐
│   App   │  │   DB    │  │  Cache  │
└─────────┘  └─────────┘  └─────────┘

PHASE 2 (Load Balanced)
┌─────────┐  ┌─────────┐  ┌─────────┐
│ App x3  │  │   DB    │  │  Redis  │
│(behind  │  │(primary │  │ (cache  │
│  LB)    │  │+replica)│  │+queue)  │
└─────────┘  └─────────┘  └─────────┘

PHASE 3 (Multi-City)
┌─────────┐     ┌─────────┐     ┌─────────┐
│ City A  │<--->│ Central │<--->│ City B  │
│ (local) │     │   DB    │     │ (local) │
└─────────┘     └─────────┘     └─────────┘
```

## Technology Choices

| Component | Technology | Reason |
|-----------|------------|--------|
| Database | PostgreSQL + PostGIS | Relational data, geospatial queries |
| Backend | Node.js + Express | Fast, scalable, JavaScript ecosystem |
| Admin Panel | React + Vite | Fast development, modern tooling |
| Website | Next.js 14 | SEO, SSR, performance |
| Mobile Apps | React Native + Expo | Cross-platform, fast development |
| State Management | Zustand | Simple, lightweight |
| API Client | Axios + React Query | Caching, background updates |
| Styling | Tailwind CSS | Utility-first, fast styling |

## Performance Optimizations

1. **Database**
   - 30+ indexes for common queries
   - GIST indexes for geospatial data
   - Connection pooling

2. **API**
   - Response compression
   - Pagination for lists
   - Selective field retrieval

3. **Frontend**
   - Image lazy loading
   - Code splitting
   - CDN for static assets

4. **Mobile**
   - Image caching
   - Offline mode support
   - Optimized re-renders