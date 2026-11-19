// The website's API calls, split by subject (W21). Every page keeps importing
// from '@/lib/api'; the HTTP client and the product mappers are in ./api/shared.

export * from './api/catalog'
export * from './api/account'
export * from './api/orders'
export * from './api/feedback'
export * from './api/services'
export { PRODUCTS_PAGE_SIZE, nextProductPage } from './api/shared'
export { api as default } from './api/shared'
