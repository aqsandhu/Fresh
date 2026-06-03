import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { DEFAULT_MAP_LAT, DEFAULT_MAP_LNG } from '@/lib/googleMaps';
import { useMapRegionSync, DEFAULT_MAP_DELTA } from '@/components/maps/useMapRegionSync';

/** Match website DraggableMapPicker height */
const MAP_HEIGHT = 280;

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
  const { mapRef, onMapReady } = useMapRegionSync(lat, lng, DEFAULT_MAP_DELTA);
  const [pin, setPin] = useState({ latitude: lat, longitude: lng });

  React.useEffect(() => {
    setPin({ latitude: lat, longitude: lng });
  }, [lat, lng]);

  const syncPin = (latitude: number, longitude: number) => {
    setPin({ latitude, longitude });
    onLatLngChange(latitude, longitude);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.mapBox}>
        {isLocating && (
          <View style={styles.mapLoading} pointerEvents="none">
            <ActivityIndicator size="large" color={COLORS.primary600} />
          </View>
        )}
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: lat,
            longitude: lng,
            latitudeDelta: DEFAULT_MAP_DELTA,
            longitudeDelta: DEFAULT_MAP_DELTA,
          }}
          showsUserLocation
          showsMyLocationButton={false}
          loadingEnabled
          onMapReady={onMapReady}
          onPress={(e) =>
            syncPin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
          }
        >
          {accuracy != null && accuracy > 0 && (
            <Circle
              center={pin}
              radius={accuracy}
              strokeColor="rgba(16, 185, 129, 0.85)"
              strokeWidth={1}
              fillColor="rgba(16, 185, 129, 0.15)"
            />
          )}
          <Marker
            coordinate={pin}
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
          Drag the red pin on the map, tap to move it, or use &quot;Get My Location&quot;. Fine-tune
          with the lat/lng fields if needed.
        </Text>
        {accuracy != null && accuracy > 0 && (
          <Text style={styles.accuracyOk}>GPS accuracy: ±{Math.round(accuracy)}m</Text>
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
              {isLocating ? 'Getting location…' : 'Get My Location'}
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
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
  },
  mapBox: {
    height: MAP_HEIGHT,
    backgroundColor: '#e5e7eb',
  },
  map: { ...StyleSheet.absoluteFillObject },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    padding: SPACING.md,
    backgroundColor: COLORS.gray50,
    gap: SPACING.sm,
  },
  hint: { fontSize: 12, color: COLORS.gray500, lineHeight: 17 },
  accuracyOk: { fontSize: 12, color: '#15803d', fontWeight: '500' },
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
