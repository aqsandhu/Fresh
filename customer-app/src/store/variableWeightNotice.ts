import { create } from 'zustand';

const DEFAULT_NOTE =
  'آرڈر پیک کرتے ہوئے اس پروڈکٹ کا وزن آپ کے آرڈر سے کم یا زیادہ ہو سکتا ہے۔ ایسی صورت میں آپ کا آرڈر اور اس کی رقم آپ کے اصل وزن کے مطابق تبدیل ہو جائے گی۔';

interface VariableWeightNoticeState {
  open: boolean;
  note: string;
  /** Shows the notice each time a variable-weight product is added to cart. */
  notify: (productId: string, note?: string | null) => void;
  dismiss: () => void;
}

export const useVariableWeightNotice = create<VariableWeightNoticeState>((set) => ({
  open: false,
  note: DEFAULT_NOTE,
  notify: (_productId, note) => {
    set({ open: true, note: (note && note.trim()) || DEFAULT_NOTE });
  },
  dismiss: () => set({ open: false }),
}));
