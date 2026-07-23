import { createTokenRefreshService } from '@freshbazar/core-auth';
import { API_BASE_URL } from '../utils/constants';
import { notifyTokenRefreshed } from './sessionEvents';
import { tokenStorage } from './secureTokens';

const refreshService = createTokenRefreshService({
  apiBaseUrl: API_BASE_URL,
  storage: tokenStorage,
  onTokenRefreshed: (accessToken) => {
    if (accessToken) notifyTokenRefreshed(accessToken);
  },
  // Only fires on GENUINE auth rejection (401/403 from /auth/refresh or no
  // refresh token). Transient errors return null silently — the caller must
  // NOT log the user out for those.
  onRefreshFailed: () => {
    // Lazy require avoids the import cycle authStore → auth.service → api → here
    const { useAuthStore } = require('../store/authStore');
    useAuthStore.getState().logout();
  },
});

export const { refreshAccessToken, getValidAccessToken, tokenNeedsRefresh } =
  refreshService;
