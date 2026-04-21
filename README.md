# Fresh Bazar - Pakistan's Trusted Grocery Delivery Platform

A complete, scalable grocery delivery system optimized for Pakistan's local market. Built with modern technologies and designed for easy expansion across multiple cities.

## System Overview

This platform integrates:
- **Customer Mobile App** (React Native) - Order groceries & atta chakki service
- **Customer Website** (Next.js) - Browse and order from any device
- **Admin Panel** (React) - Complete business management
- **Rider App** (React Native) - Delivery personnel management
- **Backend API** (Node.js/Express) - Single database for all platforms

## Features

### Customer Features
- Browse categories: Sabzi, Fruit, Dry Fruit, Chicken
- Smart cart with intelligent delivery charges
- Free delivery 10AM-2PM (order before 10AM)
- Free delivery on minimum vegetable/fruit purchase
- Atta Chakki service (wheat pickup & flour delivery)
- Multiple saved addresses with GPS location
- Door picture for easy identification
- House number system for addresses
- Cash on Delivery payment
- Real-time order tracking
- Push notifications

### Admin Features
- Dashboard with sales analytics
- Order management with rider assignment
- Product & category management
- Rider management & GPS tracking
- Atta Chakki workflow management
- WhatsApp order entry
- House number assignment
- Delivery charge configuration

### Rider Features
- Task list with order details
- GPS navigation to customer
- Privacy-protected customer calls
- Online/offline status toggle
- Real-time location tracking
- Delivery confirmation with proof

### Privacy & Security
- Rider cannot see customer phone number
- App-mediated calling system
- JWT authentication
- Role-based access control
- Password hashing

## Project Structure

```
/mnt/okcomputer/output/
├── database/
│   └── schema.sql          # Complete PostgreSQL schema
├── backend/
│   ├── src/                # Node.js/Express API
│   ├── package.json
│   └── .env.example
├── admin-panel/
│   ├── src/                # React admin dashboard
│   ├── package.json
│   └── README.md
├── website/
│   ├── app/                # Next.js 14 website
│   ├── package.json
│   └── README.md
├── customer-app/
│   ├── src/                # React Native customer app
│   ├── package.json
│   └── README.md
├── rider-app/
│   ├── src/                # React Native rider app
│   ├── package.json
│   └── README.md
└── README.md               # This file
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Database | PostgreSQL 15+ with PostGIS |
| Backend | Node.js, Express, TypeScript |
| Admin Panel | React 18, Vite, Tailwind CSS |
| Website | Next.js 14, TypeScript, Tailwind CSS |
| Customer App | React Native, Expo SDK 50 |
| Rider App | React Native, Expo SDK 50 |

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis (optional, for caching)

### 1. Database Setup

```bash
# Create database
createdb freshbazar_db

# Run schema
psql freshbazar_db < database/schema.sql
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials
npm install
npm run dev
```

Backend will run on `http://localhost:3000`

### 3. Admin Panel Setup

```bash
cd admin-panel
npm install
npm run dev
```

Admin panel will run on `http://localhost:5173`

Demo credentials: `admin@freshbazar.pk` / `admin123`

### 4. Website Setup

```bash
cd website
npm install
npm run dev
```

Website will run on `http://localhost:3001`

### 5. Customer App Setup

```bash
cd customer-app
npm install
npx expo start
```

Scan QR code with Expo Go app

### 6. Rider App Setup

```bash
cd rider-app
npm install
npx expo start
```

Scan QR code with Expo Go app

## Configuration

### Delivery Charges (Configurable in Admin Panel)

Edit `delivery_charges_config` table:

| Rule | Condition | Charge |
|------|-----------|--------|
| Morning Free | Order before 10AM for 10AM-2PM slot | FREE |
| Category Free | Veg/Fruit/Dry Fruit above Rs. 500 | FREE |
| Chicken Only | Only chicken in cart | Rs. 100 |
| Default | Standard delivery | Rs. 50 |

### Time Slots

Configure in `time_slots` table:
- 10:00 AM - 2:00 PM (FREE if ordered before 10AM)
- 2:00 PM - 6:00 PM
- 6:00 PM - 9:00 PM

## Environment Variables

### Backend (.env)
```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=freshbazar_db
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
```

## Database Schema Highlights

### Key Tables
- `users` - Customer accounts
- `riders` - Delivery personnel
- `admins` - Admin users
- `products` - Product catalog
- `categories` - Product categories (Urdu + English)
- `orders` - Order lifecycle
- `order_items` - Order line items
- `addresses` - Customer addresses with GPS & door pictures
- `delivery_charges_config` - Configurable delivery rules
- `atta_requests` - Atta Chakki service
- `rider_tasks` - Pickup/delivery tasks
- `call_requests` - Privacy-protected calling

### Smart Delivery Logic
```sql
-- Automatically calculates delivery charge based on:
-- 1. Time slot (10AM-2PM free if ordered before 10AM)
-- 2. Cart contents (veg/fruit/dry fruit minimum)
-- 3. Category-based rules
SELECT calculate_delivery_charge(cart_id, time_slot);
```

## Deployment

### Backend Deployment (VPS/Cloud)

```bash
cd backend
npm run build
npm start
```

Use PM2 for process management:
```bash
npm install -g pm2
pm2 start dist/app.js --name freshbazar-api
```

### Database Deployment

1. Create PostgreSQL instance
2. Run schema.sql
3. Configure connection in backend .env

### Mobile Apps Deployment

**Customer App:**
```bash
cd customer-app
expo build:android
expo build:ios
```

**Rider App:**
```bash
cd rider-app
expo build:android
expo build:ios
```

### Website Deployment (Vercel)

```bash
cd website
vercel --prod
```

### Admin Panel Deployment

```bash
cd admin-panel
npm run build
# Deploy dist/ folder to any static host
```

## Scaling

### Horizontal Scaling
- Use PostgreSQL read replicas
- Implement Redis caching
- Use load balancer for API servers
- CDN for images

### Multi-City Expansion
1. Add cities to `delivery_zones` table
2. Assign riders to zones
3. Configure zone-specific pricing
4. Deploy localized apps

## Troubleshooting

### Common Issues

**Database connection failed:**
- Check PostgreSQL is running
- Verify credentials in .env
- Ensure database exists

**Port already in use:**
- Change PORT in .env
- Kill existing process: `kill $(lsof -t -i:3000)`

**Expo app not loading:**
- Check phone and computer are on same network
- Try tunnel mode: `npx expo start --tunnel`

## API Documentation

Full API documentation available in:
- Backend README: `/backend/README.md`
- Postman collection: Coming soon

## Support

For issues or questions:
- Email: support@freshbazar.pk
- Phone: 0300-1234567

## License

This project is proprietary software for Fresh Bazar.

---

**Built with love for Pakistan's local market by Fresh Bazar**
