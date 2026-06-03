import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Address } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Button, Input } from '@components';
import { DoorPhotoCropModal } from '@components/common/DoorPhotoCropModal';
import { addressService, type CreateAddressRequest } from '@services/address.service';
import { DEFAULT_MAP_LAT, DEFAULT_MAP_LNG } from '@/lib/googleMaps';
import { getAccuratePosition } from '@/lib/geolocation';
import { REQUIRED_LOCATION_ACCURACY_M } from '@utils/constants';
import { normalizeAddressType, type AddressTypeValue } from '@/constants/addressTypes';
import { pickDoorPhotoFromLibrary } from '@/lib/pickDoorPhoto';
import { CheckoutMapPicker } from './CheckoutMapPicker';
import { AddressTypePicker } from './AddressTypePicker';

export interface CheckoutAddressFormInitial {
  id?: string;
  label?: string;
  fullAddress?: string;
  areaName?: string;
  landmark?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  doorImage?: string;
}

export interface CheckoutAddressFormHandle {
  submit: () => Promise<Address | null>;
}

interface CheckoutAddressFormProps {
  cityName: string;
  initial?: CheckoutAddressFormInitial;
  defaultOnCreate?: boolean;
  hideSubmitButton?: boolean;
  onSaved?: (address: Address) => void;
  onCancel?: () => void;
  onValidityChange?: (isValid: boolean) => void;
}

export const CheckoutAddressForm = forwardRef<CheckoutAddressFormHandle, CheckoutAddressFormProps>(
  function CheckoutAddressForm(
    {
      cityName,
      initial,
      defaultOnCreate = false,
      hideSubmitButton = false,
      onSaved,
      onCancel,
      onValidityChange,
    },
    ref
  ) {
    const isEdit = Boolean(initial?.id);
    const [addressType, setAddressType] = useState<AddressTypeValue>(
      normalizeAddressType(initial?.label)
    );
    const [cropVisible, setCropVisible] = useState(false);
    const [cropUri, setCropUri] = useState<string | null>(null);
    const [cropSize, setCropSize] = useState({ width: 0, height: 0 });
    const [areaName, setAreaName] = useState(initial?.areaName || '');
    const [writtenAddress, setWrittenAddress] = useState(initial?.fullAddress || '');
    const [landmark, setLandmark] = useState(initial?.landmark || '');
    const [doorImage, setDoorImage] = useState<string | null>(initial?.doorImage || null);

    const initialLat =
      typeof initial?.latitude === 'number' && initial.latitude !== 0 ? initial.latitude : null;
    const initialLng =
      typeof initial?.longitude === 'number' && initial.longitude !== 0 ? initial.longitude : null;
    const [mapLocation, setMapLocation] = useState<{ lat: number; lng: number } | null>(
      initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null
    );
    const [mapAccuracy, setMapAccuracy] = useState<number | undefined>();
    const [showMapPicker, setShowMapPicker] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [gpsStatus, setGpsStatus] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const isValid = writtenAddress.trim().length >= 5;

    useEffect(() => {
      onValidityChange?.(isValid);
    }, [isValid, onValidityChange]);

    const applyGpsFix = (pos: { lat: number; lng: number; accuracy: number }) => {
      setMapLocation({ lat: pos.lat, lng: pos.lng });
      setMapAccuracy(pos.accuracy);
    };

    const runGpsCapture = async () => {
      setIsLocating(true);
      setGpsStatus('Getting location…');

      try {
        const pos = await getAccuratePosition({
          onProgress: (acc) => {
            setGpsStatus(`Getting GPS… ±${Math.round(acc)}m`);
          },
          onFix: (fix) => {
            applyGpsFix(fix);
          },
        });

        if (pos) {
          applyGpsFix(pos);
          if (pos.tier === 'tight') {
            setGpsStatus(`Location locked (±${Math.round(pos.accuracy)}m)`);
            Toast.show({
              type: 'success',
              text1: `Location detected (±${Math.round(pos.accuracy)}m)`,
            });
          } else if (pos.tier === 'fallback') {
            setGpsStatus(`Location set (±${Math.round(pos.accuracy)}m) — drag pin to fine-tune`);
            Toast.show({
              type: 'success',
              text1: `Location set (±${Math.round(pos.accuracy)}m). Drag the pin if needed.`,
            });
          } else {
            setGpsStatus(
              `Approximate location (±${Math.round(pos.accuracy)}m) — drag pin or retry outdoors`
            );
            Toast.show({
              type: 'info',
              text1: 'Approximate GPS fix',
              text2: 'Drag the pin on the map if the marker is off.',
            });
          }
        } else {
          setGpsStatus('GPS unavailable — tap the map or enter coordinates');
          Toast.show({
            type: 'error',
            text1: 'Could not get GPS. Pin on map or enter lat/lng.',
          });
        }
      } catch {
        setGpsStatus('GPS failed — pin on map or enter coordinates');
        Toast.show({ type: 'error', text1: 'GPS failed. Pin on map or try again.' });
      } finally {
        setIsLocating(false);
      }
    };

    const openMapPicker = () => setShowMapPicker(true);

    const handleGetGps = () => {
      setShowMapPicker(true);
      void runGpsCapture();
    };

    const handlePickDoorImage = async () => {
      const picked = await pickDoorPhotoFromLibrary();
      if (!picked) return;
      setCropUri(picked.uri);
      setCropSize({ width: picked.width, height: picked.height });
      setCropVisible(true);
    };

    const handleSubmit = useCallback(async (): Promise<Address | null> => {
      const trimmed = writtenAddress.trim();
      if (trimmed.length < 5) {
        Toast.show({ type: 'error', text1: 'Full address must be at least 5 characters' });
        return null;
      }

      setShowMapPicker(false);
      setSaving(true);
      try {
        const payload: CreateAddressRequest = {
          label: addressType,
          fullAddress: trimmed,
          areaName: areaName.trim() || 'N/A',
          city: cityName,
          landmark: landmark.trim() || undefined,
          doorImage: doorImage || undefined,
          isDefault: defaultOnCreate,
        };

        if (mapLocation) {
          payload.latitude = mapLocation.lat;
          payload.longitude = mapLocation.lng;
          if (mapAccuracy != null && Number.isFinite(mapAccuracy)) {
            payload.locationAccuracy = mapAccuracy;
          }
        }

        const response = isEdit && initial?.id
          ? await addressService.updateAddress(initial.id, payload)
          : await addressService.createAddress(payload);

        if (!response.success || !response.data?.id) {
          throw new Error('Save did not return a valid address');
        }

        Toast.show({
          type: 'success',
          text1: isEdit ? 'Address updated' : 'Address saved',
        });
        onSaved?.(response.data);
        return response.data;
      } catch (err: any) {
        Toast.show({
          type: 'error',
          text1: err?.message || (isEdit ? 'Could not update address' : 'Could not save address'),
        });
        return null;
      } finally {
        setSaving(false);
      }
    }, [
      addressType,
      areaName,
      cityName,
      defaultOnCreate,
      doorImage,
      initial?.id,
      isEdit,
      landmark,
      mapAccuracy,
      mapLocation,
      onSaved,
      writtenAddress,
    ]);

    useImperativeHandle(ref, () => ({ submit: handleSubmit }), [handleSubmit]);

    return (
      <View style={styles.wrap}>
        <AddressTypePicker value={addressType} onChange={setAddressType} />

        <DoorPhotoCropModal
          visible={cropVisible}
          imageUri={cropUri}
          imageWidth={cropSize.width}
          imageHeight={cropSize.height}
          onCancel={() => setCropVisible(false)}
          onConfirm={(uri) => {
            setDoorImage(uri);
            setCropVisible(false);
          }}
        />

        <Input
          label="Area Name"
          placeholder="e.g., Gulberg, DHA"
          value={areaName}
          onChangeText={setAreaName}
        />

        <View style={styles.cityField}>
          <Text style={styles.fieldLabel}>City</Text>
          <View style={styles.cityLocked}>
            <Text style={styles.cityText}>{cityName}</Text>
          </View>
        </View>

        <Input
          label="Full Address *"
          placeholder="Enter your complete address"
          value={writtenAddress}
          onChangeText={setWrittenAddress}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={styles.addressInput}
        />

        <Input
          label="Landmark (Optional)"
          placeholder="Near mosque, school, etc."
          value={landmark}
          onChangeText={setLandmark}
        />

        <Text style={styles.fieldLabel}>Door Picture (Optional)</Text>
        <TouchableOpacity style={styles.doorBtn} onPress={handlePickDoorImage}>
          {doorImage ? (
            <Image source={{ uri: doorImage }} style={styles.doorImage} />
          ) : (
            <>
              <MaterialIcons name="add-a-photo" size={28} color={COLORS.gray400} />
              <Text style={styles.doorHint}>Tap to upload a picture of your door</Text>
              <Text style={styles.doorSubHint}>Helps our delivery partner find your location</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>
          📍 Pin Map Location (Optional)
        </Text>

        {!showMapPicker && !mapLocation && (
          <View style={styles.gpsRow}>
            <TouchableOpacity
              style={styles.mapOutlineBtn}
              onPress={openMapPicker}
            >
              <MaterialIcons name="place" size={18} color={COLORS.primary600} />
              <Text style={styles.mapOutlineText}>Add Google Map Location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.gpsBtn}
              onPress={handleGetGps}
              disabled={isLocating}
            >
              <MaterialIcons name="my-location" size={18} color={COLORS.white} />
              <Text style={styles.gpsBtnText}>
                {isLocating ? 'Getting location…' : 'Get My Location'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {gpsStatus && (
          <Text style={[styles.gpsStatus, isLocating && styles.gpsStatusActive]}>{gpsStatus}</Text>
        )}

        {mapLocation && !showMapPicker && (
          <View style={styles.locationPinned}>
            <MaterialIcons name="check" size={18} color={COLORS.success} />
            <Text style={styles.locationText}>
              Location pinned ({mapLocation.lat.toFixed(4)}, {mapLocation.lng.toFixed(4)})
              {mapAccuracy != null ? ` · ±${Math.round(mapAccuracy)}m` : ''}
            </Text>
            <TouchableOpacity onPress={() => setShowMapPicker(true)}>
              <Text style={styles.changeLink}>Change</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setMapLocation(null);
                setMapAccuracy(undefined);
                setGpsStatus(null);
              }}
            >
              <Text style={styles.removeLink}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}

        {showMapPicker && (
          <CheckoutMapPicker
            lat={mapLocation?.lat ?? DEFAULT_MAP_LAT}
            lng={mapLocation?.lng ?? DEFAULT_MAP_LNG}
            accuracy={mapAccuracy ?? null}
            isLocating={isLocating}
            hasLocation={mapLocation != null}
            onLatLngChange={(lat, lng) => {
              setMapLocation({ lat, lng });
              setMapAccuracy(undefined);
            }}
            onGetLocation={() => void runGpsCapture()}
            onDone={() => setShowMapPicker(false)}
            onCancel={() => {
              setMapLocation(null);
              setMapAccuracy(undefined);
              setGpsStatus(null);
              setShowMapPicker(false);
            }}
          />
        )}

        <Text style={styles.mapFooterHint}>
          {isEdit
            ? 'Update or clear the pinned location.'
            : 'If you skip this, our rider will pin the location on first delivery.'}
        </Text>

        {!hideSubmitButton && (
          <View style={styles.actions}>
            {onCancel && (
              <Button title="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} />
            )}
            <Button
              title={isEdit ? 'Update Address' : 'Save Address'}
              onPress={handleSubmit}
              disabled={saving}
              style={{ flex: 1 }}
            />
          </View>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  wrap: { paddingTop: SPACING.sm },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: SPACING.sm,
  },
  cityField: { marginBottom: SPACING.md },
  cityLocked: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.gray50,
  },
  cityText: { fontSize: 15, color: COLORS.gray800 },
  addressInput: { minHeight: 80, paddingTop: SPACING.sm },
  doorBtn: {
    minHeight: 100,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.gray200,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    overflow: 'hidden',
  },
  doorImage: { width: '100%', height: 120 },
  doorHint: { fontSize: 14, color: COLORS.gray500, marginTop: SPACING.xs, textAlign: 'center' },
  doorSubHint: { fontSize: 12, color: COLORS.gray400, marginTop: 4, textAlign: 'center' },
  gpsRow: { gap: SPACING.sm },
  mapOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.primary100,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
  },
  mapOutlineText: { fontSize: 14, fontWeight: '600', color: COLORS.primary700 },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary600,
  },
  gpsBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  gpsStatus: { fontSize: 12, color: COLORS.gray600, marginTop: SPACING.sm },
  gpsStatusActive: { color: COLORS.primary600 },
  locationPinned: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#F0FDF4',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  locationText: { flex: 1, fontSize: 14, color: '#15803d', minWidth: 120 },
  changeLink: { fontSize: 14, color: COLORS.primary600, fontWeight: '500' },
  removeLink: { fontSize: 14, color: COLORS.error, fontWeight: '500' },
  mapFooterHint: { fontSize: 12, color: COLORS.gray400, marginTop: SPACING.xs },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
});

export default CheckoutAddressForm;
