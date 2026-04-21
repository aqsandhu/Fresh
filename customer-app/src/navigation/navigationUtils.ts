import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

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
    const mainRoute = state.routes?.find((r: any) => r.name === 'Main');
    const tabState = (mainRoute as any)?.state;
    if (tabState) {
      const idx = tabState.index ?? 0;
      return tabState.routes?.[idx]?.name ?? null;
    }
  } catch {}
  return null;
}
