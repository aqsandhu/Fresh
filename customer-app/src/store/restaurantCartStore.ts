import { create } from 'zustand';
import { round2, type Quality, type Unit } from '@services/restaurant.service';

export interface RestaurantCartLine {
  key: string;
  productId: string;
  name: string;
  image?: string | null;
  quality: Quality;
  unit: Unit;
  unitShort: string;
  qty: number;
  unitPrice: number;
}

interface State {
  items: RestaurantCartLine[];
  baseCharge: number;
  freeThreshold: number;
  setDelivery: (baseCharge: number, freeThreshold: number) => void;
  add: (line: RestaurantCartLine) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  totalItems: () => number;
  subtotal: () => number;
  deliveryCharge: () => number;
  total: () => number;
}

export const useRestaurantCart = create<State>((set, get) => ({
  items: [],
  baseCharge: 100,
  freeThreshold: 2000,
  setDelivery: (baseCharge, freeThreshold) => set({ baseCharge, freeThreshold }),
  add: (line) =>
    set((s) => {
      const ex = s.items.find((l) => l.key === line.key);
      return ex
        ? { items: s.items.map((l) => (l.key === line.key ? { ...l, qty: l.qty + line.qty } : l)) }
        : { items: [...s.items, line] };
    }),
  setQty: (key, qty) =>
    set((s) => (qty <= 0 ? { items: s.items.filter((l) => l.key !== key) } : { items: s.items.map((l) => (l.key === key ? { ...l, qty } : l)) })),
  remove: (key) => set((s) => ({ items: s.items.filter((l) => l.key !== key) })),
  clear: () => set({ items: [] }),
  totalItems: () => get().items.reduce((t, l) => t + l.qty, 0),
  subtotal: () => round2(get().items.reduce((t, l) => t + round2(l.unitPrice * l.qty), 0)),
  deliveryCharge: () => {
    const sub = get().subtotal();
    if (sub <= 0) return 0;
    return sub >= get().freeThreshold ? 0 : get().baseCharge;
  },
  total: () => round2(get().subtotal() + get().deliveryCharge()),
}));
