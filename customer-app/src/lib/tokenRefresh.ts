import { createTokenRefreshService } from '@freshbazar/core-auth';
import { API_BASE_URL } from '@utils/constants';
import { notifyTokenRefreshed } from '@/lib/sessionEvents';
import { tokenStorage } from '@/lib/secureTokens';

// Set when the server REFUSED the refresh token (401/403, or none stored).
// core-auth never calls onRefreshFailed for a weak network / timeout / 5xx.
let sessionRefused = false;

const refreshService = createTokenRefreshService({
  apiBaseUrl: API_BASE_URL,
  storage: tokenStorage,
  onTokenRefreshed: (accessToken) => {
    if (accessToken) notifyTokenRefreshed(accessToken);
  },
  onRefreshFailed: () => {
    sessionRefused = true;
  },
});

export const {
  refreshAccessToken,
  getValidAccessToken,
  tokenNeedsRefresh,
} = refreshService;

/**
 * Refresh and say WHY it failed (I8, round 8). The app used to sign the
 * customer out whenever a refresh returned nothing — a weak mobile signal
 * at the moment the 15-minute token ran out was enough. Only `refused` is a
 * real end of the session.
 */
export async function refreshAccessTokenWithReason(): Promise<{ token: string | null; refused: boolean }> {
  sessionRefused = false;
  const token = await refreshService.refreshAccessToken();
  return { token, refused: token === null && sessionRefused };
}
