import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '@utils/constants';
import type { MapUnavailableReason } from '@/lib/googleMaps';

interface MapUnavailableFallbackProps {
  style?: StyleProp<ViewStyle>;
  reason: MapUnavailableReason;
}

const MESSAGES: Record<MapUnavailableReason, { title: string; body: string }> = {
  'missing-key': {
    title: 'Google Maps API key required',
    body:
      'Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to customer-app/.env (same key as the website), then rebuild the app with "npx expo run:android" or EAS build. Until then, use Get My Location and the lat/lng fields below.',
  },
  'expo-go-android': {
    title: 'Map preview needs a development build',
    body:
      'Google Maps tiles do not load in Expo Go on Android. Run "npx expo run:android" once with your API key, or use Get My Location and coordinate fields to set your pin.',
  },
};

export const MapUnavailableFallback: React.FC<MapUnavailableFallbackProps> = ({
  style,
  reason,
}) => {
  const copy = MESSAGES[reason];
  return (
    <View style={[styles.wrap, style]}>
      <MaterialIcons name="map" size={40} color={COLORS.gray400} />
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    backgroundColor: '#f5f5f0',
    gap: SPACING.sm,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray800,
    textAlign: 'center',
  },
  body: {
    fontSize: 12,
    color: COLORS.gray600,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
});

export default MapUnavailableFallback;
