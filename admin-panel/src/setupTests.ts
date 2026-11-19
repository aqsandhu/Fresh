import '@testing-library/jest-dom';

process.env.VITE_API_URL = 'http://localhost:3000/api';
process.env.NODE_ENV = 'test';

// No unit test may reach the network (D10). An un-mocked request — the Login
// page's brand logo asked the real API — kept the jest worker alive after the
// tests ("A worker process has failed to exit gracefully"). Now it fails at
// once and names the call that needs a mock.
const testNetworkError = (what: string) =>
  Object.assign(new Error(`Unit tests must not reach the network (${what}). Mock the service.`), { code: 'ERR_TEST_NETWORK' });
require('axios').default.defaults.adapter = (config: { method?: string; url?: string }) =>
  Promise.reject(testNetworkError(`${(config.method || 'get').toUpperCase()} ${config.url}`));
global.fetch = jest.fn((url: unknown) => Promise.reject(testNetworkError(`fetch ${String(url)}`))) as unknown as typeof fetch;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock window.innerWidth
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  value: 1024,
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// Suppress console errors during tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (/Warning.*not wrapped in act/.test(args[0])) return;
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
