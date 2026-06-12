import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authService } from '@/services/auth.service';
import { normalizeAdminUser } from '@/lib/adminUser';
import { refreshAdminAccessToken, tokenNeedsRefresh } from '@/lib/adminTokenRefresh';
import { AUTH_COOKIES_ENABLED } from '@/config/env';
import type { User, LoginCredentials } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
        if (!storedUser) {
          setIsLoading(false);
          return;
        }
        const freshUser = await authService.fetchSession();
        if (freshUser) {
          setUser(freshUser);
        } else {
          authService.logout();
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

  const login = async (credentials: LoginCredentials): Promise<void> => {
    const response = await authService.login(credentials);
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

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
