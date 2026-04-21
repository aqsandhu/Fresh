# PakGrocery Customer App

A complete React Native mobile application for the Pakistani grocery delivery platform. Built with Expo SDK 50, this app provides a seamless shopping experience for customers to order fresh groceries, track deliveries, and use the Atta Chakki (wheat grinding) service.

## Features

### Authentication
- Phone number-based login with OTP verification
- User registration with profile completion
- Secure token-based authentication

### Shopping Experience
- Browse categories: Sabzi (Vegetables), Fruit, Dry Fruit, Chicken, Atta Chakki
- Search products with real-time filtering
- Product details with images, pricing, and nutritional info
- Add to cart with quantity management

### Cart & Checkout
- Full cart management (add, update, remove items)
- Free delivery info (10AM-2PM window)
- Address selection with Google Maps integration
- Door picture capture using camera
- Delivery time slot selection
- Cash on Delivery payment
- Order confirmation

### Atta Chakki Service
- Request wheat grinding service
- Pickup and delivery scheduling
- Real-time status tracking
- Price calculation (Rs. 8/kg)

### Order Management
- View order history
- Track active orders with live map
- Order status timeline
- Rider information and contact

### Profile
- Edit profile information
- Manage multiple addresses
- Notification preferences
- App settings

## Tech Stack

- **Framework**: Expo SDK 50
- **Language**: TypeScript
- **Navigation**: React Navigation (Bottom Tabs + Stack)
- **State Management**: Zustand
- **API Client**: Axios
- **Data Fetching**: React Query (TanStack Query)
- **UI Components**: Custom components with React Native Paper
- **Maps**: React Native Maps
- **Camera**: Expo Camera
- **Notifications**: Expo Notifications
- **Storage**: AsyncStorage

## Project Structure

```
customer-app/
├── src/
│   ├── navigation/         # Navigation setup
│   │   ├── AppNavigator.tsx
│   │   ├── AuthNavigator.tsx
│   │   ├── TabNavigator.tsx
│   │   └── ...
│   ├── screens/            # All screens
│   │   ├── auth/           # Login, OTP, Register
│   │   ├── home/           # Home, Search
│   │   ├── category/       # Categories, Products, Details
│   │   ├── cart/           # Cart
│   │   ├── checkout/       # Address, TimeSlot, Payment, Confirmation
│   │   ├── atta/           # Atta Chakki screens
│   │   ├── orders/         # Orders list, details, tracking
│   │   └── profile/        # Profile, Settings, Addresses
│   ├── components/         # Reusable components
│   │   ├── common/         # Button, Input, Card, Skeleton, etc.
│   │   ├── product/        # ProductCard, CategoryCard, QuantitySelector
│   │   └── home/           # BannerCarousel, SearchBar, etc.
│   ├── hooks/              # Custom hooks
│   ├── services/           # API services
│   │   ├── api.ts          # Axios configuration
│   │   ├── auth.service.ts
│   │   ├── product.service.ts
│   │   ├── cart.service.ts
│   │   ├── order.service.ts
│   │   ├── address.service.ts
│   │   ├── atta.service.ts
│   │   └── notification.service.ts
│   ├── store/              # Zustand stores
│   │   ├── authStore.ts
│   │   ├── cartStore.ts
│   │   ├── checkoutStore.ts
│   │   └── notificationStore.ts
│   ├── utils/              # Helpers and constants
│   │   ├── constants.ts
│   │   └── helpers.ts
│   └── types/              # TypeScript types
│       └── index.ts
├── assets/                 # Images, fonts
├── App.tsx                 # Main entry point
├── app.json                # Expo configuration
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript configuration
└── babel.config.js         # Babel configuration
```

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- iOS: Xcode (Mac only)
- Android: Android Studio with emulator

### Setup

1. **Clone the repository**
```bash
cd /mnt/okcomputer/output/customer-app
```

2. **Install dependencies**
```bash
npm install
```

3. **Start the development server**
```bash
npm start
# or
expo start
```

4. **Run on device/simulator**
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app on physical device

## Environment Configuration

Create a `.env` file in the root directory:

```env
API_BASE_URL=http://localhost:3000/api
```

For production, update the API URL accordingly.

## API Integration

The app is configured to work with a backend API at `http://localhost:3000/api`. 

### Mock Data
For development without a backend, the services include mock data that simulates API responses. This allows you to test the full app functionality.

### Real API
To connect to a real backend:
1. Update `API_BASE_URL` in `src/utils/constants.ts`
2. Uncomment real API calls in service files
3. Remove or comment out mock data returns

## Key Features Implementation

### Push Notifications
Push notifications are configured using Expo Notifications. The app handles:
- Order status updates
- Rider arrival notifications ("Aapka order darwaze par hai")
- Atta request updates
- Promotional notifications

### Location Services
- Google Maps integration for address selection
- Real-time rider tracking on map
- Current location detection

### Camera Integration
- Door picture capture for delivery addresses
- Profile picture upload (placeholder)

### State Management
Zustand stores manage:
- Authentication state
- Cart items with persistence
- Checkout flow state
- Notification state

## Building for Production

### iOS
```bash
expo build:ios
```

### Android
```bash
expo build:android
```

### EAS Build (Recommended)
```bash
# Configure EAS
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

## Customization

### Theme Colors
Update colors in `src/utils/constants.ts`:
```typescript
export const COLORS = {
  primary: '#2E7D32',      // Main green color
  primaryDark: '#1B5E20',
  primaryLight: '#4CAF50',
  // ... other colors
};
```

### Categories
Modify categories in `src/utils/constants.ts`:
```typescript
export const CATEGORIES = [
  { id: 'sabzi', name: 'Sabzi', nameUrdu: 'سبزی', ... },
  // ... add more categories
];
```

## Troubleshooting

### Metro bundler issues
```bash
npx expo start --clear
```

### iOS build issues
```bash
cd ios && pod install && cd ..
```

### Android build issues
```bash
cd android && ./gradlew clean && cd ..
```

### Reset cache
```bash
npx expo start --reset-cache
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is proprietary and confidential.

## Support

For support, contact the development team or create an issue in the repository.

---

**PakGrocery - Fresh Delivery for Pakistan**
