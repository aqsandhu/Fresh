// Shared mock for '@/services/api' used by the service unit tests.
// `unwrap` mirrors the real implementation (throws on empty data) so the
// tests exercise the same success/failure semantics the pages see.

export const mockApi = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  postForm: jest.fn(),
  putForm: jest.fn(),
};

export const mockApiClient = {
  get: jest.fn(),
  post: jest.fn(),
};

export function realUnwrap<T>(response: { data?: T; message?: string }): T {
  if (response.data === undefined || response.data === null) {
    throw new Error(response.message || 'Empty API response');
  }
  return response.data;
}

export function apiModuleMock() {
  return {
    api: mockApi,
    apiClient: mockApiClient,
    unwrap: realUnwrap,
    toCamelCase: (x: unknown) => x,
    toSnakeCase: (x: unknown) => x,
  };
}

export function resetApiMocks(): void {
  for (const fn of Object.values(mockApi)) fn.mockReset();
  for (const fn of Object.values(mockApiClient)) fn.mockReset();
}
