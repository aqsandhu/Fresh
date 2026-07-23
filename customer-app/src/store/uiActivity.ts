import { create } from 'zustand';

/**
 * A tiny global "the user just did something" signal. A capture-phase touch
 * observer at the app root bumps it on every touch-down; the Instructions
 * lightbulb watches it to collapse its idle "get help" label the moment the
 * shopper becomes active again (mirrors the website's scroll/click/touch reset).
 */
interface UiActivityState {
  tick: number;
  bump: () => void;
}

export const useUiActivity = create<UiActivityState>((set, get) => ({
  tick: 0,
  bump: () => set({ tick: get().tick + 1 }),
}));
