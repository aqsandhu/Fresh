import type { ExpoConfig, ConfigContext } from 'expo/config';

// app.config.ts runs under Node (Expo CLI); Node globals/modules aren't in
// the React Native tsconfig, so pull them in untyped.
declare const __dirname: string;
 
const fs = require('fs');
 
const path = require('path');

/** Same key as website (Maps JavaScript API + Maps SDK for Android/iOS). */
function resolveGoogleMapsApiKey(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    ''
  );
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsKey = resolveGoogleMapsApiKey();
  // Firebase config for push notifications — referenced only when the file
  // exists so builds keep working before Firebase is set up.
  const hasGoogleServices = fs.existsSync(path.join(__dirname, 'google-services.json'));

  return {
    ...config,
    name: config.name ?? 'FreshBazar',
    slug: config.slug ?? 'freshbazar',
    extra: {
      ...config.extra,
      googleMapsApiKey: googleMapsKey,
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
          apiKey: googleMapsKey,
        },
      },
    },
    ios: {
      ...config.ios,
      config: {
        ...(config.ios?.config ?? {}),
        googleMapsApiKey: googleMapsKey,
      },
    },
  };
};
