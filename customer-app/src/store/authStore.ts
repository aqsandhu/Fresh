import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthState } from '@types';
import { authService } from '@services/auth.service';
import { STORAGE_KEYS } from '@utils/constants';

interface AuthStore extends AuthState {
  // Actions
  sendOtp: (phone: string) => Promise<{ userExists: boolean; userName: string | null }>;
  verifyOTP: (phone: string, otp: string) => Promise<void>;
  register: (phone: string, code: string, fullName: string, email?: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      sendOtp: async (phone: string) => {
        set({ isLoading: true });
        try {
          const response = await authService.sendOtp({ phone });
          if (response.success) {
            return { userExists: response.data.userExists, userName: response.data.userName };
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
            await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, tokens.accessToken);
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

      register: async (phone: string, code: string, fullName: string, email?: string, password?: string) => {
        set({ isLoading: true });
        try {
          const response = await authService.register({ phone, code, full_name: fullName, email, password: password || undefined });
          if (response.success && response.data) {
            const { user, tokens } = response.data;
            await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, tokens.accessToken);
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
          await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
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
          AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
        } else {
          AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
        }
      },

      setLoading: (isLoading: boolean) => {
        set({ isLoading });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);

export default useAuthStore;
