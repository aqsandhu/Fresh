import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, REQUIRED_LOCATION_ACCURACY_M } from '@utils/constants';
import { DEFAULT_MAP_LAT, DEFAULT_MAP_LNG } from '@/lib/googleMaps';

const MAP_HEIGHT = 280;
const DEFAULT_MAP_DELTA = 0.0025;

function regionDeltaForAccuracy(accuracy?: number | null): number {
  if (typeof accuracy !== 'number' || accuracy <= 0) return DEFAULT_MAP_DELTA;
  if (accuracy <= 8) return 0.0018;
  if (accuracy <= 20) return 0.0025;
  if (accuracy <= 50) return 0.005;
  return 0.008;
}

function safeCoord(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

interface CheckoutMapPickerProps {
  lat: number;
  lng: number;
  accuracy?: number | null;
  isLocating?: boolean;
  hasLocation: boolean;
  onLatLngChange: (lat: number, lng: number) => void;
  onGetLocation: () => void;
  onDone: () => void;
  onCancel: () => void;
}

export const CheckoutMapPicker: React.FC<CheckoutMapPickerProps> = ({
  lat,
  lng,
  accuracy,
  isLocating = false,
  hasLocation,
  onLatLngChange,
  onGetLocation,
  onDone,
  onCancel,
}) => {
  const mapRef = useRef<MapView>(null);
  // Coords that came from the user's own drag/tap — the camera must NOT re-animate
  // for these, or every pin move would recenter and snap the zoom back to MAP_DELTA.
  const selfMoveRef = useRef<{ lat: number; lng: number } | null>(null);
  const displayLat = safeCoord(lat, DEFAULT_MAP_LAT);
  const displayLng = safeCoord(lng, DEFAULT_MAP_LNG);
  const circleRadius =
    accuracy != null && accuracy > 0 ? Math.min(accuracy, 80) : null;
  const accuracyOk =
    typeof accuracy === 'number' && accuracy > 0 && accuracy <= REQUIRED_LOCATION_ACCURACY_M;
  const mapDelta = regionDeltaForAccuracy(accuracy);

  useEffect(() => {
    // Skip the camera animation when the new position is the one the user just
    // dragged/tapped to — animating it fights the gesture and resets the zoom.
    const self = selfMoveRef.current;
    if (
      self &&
      Math.abs(self.lat - displayLat) < 1e-6 &&
      Math.abs(self.lng - displayLng) < 1e-6
    ) {
      return;
    }
    // External change (Get My Location / lat-lng inputs): recenter smoothly.
    mapRef.current?.animateToRegion(
      {
        latitude: displayLat,
        longitude: displayLng,
        latitudeDelta: mapDelta,
        longitudeDelta: mapDelta,
      },
      400
    );
  }, [displayLat, displayLng, mapDelta]);

  const syncPin = (latitude: number, longitude: number) => {
    selfMoveRef.current = { lat: latitude, lng: longitude };
    onLatLngChange(latitude, longitude);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.mapBox}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          mapType="standard"
          style={styles.map}
          showsScale
          showsCompass
          loadingEnabled
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          minZoomLevel={12}
          maxZoomLevel={20}
          initialRegion={{
            latitude: displayLat,
            longitude: displayLng,
            latitudeDelta: mapDelta,
            longitudeDelta: mapDelta,
          }}
          onPress={(e) =>
            syncPin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
          }
          onMapReady={() =>
            mapRef.current?.animateToRegion(
              {
                latitude: displayLat,
                longitude: displayLng,
                latitudeDelta: mapDelta,
                longitudeDelta: mapDelta,
              },
              0
            )
          }
        >
          {circleRadius != null && (
            <Circle
              center={{ latitude: displayLat, longitude: displayLng }}
              radius={circleRadius}
              strokeColor="rgba(16, 185, 129, 0.85)"
              strokeWidth={1}
              fillColor="rgba(16, 185, 129, 0.15)"
            />
          )}
          <Marker
            coordinate={{ latitude: displayLat, longitude: displayLng }}
            draggable
            pinColor="red"
            onDragEnd={(e) =>
              syncPin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
            }
          />
        </MapView>
      </View>

      <View style={styles.panel}>
        <Text style={styles.hint}>
          Drag the red pin, tap the map, or use Get My Location. Fine-tune with lat/lng if needed.
        </Text>
        {isLocating && (
          <Text style={styles.locatingText}>
            Getting GPS... waiting for +/-{REQUIRED_LOCATION_ACCURACY_M}m accuracy.
          </Text>
        )}
        {!isLocating && accuracy != null && accuracy > 0 && (
          <Text style={accuracyOk ? styles.accuracyOk : styles.accuracyWarn}>
            GPS accuracy: +/-{Math.round(accuracy)}m
          </Text>
        )}

        <View style={styles.coordRow}>
          <View style={styles.coordField}>
            <Text style={styles.coordLabel}>Latitude</Text>
            <TextInput
              style={styles.coordInput}
              keyboardType="decimal-pad"
              value={Number.isFinite(lat) ? String(lat) : ''}
              placeholder={String(DEFAULT_MAP_LAT)}
              placeholderTextColor={COLORS.gray400}
              onChangeText={(text) => {
                const next = parseFloat(text);
                if (Number.isFinite(next)) onLatLngChange(next, lng);
              }}
            />
          </View>
          <View style={styles.coordField}>
            <Text style={styles.coordLabel}>Longitude</Text>
            <TextInput
              style={styles.coordInput}
              keyboardType="decimal-pad"
              value={Number.isFinite(lng) ? String(lng) : ''}
              placeholder={String(DEFAULT_MAP_LNG)}
              placeholderTextColor={COLORS.gray400}
              onChangeText={(text) => {
                const next = parseFloat(text);
                if (Number.isFinite(next)) onLatLngChange(lat, next);
              }}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.gpsBtn, isLocating && styles.btnDisabled]}
            onPress={onGetLocation}
            disabled={isLocating}
          >
            {isLocating ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <MaterialIcons name="my-location" size={16} color={COLORS.white} />
            )}
            <Text style={styles.gpsBtnText}>
              {isLocating ? 'Getting location...' : 'Get My Location'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={onDone}>
            <Text style={styles.outlineBtnText}>{hasLocation ? 'Done' : 'Cancel'}</Text>
          </TouchableOpacity>
          {hasLocation && (
            <TouchableOpacity style={styles.clearBtn} onPress={onCancel}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
  },
  mapBox: {
    height: MAP_HEIGHT,
    width: '100%',
    backgroundColor: '#e5e7eb',
  },
  map: {
    width: '100%',
    height: MAP_HEIGHT,
  },
  panel: {
    padding: SPACING.md,
    backgroundColor: COLORS.gray50,
    gap: SPACING.sm,
  },
  hint: { fontSize: 12, color: COLORS.gray500, lineHeight: 17 },
  locatingText: { fontSize: 12, color: COLORS.primary600 },
  accuracyOk: { fontSize: 12, color: '#15803d', fontWeight: '500' },
  accuracyWarn: { fontSize: 12, color: '#b45309', fontWeight: '500' },
  coordRow: { flexDirection: 'row', gap: SPACING.md },
  coordField: { flex: 1 },
  coordLabel: { fontSize: 12, color: COLORS.gray500, marginBottom: 4 },
  coordInput: {
    borderWidth: 1,
    borderColor: COLORS.gray300,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.gray900,
    backgroundColor: COLORS.white,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.xs },
  gpsBtn: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary600,
  },
  gpsBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.white },
  btnDisabled: { opacity: 0.6 },
  outlineBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray300,
    backgroundColor: COLORS.white,
  },
  outlineBtnText: { fontSize: 13, color: COLORS.gray700 },
  clearBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: COLORS.white,
  },
  clearBtnText: { fontSize: 13, color: COLORS.error },
});

export default CheckoutMapPicker;
