import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { CartStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, ERROR_MESSAGES } from '@utils/constants';
import { Button, Input, LoadingOverlay } from '@components';
import { addressService } from '@services/address.service';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@utils/constants';

export const AddAddressScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CartStackParamList>>();
  const [permission, requestPermission] = useCameraPermissions();
  
  const [label, setLabel] = useState('Home');
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState({
    latitude: 31.5204,
    longitude: 74.3587,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [doorImage, setDoorImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [errors, setErrors] = useState<{ address?: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const labels = ['Home', 'Office', 'Other'];

  const handleLocationSelect = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setRegion((prev) => ({
      ...prev,
      latitude,
      longitude,
    }));
  };

  const handleGetCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Location permission is needed to get your current position.');
      return;
    }

    setIsLocating(true);
    setLocationAccuracy(null);

    try {
      // Watch GPS until we get ≤10m accuracy or timeout after 15s
      const bestLocation = await new Promise<Location.LocationObject | null>((resolve) => {
        let best: Location.LocationObject | null = null;
        let done = false;

        const timer = setTimeout(() => {
          if (!done) { done = true; sub?.remove(); resolve(best); }
        }, 15000);

        let sub: Location.LocationSubscription;
        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (loc) => {
            const acc = loc.coords.accuracy ?? 9999;
            if (!best || acc < (best.coords.accuracy ?? 9999)) {
              best = loc;
              setLocationAccuracy(Math.round(acc));
            }
            if (acc <= 10 && !done) {
              done = true;
              clearTimeout(timer);
              sub.remove();
              resolve(loc);
            }
          }
        ).then(s => { sub = s; });
      });

      if (bestLocation) {
        const acc = bestLocation.coords.accuracy ?? 0;
        setLocationAccuracy(Math.round(acc));
        setRegion({
          latitude: bestLocation.coords.latitude,
          longitude: bestLocation.coords.longitude,
          latitudeDelta: 0.002,
          longitudeDelta: 0.002,
        });
      } else {
        Alert.alert('GPS Error', 'Could not get GPS signal. Move to an open area and try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to get location. Please try again.');
    } finally {
      setIsLocating(false);
    }
  };

  const openAppSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const handleTakePicture = async () => {
    if (!permission?.granted) {
      const { granted, canAskAgain } = await requestPermission();
      if (!granted) {
        if (!canAskAgain) {
          Alert.alert(
            'Camera Permission Required',
            'Please enable camera permission in your device settings to take pictures.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: openAppSettings },
            ]
          );
        }
        return;
      }
    }
    setShowCamera(true);
  };

  const handlePickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        Alert.alert(
          'Photo Access Required',
          'Please allow access to your photos in settings to pick a door picture.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: openAppSettings },
          ]
        );
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setDoorImage(result.assets[0].uri);
    }
  };

  const handleDoorPicturePress = () => {
    Alert.alert(
      'Add Door Picture',
      'Choose how to add a picture of your door',
      [
        { text: 'Take Photo', onPress: handleTakePicture },
        { text: 'Choose from Gallery', onPress: handlePickFromGallery },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const capturePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      if (photo) {
        setDoorImage(photo.uri);
        setShowCamera(false);
      }
    }
  };

  const validate = (): boolean => {
    const newErrors: { address?: string } = {};
    if (!address.trim()) {
      newErrors.address = 'Please enter your address';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    
    setIsSaving(true);
    try {
      const addressData = {
        label,
        fullAddress: address,
        latitude: region.latitude,
        longitude: region.longitude,
        doorImage: doorImage || undefined,
        isDefault: false,
      };

      // Try to save to backend API
      let savedAddress: any = null;
      let apiSuccess = false;
      let apiError: any = null;

      try {
        const response = await addressService.createAddress(addressData);
        if (response.success) {
          savedAddress = response.data;
          apiSuccess = true;
        }
      } catch (err: any) {
        apiError = err;
      }

      if (!apiSuccess) {
        // Only fall back to local storage for genuine network failures.
        // For validation / server errors, surface the real reason so the
        // user can fix the input instead of getting a stuck "local_*" address
        // that fails again at checkout.
        const status = apiError?.statusCode || apiError?.response?.status;
        const serverMsg = apiError?.data?.message || apiError?.response?.data?.message;
        const isNetwork = !status && /network/i.test(String(apiError?.message || ''));

        if (!isNetwork && apiError) {
          Alert.alert('Could Not Save Address', serverMsg || apiError.message || 'Please check the details and try again.');
          return;
        }

        const existingAddressesJson = await AsyncStorage.getItem(STORAGE_KEYS.ADDRESSES);
        const existingAddresses = existingAddressesJson ? JSON.parse(existingAddressesJson) : [];

        savedAddress = {
          id: `local_${Date.now()}`,
          ...addressData,
          createdAt: new Date().toISOString(),
        };

        if (existingAddresses.length === 0) {
          savedAddress.isDefault = true;
        }

        const updatedAddresses = [...existingAddresses, savedAddress];
        await AsyncStorage.setItem(STORAGE_KEYS.ADDRESSES, JSON.stringify(updatedAddresses));
      }

      Alert.alert(
        'Success',
        'Address saved successfully!',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.navigate('AddressSelection', { refresh: true } as any);
            }
          }
        ]
      );
    } catch (error: any) {
      let errorMessage = ERROR_MESSAGES.SOMETHING_WRONG;

      if (error?.message?.includes('Network Error')) {
        errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} ref={cameraRef}>
          <View style={styles.cameraOverlay}>
            <TouchableOpacity
              style={styles.cameraCloseButton}
              onPress={() => setShowCamera(false)}
            >
              <MaterialIcons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={capturePicture}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LoadingOverlay visible={isSaving} message="Saving address..." />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Add New Address</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            region={region}
            onPress={handleLocationSelect}
          >
            <Marker
              coordinate={region}
              draggable
              onDragEnd={(e) => {
                const { latitude, longitude } = e.nativeEvent.coordinate;
                setRegion((prev) => ({ ...prev, latitude, longitude }));
              }}
            />
          </MapView>
          <TouchableOpacity
            style={styles.currentLocationButton}
            onPress={handleGetCurrentLocation}
            disabled={isLocating}
          >
            <MaterialIcons name="my-location" size={24} color={isLocating ? COLORS.gray400 : COLORS.primary} />
          </TouchableOpacity>
          {isLocating && (
            <View style={styles.accuracyBadge}>
              <Text style={styles.accuracyText}>
                {locationAccuracy ? `Getting GPS... ~${locationAccuracy}m` : 'Waiting for GPS...'}
              </Text>
            </View>
          )}
          {!isLocating && locationAccuracy !== null && (
            <View style={styles.accuracyBadge}>
              <Text style={styles.accuracyText}>GPS accuracy: ~{locationAccuracy}m</Text>
            </View>
          )}
        </View>
        <Text style={styles.mapHint}>Tap or drag the pin to adjust your exact location</Text>
        <View style={styles.form}>
          {/* Label Selection */}
          <Text style={styles.label}>Address Label</Text>
          <View style={styles.labelContainer}>
            {labels.map((l) => (
              <TouchableOpacity
                key={l}
                style={[styles.labelButton, label === l && styles.labelButtonActive]}
                onPress={() => setLabel(l)}
              >
                <Text
                  style={[
                    styles.labelButtonText,
                    label === l && styles.labelButtonTextActive,
                  ]}
                >
                  {l}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Address Input */}
          <Input
            label="Complete Address"
            placeholder="House number, street, area..."
            value={address}
            onChangeText={(text) => {
              setAddress(text);
              setErrors({});
            }}
            error={errors.address}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={styles.addressInput}
          />

          {/* Door Picture */}
          <Text style={styles.label}>Door Picture (Optional)</Text>
          <TouchableOpacity
            style={styles.doorPictureButton}
            onPress={handleDoorPicturePress}
          >
            {doorImage ? (
              <Image source={{ uri: doorImage }} style={styles.doorPicture} />
            ) : (
              <>
                <MaterialIcons name="add-a-photo" size={32} color={COLORS.gray400} />
                <Text style={styles.doorPictureText}>Take photo or choose from gallery</Text>
              </>
            )}
          </TouchableOpacity>
          {doorImage && (
            <View style={styles.doorPictureActions}>
              <TouchableOpacity onPress={handleTakePicture} style={styles.doorPictureActionBtn}>
                <MaterialIcons name="camera-alt" size={18} color={COLORS.primary} />
                <Text style={styles.doorPictureActionText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickFromGallery} style={styles.doorPictureActionBtn}>
                <MaterialIcons name="photo-library" size={18} color={COLORS.primary} />
                <Text style={styles.doorPictureActionText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDoorImage(null)} style={styles.doorPictureActionBtn}>
                <MaterialIcons name="delete-outline" size={18} color={COLORS.error} />
                <Text style={[styles.doorPictureActionText, { color: COLORS.error }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <Button title="Save Address" onPress={handleSave} size="large" />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  mapContainer: {
    height: 250,
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  currentLocationButton: {
    position: 'absolute',
    right: SPACING.md,
    bottom: SPACING.md,
    backgroundColor: COLORS.white,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  accuracyBadge: {
    position: 'absolute',
    left: SPACING.md,
    bottom: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  accuracyText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '500',
  },
  mapHint: {
    fontSize: 12,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginHorizontal: SPACING.lg,
  },
  form: {
    padding: SPACING.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: SPACING.sm,
  },
  labelContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  labelButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.gray100,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  labelButtonActive: {
    backgroundColor: COLORS.primaryLighter,
    borderColor: COLORS.primary,
  },
  labelButtonText: {
    fontSize: 14,
    color: COLORS.gray600,
  },
  labelButtonTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  addressInput: {
    height: 80,
    paddingTop: SPACING.md,
  },
  doorPictureButton: {
    height: 120,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.gray200,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
  },
  doorPicture: {
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.lg,
  },
  doorPictureText: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: SPACING.sm,
  },
  doorPictureActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.sm,
  },
  doorPictureActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  doorPictureActionText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
    marginLeft: 4,
  },
  bottomPadding: {
    height: 100,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  // Camera styles
  cameraContainer: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  cameraCloseButton: {
    alignSelf: 'flex-start',
    padding: SPACING.sm,
  },
  captureButton: {
    alignSelf: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.gray300,
  },
});

export default AddAddressScreen;
