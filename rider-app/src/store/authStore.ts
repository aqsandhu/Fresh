import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Rider, LoginCredentials } from '../types';
import authService from '../services/auth.service';
import socketService from '../services/socket.service';
import { storeTokens, clearTokens, getStoredToken } from '../lib/secureTokens';
import { registerSessionHandlers } from '../lib/sessionEvents';
import { offlineQueue } from '../utils/offlineQueue';
import { getApiErrorMessage } from '../services/api';
import { STORAGE_KEYS } from '../utils/constants';

interface AuthState {
  rider: Rider | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  /** Why the last session ended (shown on Login) — e.g. account deactivated. */
  sessionEndReason: string | null;

  login: (credentials: LoginCredentials) => Promise<void>;
  refreshProfile: () => Promise<Rider | null>;
  setRider: (rider: Rider) => void;
  clearError: () => void;
  clearSessionEndReason: () => void;
  /** User-initiated sign out: tells the backend, goes off duty, clears tokens. */
  logout: () => Promise<void>;
  /** Session ended by the system (401/403). `reason` is shown on Login. */
  endSession: (reason: string | null) => void;
  /** Loads the access token from SecureStore into memory on app start. */
  hydrateAuth: () => Promise<void>;
}

// Lazy to avoid the import cycle authStore → dutyStore → authStore.
const dutyTeardown = async () => {
  const { useDutyStore } = require('./dutyStore') as typeof import('./dutyStore');
  await useDutyStore.getState().teardown();
};

const clearLocalSession = (set: (partial: Partial<AuthState>) => void, reason: string | null) => {
  offlineQueue.clearQueue().catch(() => {});
  socketService.disconnect();
  clearTokens().catch(() => {});
  dutyTeardown().catch(() => {});
  set({
    rider: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    sessionEndReason: reason,
  });
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      rider: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      isHydrated: false,
      error: null,
      sessionEndReason: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null, sessionEndReason: null });
        try {
          const response = await authService.login(credentials);
          await storeTokens(response.token, response.refreshToken);
          set({
            rider: response.rider,
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          // Enrich with the full profile — best-effort, login already succeeded.
          get().refreshProfile().catch(() => {});
        } catch (error) {
          set({ error: getApiErrorMessage(error, 'Login failed'), isLoading: false });
          throw error;
        }
      },

      refreshProfile: async () => {
        try {
          const profile = await authService.getProfile();
          set((state) => ({ rider: { ...(state.rider ?? {}), ...profile } as Rider }));
          return profile;
        } catch {
          return null;
        }
      },

      setRider: (rider) => set({ rider }),
      clearError: () => set({ error: null }),
      clearSessionEndReason: () => set({ sessionEndReason: null }),

      logout: async () => {
        // Go off duty on the server first (tokens are still valid here).
        try {
          const { useDutyStore } = require('./dutyStore') as typeof import('./dutyStore');
          if (useDutyStore.getState().isOnDuty) {
            await useDutyStore.getState().goOffDuty({ silent: true });
          }
        } catch {
          /* best-effort */
        }
        authService.logout().catch(() => {});
        clearLocalSession(set, null);
      },

      endSession: (reason) => {
        clearLocalSession(set, reason);
      },

      hydrateAuth: async () => {
        const token = await getStoredToken();
        if (token) {
          set({ token, isAuthenticated: true, isHydrated: true });
        } else {
          set({ isAuthenticated: false, isHydrated: true });
        }
      },
    }),
    {
      name: STORAGE_KEYS.AUTH,
      storage: createJSONStorage(() => AsyncStorage),
      // Tokens live in SecureStore, not in the AsyncStorage-persisted blob.
      partialize: (state) => ({
        rider: state.rider,
        isAuthenticated: state.isAuthenticated,
        sessionEndReason: state.sessionEndReason,
      }),
    }
  )
);

registerSessionHandlers({
  onClear: () => useAuthStore.getState().endSession(null),
  onTokenUpdate: (token) => useAuthStore.setState({ token, isAuthenticated: true }),
});
