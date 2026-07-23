import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Rider, LoginCredentials } from '../types';
import authService from '../services/auth.service';
import { locationService } from '../services/location.service';
import socketService from '../services/socket.service';
import { storeTokens, clearTokens, getStoredToken } from '../lib/secureTokens';
import { registerSessionHandlers } from '../lib/sessionEvents';
import { offlineQueue } from '../utils/offlineQueue';

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
  /** Loads the access token from SecureStore into memory on app start. */
  hydrateAuth: () => Promise<void>;
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
          await storeTokens(response.token, response.refreshToken);
          set({
            rider: response.rider,
            token: response.token,
            isAuthenticated: true,
            // Login response already reflects the backend status; getProfile
            // below overrides it with the freshest value when available.
            isOnline: response.rider.isOnline,
            isLoading: false,
            error: null,
          });
          // Enrich with the real profile (total deliveries, rating, online
          // status) — best-effort, login already succeeded.
          try {
            const profile = await authService.getProfile();
            set({
              rider: { ...response.rider, ...profile },
              isOnline: profile.isOnline,
            });
          } catch {
            // keep the login-mapped rider
          }
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
        // Drop queued offline actions from this session (stale task actions
        // must not leak into the next login).
        offlineQueue.clearQueue().catch(() => {});
        // Best-effort: tell the backend we are offline before tokens go away.
        // Retry once; if it still fails, queue it for replay when back online.
        authService
          .updateOnlineStatus(false)
          .catch(() => authService.updateOnlineStatus(false))
          .catch(() => offlineQueue.addAction('update_status', { status: 'offline' }))
          .catch(() => {});
        // Best-effort: revoke the session server-side before clearing tokens
        authService.logout().catch(() => {});
        // Stop GPS tracking and tear down the socket before clearing tokens
        locationService.stopTracking().catch(() => {});
        socketService.disconnect();
        clearTokens().catch(() => {});
        set({
          rider: null,
          token: null,
          isAuthenticated: false,
          isOnline: false,
          isLoading: false,
          error: null,
        });
      },

      hydrateAuth: async () => {
        const token = await getStoredToken();
        if (token) {
          set({ token, isAuthenticated: true });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Tokens live in SecureStore, not in the AsyncStorage-persisted blob.
      partialize: (state) => ({
        rider: state.rider,
        isAuthenticated: state.isAuthenticated,
        isOnline: state.isOnline,
      }),
    }
  )
);

registerSessionHandlers({
  onClear: () => useAuthStore.getState().logout(),
  onTokenUpdate: (token) => useAuthStore.setState({ token, isAuthenticated: true }),
});
