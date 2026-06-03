import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Visible tab bar content height (excluding home-indicator safe area). */
export const TAB_BAR_BASE_HEIGHT = 56;

export function useTabBarMetrics() {
  const insets = useSafeAreaInsets();
  const height = TAB_BAR_BASE_HEIGHT + insets.bottom;
  return {
    height,
    inset: height + 8,
    bottomInset: insets.bottom,
  };
}
