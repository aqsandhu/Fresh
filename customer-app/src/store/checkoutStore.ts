import { create } from 'zustand';
import { Address, DeliverySlot } from '@types';

interface CheckoutState {
  // Selected items for checkout
  selectedAddress: Address | null;
  selectedSlot: DeliverySlot | null;
  paymentMethod: 'cash' | 'card' | 'wallet';
  orderNotes: string;
  
  // Actions
  setSelectedAddress: (address: Address | null) => void;
  setSelectedSlot: (slot: DeliverySlot | null) => void;
  setPaymentMethod: (method: 'cash' | 'card' | 'wallet') => void;
  setOrderNotes: (notes: string) => void;
  resetCheckout: () => void;
}

export const useCheckoutStore = create<CheckoutState>((set) => ({
  selectedAddress: null,
  selectedSlot: null,
  paymentMethod: 'cash',
  orderNotes: '',

  setSelectedAddress: (address: Address | null) => {
    set({ selectedAddress: address });
  },

  setSelectedSlot: (slot: DeliverySlot | null) => {
    set({ selectedSlot: slot });
  },

  setPaymentMethod: (method: 'cash' | 'card' | 'wallet') => {
    set({ paymentMethod: method });
  },

  setOrderNotes: (notes: string) => {
    set({ orderNotes: notes });
  },

  resetCheckout: () => {
    set({
      selectedAddress: null,
      selectedSlot: null,
      paymentMethod: 'cash',
      orderNotes: '',
    });
  },
}));

export default useCheckoutStore;
