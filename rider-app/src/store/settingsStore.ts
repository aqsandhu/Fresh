import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types';
import { STORAGE_KEYS } from '../utils/constants';

interface SettingsState extends AppSettings {
  setLanguage: (language: 'en' | 'ur') => void;
  toggleNotifications: () => void;
  toggleSound: () => void;
  toggleVibration: () => void;
  resetSettings: () => void;
}

export const defaultSettings: AppSettings = {
  language: 'en',
  notificationsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setLanguage: (language) => set({ language }),
      toggleNotifications: () => set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),
      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
      toggleVibration: () => set((s) => ({ vibrationEnabled: !s.vibrationEnabled })),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // v1 persisted dead toggles (autoAcceptTasks, darkMode) — drop them.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<AppSettings> & Record<string, unknown>;
        return {
          language: p.language === 'ur' ? 'ur' : 'en',
          notificationsEnabled: p.notificationsEnabled !== false,
          soundEnabled: p.soundEnabled !== false,
          vibrationEnabled: p.vibrationEnabled !== false,
        } as SettingsState;
      },
      partialize: (state) => ({
        language: state.language,
        notificationsEnabled: state.notificationsEnabled,
        soundEnabled: state.soundEnabled,
        vibrationEnabled: state.vibrationEnabled,
      }) as SettingsState,
    }
  )
);

export default useSettingsStore;
