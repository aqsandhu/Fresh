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

/** Same key family as the website/customer app (Maps SDK for Android/iOS). */
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
  });
};
