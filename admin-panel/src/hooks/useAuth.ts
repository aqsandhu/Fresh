import { useState, useEffect, useCallback } from 'react';
import { authService } from '@/services/auth.service';
import type { User, LoginCredentials } from '@/types';

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = authService.getCurrentUser();
    if (storedUser) {
      setUser(storedUser);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    const response = await authService.login(credentials);
    setUser(response.user);
  }, []);

  const logout = useCallback((): void => {
    authService.logout();
    setUser(null);
  }, []);

  const checkAuth = useCallback(async (): Promise<boolean> => {
    const isValid = await authService.verifyToken();
    if (!isValid) {
      logout();
    }
    return isValid;
  }, [logout]);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    checkAuth,
  };
};
