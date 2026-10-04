import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList, MainTabParamList } from '../types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let pendingRedirect: keyof MainTabParamList | null = null;

export function setPendingRedirect(tabName: string | null) {
  pendingRedirect = (tabName as keyof MainTabParamList) || null;
}

export function getPendingRedirect(): keyof MainTabParamList | null {
  return pendingRedirect;
}

export function clearPendingRedirect() {
  pendingRedirect = null;
}

/** Name of the focused bottom tab, if the tab navigator is mounted. */
export function getCurrentTabName(): string | null {
  try {
    const state = navigationRef.getRootState();
    const mainRoute = state?.routes?.find((r) => r.name === 'MainTabs');
    const tabState = (mainRoute as { state?: { index?: number; routes?: { name: string }[] } } | undefined)?.state;
    if (tabState?.routes) {
      const idx = tabState.index ?? 0;
      return tabState.routes[idx]?.name ?? null;
    }
  } catch {
    /* navigator not ready */
  }
  return null;
}

/** Deep-link helpers used by notification taps. Safe before the navigator is ready. */
export function navigateToTask(taskId: string) {
  if (!navigationRef.isReady()) return false;
  navigationRef.navigate('TaskDetail', { taskId });
  return true;
}

export function navigateToChat(orderId: string, orderNumber?: string) {
  if (!navigationRef.isReady()) return false;
  navigationRef.navigate('Chat', { orderId, orderNumber });
  return true;
}

export function navigateToTab(tab: keyof MainTabParamList) {
  if (!navigationRef.isReady()) return false;
  navigationRef.navigate('MainTabs', { screen: tab });
  return true;
}
