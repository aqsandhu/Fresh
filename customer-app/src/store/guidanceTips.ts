import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GuidanceTipsState {
  /** Global on/off for the Urdu guidance tips. Default ON. */
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
}

export const useGuidanceTips = create<GuidanceTipsState>()(
  persist(
    (set, get) => ({
      enabled: true,
      setEnabled: (v) => set({ enabled: v }),
      toggle: () => set({ enabled: !get().enabled }),
    }),
    {
      name: 'guidance-tips',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ enabled: state.enabled }),
    }
  )
);
