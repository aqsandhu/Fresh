// JS side of the local widget-pin Expo module. All calls are feature-detected
// so app builds WITHOUT the native module (or iOS) simply report
// "unsupported" instead of crashing.

interface WidgetPinNativeModule {
  isPinSupported(): boolean;
  requestPin(providerClassName: string): boolean;
}

let cached: WidgetPinNativeModule | null | undefined;

function getModule(): WidgetPinNativeModule | null {
  if (cached !== undefined) return cached;
  try {
    // Via the `expo` package (re-export) — expo-doctor forbids depending on
    // expo-modules-core directly.
    const { requireNativeModule } = require('expo');
    cached = requireNativeModule('WidgetPin') as WidgetPinNativeModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when the launcher supports the automatic pin dialog (Android 8+). */
export function isWidgetPinSupported(): boolean {
  try {
    return !!getModule()?.isPinSupported();
  } catch {
    return false;
  }
}

/** Opens the system dialog; returns true when the request was accepted. */
export function requestWidgetPin(providerClassName: string): boolean {
  try {
    return !!getModule()?.requestPin(providerClassName);
  } catch {
    return false;
  }
}
