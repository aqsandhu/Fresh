import { create } from 'zustand';

/**
 * Shared open/close state for the global overlay chrome that mirrors the
 * website: the left Categories drawer, the right Quick-help (Utility) drawer,
 * the Instructions popup, and the AI-support chat. Lifting these to a store
 * lets one surface open another (e.g. the utility rail's "Support" opens the
 * AI chat, its "Instructions" opens the tips popup) exactly like the web.
 *
 * `peek` marks the welcome auto-peek: the rails slide in but WITHOUT a dark
 * backdrop, so both edges can peek at once over the visible home page.
 */
interface ToggleState {
  open: boolean;
  peek: boolean;
  setOpen: (open: boolean, peek?: boolean) => void;
  toggle: () => void;
}

const makeToggle = () =>
  create<ToggleState>((set, get) => ({
    open: false,
    peek: false,
    setOpen: (open, peek = false) => set({ open, peek: open ? peek : false }),
    toggle: () => set({ open: !get().open, peek: false }),
  }));

/** Left edge rail — shop categories + Today's Basket. */
export const useLeftDrawer = makeToggle();
/** Right edge rail — Support / Instructions / City / Shop / WhatsApp. */
export const useRightDrawer = makeToggle();
/** Per-page Urdu instructions popup (amber lightbulb). */
export const useInstructionsPopup = makeToggle();
/** AI support chat sheet (also has its own floating button). */
export const useAiChatUi = makeToggle();
