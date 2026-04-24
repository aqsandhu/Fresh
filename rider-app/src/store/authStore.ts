import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Rider, LoginCredentials } from '../types';
import authService from '../services/auth.service';
import { STORAGE_KEYS } from '../utils/constants';

interface AuthState {
  rider: Rider | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isOnline: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  clearError: () => void;
  setRider: (rider: Rider) => void;
  setToken: (token: string) => void;
  setRefreshToken: (refreshToken: string) => void;
  setOnline: (online: boolean) => void;
  updateStats: (deliveries: number, earnings: number) => void;
  refreshAccessToken: () => Promise<string | null>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      rider: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isOnline: false,
      isLoading: false,
      error: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.login(credentials);
          await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, response.token);
          await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.refreshToken);
          set({
            rider: response.rider,
            token: response.token,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          const message = error?.response?.data?.message || error?.message || 'Login failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      clearError: () => set({ error: null }),

      setRider: (rider) => set({ rider, isAuthenticated: true }),
      
      setToken: (token) => set({ token }),
      
      setRefreshToken: (refreshToken) => set({ refreshToken }),
      
      setOnline: (online) => {
        set((state) => ({
          isOnline: online,
          rider: state.rider ? { ...state.rider, isOnline: online } : null,
        }));
      },
      
      updateStats: (deliveries, earnings) => {
        set((state) => ({
          rider: state.rider
            ? {
                ...state.rider,
                todayDeliveries: deliveries,
                todayEarnings: earnings,
              }
            : null,
        }));
      },

      refreshAccessToken: async () => {
        const currentRefreshToken = get().refreshToken || await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
        if (!currentRefreshToken) {
          return null;
        }
        try {
          const response = await authService.refreshToken(currentRefreshToken);
          if (response.success && response.data) {
            const { accessToken, refreshToken } = response.data;
            await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, accessToken);
            if (refreshToken) {
              await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
              set({ refreshToken });
            }
            set({ token: accessToken });
            return accessToken;
          }
        } catch (error) {
          console.error('Token refresh failed:', error);
        }
        return null;
      },
      
      logout: () => {
        AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        AsyncStorage.removeItem(STORAGE_KEYS.RIDER_DATA);
        set({
          rider: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isOnline: false,
          isLoading: false,
          error: null,
        });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        rider: state.rider, 
        token: state.token, 
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);
