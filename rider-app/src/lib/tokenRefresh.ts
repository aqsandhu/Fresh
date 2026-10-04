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
    // Lazy require avoids the import cycle authStore → auth.service → api → here.
    // endSession (not logout): tokens are already invalid, so skip the server
    // calls and explain on the Login screen why the rider was signed out.
    const { useAuthStore } = require('../store/authStore') as typeof import('../store/authStore');
    const { t } = require('../i18n') as typeof import('../i18n');
    useAuthStore.getState().endSession(t('auth.sessionEnded'));
  },
});

export const { refreshAccessToken, getValidAccessToken, tokenNeedsRefresh } =
  refreshService;
