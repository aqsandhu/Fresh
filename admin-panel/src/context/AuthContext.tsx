import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authService } from '@/services/auth.service';
import { normalizeAdminUser } from '@/lib/adminUser';
import { adoptCookieSession, refreshAdminAccessToken, tokenNeedsRefresh } from '@/lib/adminTokenRefresh';
import { AUTH_COOKIES_ENABLED } from '@/config/env';
import type { User, LoginCredentials, LoginOtpChallenge } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Resolves to a challenge when the server wants the one-time code next. */
  login: (credentials: LoginCredentials) => Promise<void | LoginOtpChallenge>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_RESYNC_MS = 5 * 60 * 1000;

/** Same role, city and permission set — no re-render needed. */
function sameAccess(a: User, b: User): boolean {
  const key = (u: User) =>
    [u.role, u.adminRoleId ?? '', u.adminRoleCityId ?? '', [...(u.permissions ?? [])].sort().join(',')].join('|');
  return key(a) === key(b);
}

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedUser = authService.getCurrentUser();

      // Cookie mode: tokens are HttpOnly (unreadable). The cached user marks
      // a probable session; /admin/me (with the 401→refresh→retry
      // interceptor behind it) is the authority.
      if (AUTH_COOKIES_ENABLED) {
        // Old localStorage tokens (from before cookie mode) are traded for a
        // cookie session and removed.
        await adoptCookieSession();
        if (!storedUser) {
          setIsLoading(false);
          return;
        }
        try {
          const freshUser = await authService.fetchSession();
          if (freshUser) {
            setUser(freshUser);
          } else {
            authService.logout();
          }
        } catch {
          // Server down / restarting (G13): stay signed in with the stored
          // user — the next request or window focus re-checks the session.
          setUser(storedUser);
        }
        setIsLoading(false);
        return;
      }

      const token = authService.getToken();
      const refreshToken = authService.getRefreshToken();

      if (!storedUser || !refreshToken) {
        authService.logout();
        setIsLoading(false);
        return;
      }

      try {
        if (tokenNeedsRefresh(token)) {
          const newToken = await refreshAdminAccessToken();
          if (!newToken) {
            authService.logout();
            setIsLoading(false);
            return;
          }
        }
        const freshUser = await authService.fetchSession();
        setUser(freshUser || storedUser);
      } catch {
        // Server unreachable (G13): keep the stored session instead of signing out.
        setUser(storedUser);
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Refresh access token in the background before it expires. Cookie mode
  // skips this: expiry isn't readable from JS and the axios interceptor
  // already refreshes-and-retries on 401.
  useEffect(() => {
    if (!user || AUTH_COOKIES_ENABLED) return;

    const tick = () => {
      if (tokenNeedsRefresh(authService.getToken())) {
        refreshAdminAccessToken().catch(() => {});
      }
    };

    tick();
    const id = window.setInterval(tick, 5 * 60 * 1000);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

  // A role change by the owner used to reach an open panel only after a page
  // reload — staff kept seeing menus the server now refuses (or missed new
  // ones). Re-read the session when the window regains focus and every 5 min.
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    const sync = () => {
      authService
        .fetchSession()
        .then((fresh) => {
          if (!alive || !fresh) return;
          setUser((prev) => (prev && sameAccess(prev, fresh) ? prev : fresh));
        })
        .catch(() => {});
    };
    const id = window.setInterval(sync, SESSION_RESYNC_MS);
    window.addEventListener('focus', sync);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener('focus', sync);
    };
  }, [signedIn]);

  const login = async (credentials: LoginCredentials): Promise<void | LoginOtpChallenge> => {
    const response = await authService.login(credentials);
    if ('requiresOtp' in response) return response;
    const normalized = normalizeAdminUser(response.user) ?? response.user;
    setUser(normalized);
  };

  const logout = (): void => {
    authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Companion hook of the provider above — splitting it into its own file would
// churn every consumer import for a hot-reload-only concern.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
