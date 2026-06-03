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
    plugins: [
      ...(config.plugins ?? []),
      [
        'react-native-maps',
        {
          iosGoogleMapsApiKey: googleMapsKey,
          androidGoogleMapsApiKey: googleMapsKey,
        },
      ],
    ],
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
