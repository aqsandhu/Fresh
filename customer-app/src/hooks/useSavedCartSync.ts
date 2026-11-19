// Keeps this device's cart and the cart saved with the account in line
// (owner decision Q5 — see lib/savedCart): when someone signs in, when the app
// starts with a session, when the city changes, and every time the app comes
// back to the foreground (the cart may have been changed on another device).
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@store/authStore';
import { useCartStore } from '@store/cartStore';

const MIN_GAP_MS = 10_000;

export function useSavedCartSync(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrated = useCartStore((s) => s.hasHydrated);
  const cityId = useCartStore((s) => s.activeCityId);

  useEffect(() => {
    if (isAuthenticated && hydrated) {
      useCartStore.getState().syncSavedCart().catch(() => undefined);
    }
  }, [isAuthenticated, hydrated, cityId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !useAuthStore.getState().isAuthenticated) return;
      const { lastPulledAt, unsaved } = useCartStore.getState();
      if (!unsaved && lastPulledAt && Date.now() - lastPulledAt < MIN_GAP_MS) return;
      useCartStore.getState().syncSavedCart().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);
}
