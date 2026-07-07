import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthState } from '@app-types';
import { authService } from '@services/auth.service';
import { STORAGE_KEYS } from '@utils/constants';
import {
  storeTokens,
  setStoredToken,
  clearTokens,
} from '@/lib/secureTokens';
import { registerSessionHandlers } from '@/lib/sessionEvents';

interface AuthStore extends AuthState {
  // Actions
  sendOtp: (
    phone: string,
    channel?: 'whatsapp' | 'sms'
  ) => Promise<{
    userExists: boolean;
    userName: string | null;
    /** Channel the backend actually delivered on (undefined in bypass/firebase modes). */
    channel?: 'whatsapp' | 'sms';
  }>;
  verifyOTP: (phone: string, otp: string) => Promise<void>;
  register: (phone: string, code: string, fullName: string, email?: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  // 4-digit PIN flow
  verifyWithPin: (phone: string, pin: string) => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  resetPinAndLogin: (phone: string, code: string, newPin: string) => Promise<void>;
  /** Bumps pinVerifiedAt so the checkout re-auth gate stops asking. */
  markPinVerified: () => void;
  /** Last successful PIN verification (epoch ms). */
  pinVerifiedAt: number | null;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      pinVerifiedAt: null,

      sendOtp: async (phone: string, channel?: 'whatsapp' | 'sms') => {
        set({ isLoading: true });
        try {
          const response = await authService.sendOtp({ phone, channel });
          if (response.success) {
            return {
              userExists: response.data.userExists,
              userName: response.data.userName,
              channel: response.data.channel,
            };
          }
          throw new Error('Failed to send OTP');
        } finally {
          set({ isLoading: false });
        }
      },

      verifyOTP: async (phone: string, otp: string) => {
        set({ isLoading: true });
        try {
          const response = await authService.verifyLogin({ phone, code: otp });
          if (response.success && response.data) {
            const { user, tokens } = response.data;
            await storeTokens(tokens.accessToken, tokens.refreshToken);
            await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
            set({
              user,
              token: tokens.accessToken,
              isAuthenticated: true,
              pinVerifiedAt: Date.now(),
            });
          }
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (phone: string, code: string, fullName: string, email?: string, password?: string) => {
        set({ isLoading: true });
        try {
          const response = await authService.register({ phone, code, full_name: fullName, email, password: password || undefined });
          if (response.success && response.data) {
            const { user, tokens } = response.data;
            await storeTokens(tokens.accessToken, tokens.refreshToken);
            await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
            set({
              user,
              token: tokens.accessToken,
              isAuthenticated: true,
            });
          }
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await authService.logout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          await clearTokens();
          await AsyncStorage.removeItem(STORAGE_KEYS.USER);
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      updateUser: (userData: Partial<User>) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...userData } });
        }
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user });
      },

      setToken: (token: string | null) => {
        set({ token });
        if (token) {
          setStoredToken(token);
        } else {
          clearTokens();
        }
      },

      setLoading: (isLoading: boolean) => {
        set({ isLoading });
      },

      // ── 4-digit PIN flow ──────────────────────────────────────────────
      verifyWithPin: async (phone: string, pin: string) => {
        set({ isLoading: true });
        try {
          const response = await authService.verifyPin(phone, pin);
          if (response.success && response.data) {
            const { user, tokens } = response.data;
            await storeTokens(tokens.accessToken, tokens.refreshToken);
            await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
            set({
              user,
              token: tokens.accessToken,
              isAuthenticated: true,
              pinVerifiedAt: Date.now(),
            });
          }
        } finally {
          set({ isLoading: false });
        }
      },

      setPin: async (pin: string) => {
        set({ isLoading: true });
        try {
          await authService.setPin(pin);
          set({ pinVerifiedAt: Date.now() });
        } finally {
          set({ isLoading: false });
        }
      },

      resetPinAndLogin: async (phone: string, code: string, newPin: string) => {
        set({ isLoading: true });
        try {
          await authService.resetPinWithCode(phone, code, newPin);
          const response = await authService.verifyLogin({ phone, code });
          if (response.success && response.data) {
            const { user, tokens } = response.data;
            await storeTokens(tokens.accessToken, tokens.refreshToken);
            await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
            set({
              user,
              token: tokens.accessToken,
              isAuthenticated: true,
              pinVerifiedAt: Date.now(),
            });
          }
        } finally {
          set({ isLoading: false });
        }
      },

      markPinVerified: () => {
        set({ pinVerifiedAt: Date.now() });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Token is kept in SecureStore, not in the AsyncStorage-persisted blob.
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

registerSessionHandlers({
  onClear: () => {
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },
  onTokenUpdate: (token) => {
    useAuthStore.setState({ token, isAuthenticated: true });
  },
});

export default useAuthStore;
