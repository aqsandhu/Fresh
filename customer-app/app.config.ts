import type { ExpoConfig, ConfigContext } from 'expo/config';

// app.config.ts runs under Node (Expo CLI); Node globals/modules aren't in
// the React Native tsconfig, so pull them in untyped.
declare const __dirname: string;
 
const fs = require('fs');
 
const path = require('path');

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

/** Platform-specific keys allow proper Android/iOS API key restrictions. */
function resolveGoogleMapsApiKey(platform: 'android' | 'ios'): string {
  const shared = firstEnv(
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
    'GOOGLE_MAPS_API_KEY',
    'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'
  );

  if (platform === 'android') {
    return firstEnv(
      'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY',
      'GOOGLE_MAPS_ANDROID_API_KEY'
    ) || shared;
  }

  return firstEnv(
    'EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY',
    'GOOGLE_MAPS_IOS_API_KEY'
  ) || shared;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const androidGoogleMapsKey = resolveGoogleMapsApiKey('android');
  const iosGoogleMapsKey = resolveGoogleMapsApiKey('ios');
  // Firebase config for push notifications — referenced only when the file
  // exists so builds keep working before Firebase is set up.
  const hasGoogleServices = fs.existsSync(path.join(__dirname, 'google-services.json'));

  return {
    ...config,
    name: config.name ?? 'FreshBazar',
    slug: config.slug ?? 'freshbazar',
    extra: {
      ...config.extra,
      googleMapsApiKey: androidGoogleMapsKey || iosGoogleMapsKey,
      googleMapsAndroidApiKey: androidGoogleMapsKey,
      googleMapsIosApiKey: iosGoogleMapsKey,
    },
    // react-native-maps@1.20.x has no Expo config plugin (needs 1.22+).
    // API keys are injected via android/ios config below (works on prebuild/EAS).
    plugins: [...(config.plugins ?? [])],
    android: {
      ...config.android,
      ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
      config: {
        ...(config.android?.config ?? {}),
        googleMaps: {
          apiKey: androidGoogleMapsKey,
        },
      },
    },
    ios: {
      ...config.ios,
      config: {
        ...(config.ios?.config ?? {}),
        googleMapsApiKey: iosGoogleMapsKey,
      },
    },
  };
};
