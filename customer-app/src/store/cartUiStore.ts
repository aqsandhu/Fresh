import { create } from 'zustand';

interface CartUiStore {
  isCartDropdownOpen: boolean;
  /** Screen Y where MobileHeader ends (hero / content starts). */
  mobileHeaderBottomY: number;
  setCartDropdownOpen: (open: boolean) => void;
  toggleCartDropdown: () => void;
  setMobileHeaderBottomY: (y: number) => void;
}

export const useCartUiStore = create<CartUiStore>((set, get) => ({
  isCartDropdownOpen: false,
  mobileHeaderBottomY: 0,
  setCartDropdownOpen: (open) => set({ isCartDropdownOpen: open }),
  toggleCartDropdown: () => set({ isCartDropdownOpen: !get().isCartDropdownOpen }),
  setMobileHeaderBottomY: (y) => {
    if (y > 0) set({ mobileHeaderBottomY: Math.round(y) });
  },
}));

export default useCartUiStore;
