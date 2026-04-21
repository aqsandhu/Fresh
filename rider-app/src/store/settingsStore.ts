import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types';

interface SettingsState extends AppSettings {
  // Actions
  setLanguage: (language: 'en' | 'ur') => void;
  toggleNotifications: () => void;
  toggleSound: () => void;
  toggleVibration: () => void;
  toggleAutoAcceptTasks: () => void;
  toggleDarkMode: () => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: AppSettings = {
  language: 'en',
  notificationsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  autoAcceptTasks: false,
  darkMode: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Initial state
      ...defaultSettings,

      // Set language
      setLanguage: (language) => {
        set({ language });
      },

      // Toggle notifications
      toggleNotifications: () => {
        set((state) => ({ notificationsEnabled: !state.notificationsEnabled }));
      },

      // Toggle sound
      toggleSound: () => {
        set((state) => ({ soundEnabled: !state.soundEnabled }));
      },

      // Toggle vibration
      toggleVibration: () => {
        set((state) => ({ vibrationEnabled: !state.vibrationEnabled }));
      },

      // Toggle auto accept tasks
      toggleAutoAcceptTasks: () => {
        set((state) => ({ autoAcceptTasks: !state.autoAcceptTasks }));
      },

      // Toggle dark mode
      toggleDarkMode: () => {
        set((state) => ({ darkMode: !state.darkMode }));
      },

      // Update multiple settings
      updateSettings: (settings) => {
        set((state) => ({ ...state, ...settings }));
      },

      // Reset to defaults
      resetSettings: () => {
        set(defaultSettings);
      },
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useSettingsStore;
