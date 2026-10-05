import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors, radius, spacing, typography, shadow } from '../theme';
import { MAP_CONFIG } from '../utils/constants';
import { useT } from '../i18n';
import type { GeoPoint } from '../types';

interface MapPreviewProps {
  point: GeoPoint;
  /** Rider's own position — drawn as a second marker when available. */
  riderPoint?: GeoPoint | null;
  title?: string;
  onNavigate?: () => void;
  height?: number;
  draggable?: boolean;
  onMarkerDragEnd?: (point: GeoPoint) => void;
}

const MapPreview: React.FC<MapPreviewProps> = ({
  point,
  riderPoint,
  title,
  onNavigate,
  height = 220,
  draggable = false,
  onMarkerDragEnd,
}) => {
  const { t } = useT();
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (riderPoint) {
      mapRef.current?.fitToCoordinates([point, riderPoint], {
        edgePadding: { top: 40, bottom: 40, left: 40, right: 40 },
        animated: true,
      });
    } else {
      mapRef.current?.animateToRegion(
        { ...point, latitudeDelta: MAP_CONFIG.delta, longitudeDelta: MAP_CONFIG.delta },
        400
      );
    }
  }, [point, riderPoint]);

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{ ...point, latitudeDelta: MAP_CONFIG.delta, longitudeDelta: MAP_CONFIG.delta }}
        showsCompass={false}
        toolbarEnabled={false}
        loadingEnabled
        rotateEnabled={false}
        pitchEnabled={false}
        minZoomLevel={11}
        maxZoomLevel={20}
      >
        <Marker
          coordinate={point}
          title={title}
          draggable={draggable}
          onDragEnd={(e) => onMarkerDragEnd?.(e.nativeEvent.coordinate)}
          anchor={{ x: 0.5, y: 1 }}
        >
          <MaterialCommunityIcons name="map-marker" size={40} color={colors.danger} />
        </Marker>
        {riderPoint ? (
          <Marker coordinate={riderPoint} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.riderDot}>
              <MaterialCommunityIcons name="motorbike" size={16} color={colors.white} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {draggable ? (
        <View style={styles.hint} pointerEvents="none">
          <MaterialCommunityIcons name="gesture-tap-hold" size={14} color={colors.white} />
          <Text style={styles.hintText}>Hold & drag the pin to adjust</Text>
        </View>
      ) : null}

      {onNavigate ? (
        <TouchableOpacity style={styles.navigateButton} onPress={onNavigate} activeOpacity={0.85} accessibilityRole="button">
          <MaterialCommunityIcons name="navigation-variant" size={20} color={colors.white} />
          <Text style={styles.navigateText}>{t('home.navigate')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.gray200,
  },
  map: { ...StyleSheet.absoluteFillObject },
  riderDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.info,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  hint: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(17,24,39,0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  hintText: { color: colors.white, fontSize: typography.size.xs },
  navigateButton: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.gray900,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    ...shadow.raised,
  },
  navigateText: { color: colors.white, fontSize: typography.size.md, fontWeight: typography.weight.bold },
});

export default MapPreview;
