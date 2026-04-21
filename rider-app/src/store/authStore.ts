import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Rider, LoginCredentials } from '../types';
import authService from '../services/auth.service';

interface AuthState {
  rider: Rider | null;
  token: string | null;
  isAuthenticated: boolean;
  isOnline: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  clearError: () => void;
  setRider: (rider: Rider) => void;
  setToken: (token: string) => void;
  setOnline: (online: boolean) => void;
  updateStats: (deliveries: number, earnings: number) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      rider: null,
      token: null,
      isAuthenticated: false,
      isOnline: false,
      isLoading: false,
      error: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.login(credentials);
          set({
            rider: response.rider,
            token: response.token,
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
      
      logout: () => {
        set({
          rider: null,
          token: null,
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
    }
  )
);
