import type { ExpoConfig, ConfigContext } from 'expo/config';

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

  return {
    ...config,
    extra: {
      ...config.extra,
      googleMapsApiKey: googleMapsKey,
    },
    // react-native-maps@1.20.x has no Expo config plugin (needs 1.22+).
    // API keys are injected via android/ios config below (works on prebuild/EAS).
    plugins: [...(config.plugins ?? [])],
    android: {
      ...config.android,
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
