import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

/**
 * Navigate from outside a screen (drawers, the chat widget, notifications).
 * The root navigator has no typed param list, so TypeScript cannot check the
 * route names here — React Navigation checks them at run time.
 */
export function navigateRoot(name: string, params?: object): void {
  const nav = navigationRef as unknown as { navigate: (screen: string, params?: object) => void };
  nav.navigate(name, params);
}

let _pendingRedirect: string | null = null;

export function setPendingRedirect(tabName: string | null) {
  _pendingRedirect = tabName;
}

export function getPendingRedirect(): string | null {
  return _pendingRedirect;
}

export function clearPendingRedirect() {
  _pendingRedirect = null;
}

export function getCurrentTabName(): string | null {
  try {
    const state = navigationRef.getRootState();
    if (!state) return null;
    // Check if user is currently in CartFlow
    const activeIndex = state.index ?? 0;
    const activeRoute = state.routes[activeIndex];
    if (activeRoute?.name === 'CartFlow') {
      return 'CartFlow';
    }
    // Otherwise return current tab name
    const mainRoute = state.routes?.find((r) => r.name === 'Main');
    const tabState = mainRoute?.state;
    if (tabState) {
      const idx = tabState.index ?? 0;
      return tabState.routes?.[idx]?.name ?? null;
    }
  } catch {}
  return null;
}
