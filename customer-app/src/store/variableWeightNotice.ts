import { create } from 'zustand';

const DEFAULT_NOTE =
  'آرڈر پیک کرتے ہوئے اس پروڈکٹ کا وزن آپ کے آرڈر سے کم یا زیادہ ہو سکتا ہے۔ ایسی صورت میں آپ کا آرڈر اور اس کی رقم آپ کے اصل وزن کے مطابق تبدیل ہو جائے گی۔';

// Show the notice once per product per app session.
const seen = new Set<string>();

interface VariableWeightNoticeState {
  open: boolean;
  note: string;
  notify: (productId: string, note?: string | null) => void;
  dismiss: () => void;
}

export const useVariableWeightNotice = create<VariableWeightNoticeState>((set) => ({
  open: false,
  note: DEFAULT_NOTE,
  notify: (productId, note) => {
    if (seen.has(productId)) return;
    seen.add(productId);
    set({ open: true, note: (note && note.trim()) || DEFAULT_NOTE });
  },
  dismiss: () => set({ open: false }),
}));
