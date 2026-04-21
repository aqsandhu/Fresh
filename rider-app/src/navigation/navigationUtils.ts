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
    const mainRoute = state?.routes?.[0]; // "MainTabs"
    const tabState = (mainRoute as any)?.state;
    if (tabState) {
      const idx = tabState.index ?? 0;
      return tabState.routes?.[idx]?.name ?? null;
    }
  } catch {}
  return null;
}
