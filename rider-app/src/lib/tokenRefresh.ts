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
});

export const { refreshAccessToken, getValidAccessToken, tokenNeedsRefresh } =
  refreshService;
