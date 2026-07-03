import type { ExpoConfig, ConfigContext } from 'expo/config';
import { ConfigPlugin, withInfoPlist } from 'expo/config-plugins';

// app.config.ts runs under Node (Expo CLI); Node globals/modules aren't in
// the React Native tsconfig, so pull them in untyped.
declare const __dirname: string;
 
const fs = require('fs');
 
const path = require('path');

const withLocationOnlyBackgroundMode: ConfigPlugin = (config) =>
  withInfoPlist(config, (plistConfig) => {
    const modes = plistConfig.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      plistConfig.modResults.UIBackgroundModes = modes.filter((mode) => mode !== 'fetch');
    }
    return plistConfig;
  });

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
  const googleServicesFile = path.join(__dirname, 'google-services.json');
  const hasGoogleServices = fs.existsSync(googleServicesFile);

  return withLocationOnlyBackgroundMode({
    ...config,
    name: config.name ?? 'Fresh Bazar Rider',
    slug: config.slug ?? 'freshbazar-rider',
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
  });
};
