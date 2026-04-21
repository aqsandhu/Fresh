# Pakistani Grocery Delivery - Admin Panel

A comprehensive React-based Admin Panel for managing a Pakistani grocery delivery platform. Built with modern technologies and best practices.

## Features

### Authentication
- JWT-based authentication
- Secure login with token storage
- Protected routes
- Automatic token expiration handling

### Dashboard
- Real-time statistics cards (Daily Sales, Total Orders, Pending Orders, Completed Orders)
- Sales trend charts (7-day view)
- Order status distribution pie chart
- Recent orders list
- Low stock product alerts

### Order Management
- Complete orders table with filtering
- Order details modal with:
  - Customer information
  - Items list with pricing
  - Delivery address with map link
  - Order timeline
  - Rider assignment
- Status update workflow
- First-order marking for house number assignment

### Product Management
- Product grid with search and filter
- Add/Edit product with image upload
- Stock management
- Category assignment
- Active/Inactive toggle
- Featured products

### Category Management
- Category list with Urdu + English names
- Category image upload
- Product count per category
- Active/Inactive toggle

### Rider Management
- Rider list with status
- Add new rider with vehicle info
- Real-time location tracking
- Task assignment view
- Status management (available/busy/offline)

### Atta Chakki Service
- Wheat grinding request management
- Status workflow: pending_pickup → picked_up → at_mill → ready → out_for_delivery → delivered
- Pickup and delivery rider assignment
- Request details with customer info

### WhatsApp Orders
- Manual order creation form
- Customer details and address
- Multiple item entry
- Convert to regular order

### Address Management
- Pending addresses list
- House number assignment
- Door picture view
- Map location integration

### Settings
- Delivery charge configuration
- Time slot management
- Business hours setup

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **State Management**: TanStack Query (React Query)
- **HTTP Client**: Axios
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **Date Formatting**: date-fns
- **Notifications**: React Hot Toast

## Project Structure

```
admin-panel/
├── public/
├── src/
│   ├── components/
│   │   ├── ui/           # Reusable UI components (Button, Input, Modal, etc.)
│   │   └── layout/       # Layout components (Sidebar, Header, Layout)
│   ├── pages/            # All page components
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API service functions
│   ├── context/          # React Context (AuthContext)
│   ├── utils/            # Helper functions and formatters
│   ├── types/            # TypeScript type definitions
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Backend API running (see API configuration)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd admin-panel
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
VITE_API_URL=http://localhost:3000/api
```

4. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## API Configuration

The admin panel expects a backend API with the following base URL:
```
http://localhost:3000/api
```

### Required API Endpoints

#### Authentication
- `POST /api/admin/login` - Admin login

#### Dashboard
- `GET /api/admin/dashboard` - Dashboard statistics

#### Orders
- `GET /api/admin/orders` - List orders
- `GET /api/admin/orders/:id` - Get order details
- `PUT /api/admin/orders/:id/status` - Update order status
- `PUT /api/admin/orders/:id/assign-rider` - Assign rider to order
- `PUT /api/admin/orders/:id/mark-first-order` - Mark as first order

#### Products
- `GET /api/products` - List products
- `POST /api/admin/products` - Create product
- `PUT /api/admin/products/:id` - Update product
- `DELETE /api/admin/products/:id` - Delete product

#### Categories
- `GET /api/categories` - List categories
- `POST /api/admin/categories` - Create category
- `PUT /api/admin/categories/:id` - Update category
- `DELETE /api/admin/categories/:id` - Delete category

#### Riders
- `GET /api/admin/riders` - List riders
- `POST /api/admin/riders` - Create rider
- `GET /api/admin/riders/:id/location` - Get rider location

#### Atta Requests
- `GET /api/admin/atta-requests` - List atta requests
- `PUT /api/admin/atta-requests/:id/status` - Update status
- `PUT /api/admin/atta-requests/:id/assign-pickup-rider` - Assign pickup rider
- `PUT /api/admin/atta-requests/:id/assign-delivery-rider` - Assign delivery rider

#### WhatsApp Orders
- `POST /api/admin/whatsapp-orders` - Create WhatsApp order

#### Addresses
- `GET /api/admin/addresses/pending` - List pending addresses
- `PUT /api/admin/addresses/:id/house-number` - Assign house number

#### Settings
- `GET /api/admin/settings` - Get settings
- `PUT /api/admin/settings/delivery` - Update delivery settings
- `GET /api/admin/settings/time-slots` - Get time slots
- `POST /api/admin/settings/time-slots` - Create time slot
- `GET /api/admin/settings/business-hours` - Get business hours
- `PUT /api/admin/settings/business-hours` - Update business hours

## Default Login Credentials

For demo purposes:
- Email: `admin@grocery.pk`
- Password: `admin123`

## Features in Detail

### Responsive Design
- Mobile-first approach
- Collapsible sidebar on mobile
- Responsive tables and grids
- Touch-friendly buttons

### State Management
- Server state managed by React Query
- Automatic caching and refetching
- Optimistic updates
- Error handling with toast notifications

### Form Handling
- Controlled inputs
- Form validation
- Error messages
- Loading states

### Security
- JWT token storage in localStorage
- Protected routes
- Token expiration handling
- API error interception

## Customization

### Theme Colors
Edit `tailwind.config.js` to customize the color scheme:

```javascript
colors: {
  primary: {
    50: '#f0fdf4',
    100: '#dcfce7',
    // ... customize as needed
  },
}
```

### API Base URL
Change the API URL in `vite.config.ts` or set the `VITE_API_URL` environment variable.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary and confidential.

## Support

For support, email support@grocery.pk or contact the development team.
