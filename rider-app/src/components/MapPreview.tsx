import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, MAP_CONFIG } from '../utils/constants';

interface MapPreviewProps {
  latitude: number;
  longitude: number;
  title?: string;
  onNavigate?: () => void;
  height?: number;
  showMarker?: boolean;
  interactive?: boolean;
  draggable?: boolean;
  onMarkerDragEnd?: (latitude: number, longitude: number) => void;
}

const { width: screenWidth } = Dimensions.get('window');

const MapPreview: React.FC<MapPreviewProps> = ({
  latitude,
  longitude,
  title,
  onNavigate,
  height = 200,
  showMarker = true,
  interactive = true,
  draggable = false,
  onMarkerDragEnd,
}) => {
  const initialRegion = {
    latitude,
    longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  return (
    <View
      style={[styles.container, { height }]}
      onStartShouldSetResponder={() => interactive}
      onMoveShouldSetResponder={() => interactive}
    >
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {showMarker && (
          <Marker
            coordinate={{ latitude, longitude }}
            title={title}
            draggable={draggable}
            onDragEnd={(e) => {
              if (onMarkerDragEnd) {
                const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
                onMarkerDragEnd(lat, lng);
              }
            }}
          >
            <View style={styles.markerContainer}>
              <View style={styles.marker}>
                <MaterialCommunityIcons name="map-marker" size={28} color={COLORS.danger} />
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Navigate Button */}
      {onNavigate && (
        <TouchableOpacity
          style={styles.navigateButton}
          onPress={onNavigate}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="navigation" size={20} color={COLORS.white} />
          <Text style={styles.navigateText}>Navigate</Text>
        </TouchableOpacity>
      )}

      {/* Map Overlay */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.coordinatesContainer}>
          <MaterialCommunityIcons name="crosshairs-gps" size={14} color={COLORS.white} />
          <Text style={styles.coordinatesText}>
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: screenWidth - SPACING.md * 2,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.gray200,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  markerContainer: {
    alignItems: 'center',
  },
  marker: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  navigateButton: {
    position: 'absolute',
    bottom: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  navigateText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    marginLeft: SPACING.xs,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: SPACING.sm,
  },
  coordinatesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  coordinatesText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    marginLeft: 4,
  },
});

export default MapPreview;
