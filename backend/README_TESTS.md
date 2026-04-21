# FreshBazar Testing Suite

## Overview

This testing suite provides comprehensive test coverage for the FreshBazar grocery delivery platform across backend, frontend, and infrastructure layers.

## Test Structure

### Backend Tests (`backend/tests/`)

| File | Description | Test Count |
|------|-------------|------------|
| `setup.ts` | Test environment configuration, mocks | - |
| `integration/auth.test.ts` | Registration, login, OTP, token refresh, logout | 20+ |
| `integration/products.test.ts` | Product listing, search, filtering, categories | 15+ |
| `integration/orders.test.ts` | Order creation, status updates, tracking, cancellation | 20+ |
| `integration/cart.test.ts` | Cart CRUD, item management, delivery charges | 18+ |
| `integration/atta.test.ts` | Atta grinding orders, configurable charges | 15+ |
| `integration/admin.test.ts` | Admin CRUD, audit logging, RBAC | 20+ |
| `unit/jwt.test.ts` | Token generation, validation, expiry | 20+ |
| `unit/webhook.test.ts` | Webhook idempotency, signature verification | 18+ |
| `unit/delivery-charges.test.ts` | Delivery charge calculation, thresholds | 20+ |

### Frontend Tests

#### Admin Panel (`admin-panel/src/`)

| File | Component/Page | Test Count |
|------|----------------|------------|
| `setupTests.ts` | Testing Library configuration | - |
| `components/__tests__/Sidebar.test.tsx` | Sidebar navigation, user info | 12+ |
| `components/__tests__/StatCard.test.tsx` | Stats display, trends | 10+ |
| `pages/__tests__/Login.test.tsx` | Login form, validation | 18+ |
| `pages/__tests__/Dashboard.test.tsx` | Dashboard data display | 12+ |
| `pages/__tests__/Orders.test.tsx` | Order management | 15+ |
| `pages/__tests__/Addresses.test.tsx` | House number assignment | 14+ |

#### Website (`website/tests/`)

| File | Component/Module | Test Count |
|------|-----------------|------------|
| `setupTests.ts` | Testing Library configuration | - |
| `components/Footer.test.tsx` | Footer layout, links | 12+ |
| `components/Header.test.tsx` | Header navigation, cart | 10+ |
| `store/cartStore.test.ts` | Cart state management | 25+ |

## Running Tests Locally

### Prerequisites
```bash
# Install dependencies
pnpm install

# Build shared types
pnpm --filter @freshbazar/shared-types build
```

### Backend Tests
```bash
# Run all backend tests
pnpm --filter @freshbazar/backend test

# Run with coverage
pnpm --filter @freshbazar/backend test --coverage

# Run specific test file
pnpm --filter @freshbazar/backend test -- auth.test.ts

# Run in watch mode
pnpm --filter @freshbazar/backend test --watch
```

### Admin Panel Tests
```bash
# Run all admin panel tests
pnpm --filter @freshbazar/admin-panel test

# Run with coverage
pnpm --filter @freshbazar/admin-panel test --coverage
```

### Website Tests
```bash
# Run all website tests
pnpm --filter @freshbazar/website test

# Run with coverage
pnpm --filter @freshbazar/website test --coverage
```

## Coverage Thresholds

| Package | Branches | Functions | Lines | Statements |
|---------|----------|-----------|-------|------------|
| Backend | 70% | 70% | 70% | 70% |
| Admin Panel | 60% | 60% | 60% | 60% |
| Website | 50% | 50% | 50% | 50% |

## CI/CD Pipeline

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests targeting `main` or `develop`

See `.github/workflows/` for workflow definitions.
