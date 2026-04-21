# Fresh Bazar Pakistan - Fresh Grocery Delivery Platform

A complete Next.js 14 customer website for a Pakistani grocery delivery platform. Features fresh vegetables, fruits, dry fruits, chicken, and Atta Chakki service delivery.

## 🌟 Features

### Core Features
- **Home Page** - Hero section, categories, featured products, how it works, delivery info, app download CTA
- **Authentication** - Login with phone number, OTP verification, registration
- **Category Pages** - Sabzi, Fruit, Dry Fruit, Chicken with filters and sorting
- **Product Details** - Full product info, quantity selector, add to cart, related products
- **Shopping Cart** - Cart management, delivery charge calculation, checkout flow
- **Checkout** - Address selection, time slots, payment method (COD)
- **Atta Chakki Service** - Wheat grinding service request form
- **Order Management** - Order history, tracking, reorder functionality
- **User Profile** - Profile info, saved addresses
- **Static Pages** - About, Contact, FAQ

### Technical Features
- ✅ Next.js 14 with App Router
- ✅ TypeScript for type safety
- ✅ Tailwind CSS for styling
- ✅ React Query for API state management
- ✅ Zustand for cart state management
- ✅ React Hook Form for form handling
- ✅ Framer Motion for animations
- ✅ Responsive mobile-first design
- ✅ SEO-friendly with metadata
- ✅ Urdu/English mixed content
- ✅ Green theme (Pakistani cultural colors)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository or extract the files:
```bash
cd website
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3001](http://localhost:3001) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## 📁 Project Structure

```
website/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth group routes
│   │   ├── login/         # Login page
│   │   └── register/      # Registration page
│   ├── (shop)/            # Shop group routes
│   │   ├── page.tsx       # Home page
│   │   ├── category/      # Category pages
│   │   ├── product/       # Product detail pages
│   │   ├── cart/          # Shopping cart
│   │   ├── checkout/      # Checkout flow
│   │   ├── atta-chakki/   # Atta Chakki service
│   │   ├── orders/        # Order history
│   │   ├── track/         # Order tracking
│   │   └── profile/       # User profile
│   ├── about/             # About us page
│   ├── contact/           # Contact page
│   ├── faq/               # FAQ page
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/
│   ├── ui/                # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── ProductCard.tsx
│   │   ├── CategoryCard.tsx
│   │   ├── QuantitySelector.tsx
│   │   ├── LoadingSpinner.tsx
│   │   └── EmptyState.tsx
│   ├── layout/            # Layout components
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── MobileNav.tsx
│   ├── sections/          # Page sections
│   │   ├── HeroSection.tsx
│   │   ├── CategoriesSection.tsx
│   │   ├── FeaturedProductsSection.tsx
│   │   ├── HowItWorksSection.tsx
│   │   ├── DeliveryInfoSection.tsx
│   │   └── AppDownloadSection.tsx
│   └── providers/         # Context providers
│       └── QueryProvider.tsx
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities
│   ├── api.ts            # API functions
│   └── utils.ts          # Helper functions
├── store/                 # Zustand stores
│   └── cartStore.ts      # Cart & auth state
├── types/                 # TypeScript types
│   └── index.ts          # All type definitions
├── public/               # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── postcss.config.js
```

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand (cart), React Query (server state)
- **Forms**: React Hook Form + Zod
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Date**: date-fns

## 🎨 Design System

### Colors
- Primary: Green (`#22c55e` - Tailwind `primary-500`)
- Secondary: Amber (`#f59e0b` - Tailwind `secondary-500`)
- Background: White/Gray
- Text: Gray-900 (headings), Gray-600 (body)

### Typography
- Font Family: Inter (Latin), Noto Nastaliq Urdu (Urdu)
- Headings: Bold, varying sizes
- Body: Regular, readable sizes

### Components
- Buttons: Primary, Secondary, Outline, Ghost variants
- Cards: White background, subtle shadow, rounded corners
- Forms: Clean inputs with focus states
- Badges: For status indicators

## 📱 Pages

| Route | Description |
|-------|-------------|
| `/` | Home page with all sections |
| `/login` | Phone number login with OTP |
| `/register` | User registration |
| `/category/[slug]` | Category product listing |
| `/product/[id]` | Product detail page |
| `/cart` | Shopping cart |
| `/checkout` | Checkout flow |
| `/atta-chakki` | Atta Chakki service |
| `/orders` | Order history |
| `/track/[orderId]` | Order tracking |
| `/profile` | User profile |
| `/about` | About us |
| `/contact` | Contact page |
| `/faq` | Frequently asked questions |

## 💰 Delivery Charges

- **Free Delivery**: Orders above Rs. 500
- **Free 10AM-2PM Slot**: If ordered before 10AM
- **Standard Delivery**: Rs. 50 for orders below Rs. 500
- **Chicken Orders**: Delivery charges apply (Rs. 50)

## 🔌 API Integration

The website is configured to connect to a backend API at `http://localhost:3000/api`. 

Update the `NEXT_PUBLIC_API_URL` environment variable in `.env.local` to point to your API:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

### API Endpoints Expected:
- `GET /api/products` - List products
- `GET /api/products/:id` - Get product details
- `GET /api/categories` - List categories
- `POST /api/auth/login` - Login
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/register` - Register
- `GET /api/orders` - List orders
- `POST /api/orders` - Create order
- `GET /api/orders/:id/track` - Track order

## 🧪 Mock Data

The website includes mock data for demonstration purposes:
- Products (vegetables, fruits, dry fruits, chicken)
- Categories
- User data
- Orders

Replace these with actual API calls for production use.

## 📱 Mobile Responsive

The website is fully responsive with:
- Mobile-first design approach
- Touch-friendly UI elements
- Mobile navigation bar
- Optimized layouts for all screen sizes

## 🔒 Authentication Flow

1. User enters phone number on login page
2. OTP is sent (mocked)
3. User enters OTP
4. On success, token is stored and user is redirected

Protected routes check for authentication token.

## 🛒 Cart Functionality

- Add/remove items
- Update quantities
- Persistent storage (localStorage)
- Delivery charge calculation
- Real-time cart count in header

## 📝 License

This project is created for demonstration purposes.

## 🤝 Support

For support, email support@freshbazar.pk or call 0300-1234567.

---

**Fresh Bazar Pakistan** - Fresh Sabzi at Your Doorstep

تازہ سبزیاں آپ کے دروازے پر
