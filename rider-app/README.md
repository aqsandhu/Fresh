# Rider App - Pakistani Grocery Delivery

A React Native mobile application for delivery riders in Pakistan. Built with Expo SDK 50, featuring background GPS tracking, high-contrast UI for outdoor use, and privacy-protected customer communication.

## Features

- **Authentication**: Phone + password login for riders
- **Online/Offline Toggle**: Control availability for receiving tasks
- **Dashboard**: View today's stats (deliveries, earnings)
- **Task Management**: View assigned tasks with order details
- **Task Details**: 
  - Order items list
  - Address with Google Maps integration
  - Large house number display
  - Navigate button (opens Google Maps)
  - Call Customer button (privacy-protected via API)
  - Mark Picked Up / Mark Delivered buttons
- **Profile**: Rider info, earnings summary, logout
- **Background GPS Tracking**: Sends location to server every 30 seconds when online
- **High Contrast UI**: Large buttons and clear text for outdoor visibility

## Tech Stack

- **Framework**: React Native with Expo SDK 50
- **Navigation**: React Navigation (Native Stack + Bottom Tabs)
- **State Management**: Zustand with AsyncStorage persistence
- **Maps**: React Native Maps
- **Location**: Expo Location + Expo Task Manager
- **HTTP Client**: Axios
- **Storage**: AsyncStorage

## Project Structure

```
rider-app/
├── App.tsx                    # Main app entry point
├── app.json                   # Expo configuration
├── package.json               # Dependencies
├── src/
│   ├── navigation/
│   │   └── AppNavigator.tsx   # Navigation configuration
│   ├── screens/
│   │   ├── LoginScreen.tsx    # Phone + password login
│   │   ├── DashboardScreen.tsx # Stats and online toggle
│   │   ├── TasksListScreen.tsx # List of assigned tasks
│   │   ├── TaskDetailScreen.tsx # Task details with actions
│   │   └── ProfileScreen.tsx  # Rider profile and logout
│   ├── services/
│   │   ├── api.ts             # Axios API client
│   │   ├── auth.service.ts    # Authentication API calls
│   │   ├── task.service.ts    # Task management API calls
│   │   └── location.service.ts # GPS tracking service
│   ├── store/
│   │   └── authStore.ts       # Zustand auth state
│   └── types/
│       └── index.ts           # TypeScript types
└── README.md
```

## API Endpoints

Base URL: `http://localhost:3000/api`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/rider/login` | POST | Phone + password login |
| `/rider/profile` | GET | Get rider profile |
| `/rider/status` | PUT | Update online/offline status |
| `/rider/location` | PUT | Update rider location |
| `/rider/tasks` | GET | Get assigned tasks |
| `/rider/tasks/:id` | GET | Get task details |
| `/rider/tasks/:id/status` | PATCH | Update task status |
| `/rider/call-request` | POST | Request privacy-protected call |

## Installation

1. **Install dependencies**:
   ```bash
   cd rider-app
   npm install
   ```

2. **Start the development server**:
   ```bash
   npx expo start
   ```

3. **Run on device/simulator**:
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app on physical device

## Environment Setup

### iOS
- Requires Xcode 14+ and iOS 13+
- Location permissions are requested automatically
- Background location updates enabled

### Android
- Requires Android SDK 21+
- Location permissions in `AndroidManifest.xml`:
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_COARSE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION`
  - `FOREGROUND_SERVICE`

## Configuration

Update the API base URL in `src/services/api.ts`:

```typescript
const API_BASE_URL = 'http://localhost:3000/api';
```

For production, change to your actual API endpoint.

## Location Tracking

The app tracks rider location in the background when:
1. Rider is logged in AND
2. Rider is online (toggled ON)

Location updates are sent every 30 seconds to the server.

## Privacy Features

- Customer phone numbers are NOT displayed in the app
- Riders request calls through the API (`/rider/call-request`)
- The system connects the call while protecting customer privacy

## UI Design

- **Dark theme** with high contrast for outdoor visibility
- **Large buttons** (minimum 50x50 touch targets)
- **Bold typography** for easy reading in sunlight
- **Color coding**:
  - Green (#10B981): Success, Online, Earnings
  - Red (#DC2626): Offline, Logout, Cancelled
  - Blue (#3B82F6): Navigation, Info
  - Yellow (#F59E0B): Pickup, Warning
  - Purple (#8B5CF6): Call button

## Building for Production

### iOS
```bash
npx expo prebuild
npx expo run:ios --configuration Release
```

### Android
```bash
npx expo prebuild
npx expo run:android --variant release
```

Or use EAS Build:
```bash
npx eas build --platform ios
npx eas build --platform android
```

## License

MIT
