import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { getAccurateLocation } from '../../services/location.service';
import { useTaskStore } from '../../store/taskStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import MapPreview from '../../components/MapPreview';
import Button from '../../components/Button';
import OrderChat from '../../components/OrderChat';
import LoadingSpinner from '../../components/LoadingSpinner';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../utils/constants';
import {
  getTaskTypeLabel,
  getTaskStatusLabel,
  formatCurrency,
  getTranslation,
} from '../../utils/helpers';
import { socketService } from '../../services/socket.service';
import { Task } from '../../types';

interface TaskDetailScreenProps {
  navigation: any;
  route: any;
}

const TaskDetailScreen: React.FC<TaskDetailScreenProps> = ({ navigation, route }) => {
  const { taskId } = route.params;
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalling, setIsCalling] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPinningLocation, setIsPinningLocation] = useState(false);
  const [isUploadingDoorPic, setIsUploadingDoorPic] = useState(false);
  const [adjustedLocation, setAdjustedLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const {
    fetchTaskById,
    markPickedUp,
    markDelivered,
    requestCustomerCall,
    uploadDeliveryProof,
    uploadDoorPicture,
    pinLocation,
  } = useTaskStore();

  const { language } = useSettingsStore();
  const { rider } = useAuthStore();

  // Load task on mount
  useEffect(() => {
    loadTask();
  }, [taskId]);

  // Setup socket for real-time updates when task is loaded
  useEffect(() => {
    if (!task?.orderId) return;

    const setupSocket = () => {
      socketService.connect();
      socketService.subscribeToOrder(task.orderId, (data: any) => {
        console.log('[TaskDetail] Order update:', data);
        loadTask();
      });

      // Listen for new assignments
      socketService.onNewAssignment((data: any) => {
        console.log('[TaskDetail] New assignment:', data);
        loadTask();
      });
    };

    setupSocket();

    return () => {
      socketService.unsubscribeFromOrder(task.orderId);
      socketService.off('rider:new_assignment');
    };
  }, [task?.orderId, loadTask]);

  const loadTask = async () => {
    try {
      setIsLoading(true);
      const taskData = await fetchTaskById(taskId);
      setTask(taskData);
    } catch (error) {
      console.error('Error loading task:', error);
      Alert.alert(
        language === 'ur' ? 'خرابی' : 'Error',
        language === 'ur' ? 'کام لوڈ نہیں ہو سکا' : 'Failed to load task'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Handle navigate to location
  const handleNavigate = useCallback(() => {
    if (task) {
      const url = Platform.select({
        ios: `maps://app?daddr=${task.latitude},${task.longitude}`,
        android: `google.navigation:q=${task.latitude},${task.longitude}`,
      });
      if (url) {
        Linking.openURL(url);
      }
    }
  }, [task]);

  // Handle pin location for address — waits for accurate GPS fix
  const handlePinLocation = async () => {
    if (!task) return;

    setIsPinningLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          language === 'ur' ? 'اجازت درکار' : 'Permission Required',
          language === 'ur'
            ? 'مقام کی اجازت درکار ہے'
            : 'Location permission is required to pin the delivery location'
        );
        setIsPinningLocation(false);
        return;
      }

      // Wait for GPS lock with ≤10m accuracy (up to 15s)
      const location = await getAccurateLocation(10, 15000);

      if (!location) {
        Alert.alert(
          language === 'ur' ? 'GPS سگنل نہیں ملا' : 'No GPS Signal',
          language === 'ur'
            ? 'GPS سگنل نہیں مل سکا۔ کھلی جگہ میں جا کر دوبارہ کوشش کریں۔'
            : 'Could not get GPS signal. Move to an open area and try again.'
        );
        setIsPinningLocation(false);
        return;
      }

      const accuracy = location.coords.accuracy ?? 0;

      await pinLocation(task.id, location.coords.latitude, location.coords.longitude);

      const accText = accuracy < 1 ? '< 1m' : `~${Math.round(accuracy)}m`;
      Alert.alert(
        language === 'ur' ? 'مقام محفوظ' : 'Location Saved',
        language === 'ur'
          ? `مقام محفوظ ہو گیا (درستگی: ${accText})۔ اگلی بار خودکار استعمال ہوگا۔`
          : `Location saved (accuracy: ${accText}). Will be used automatically for future orders.`,
        [{ text: 'OK', onPress: loadTask }]
      );
    } catch (error) {
      Alert.alert(
        language === 'ur' ? 'خرابی' : 'Error',
        language === 'ur'
          ? 'مقام محفوظ نہیں ہو سکا'
          : 'Failed to save location. Please try again.'
      );
    } finally {
      setIsPinningLocation(false);
    }
  };

  // Handle upload or update door picture
  const handleUploadDoorPicture = async () => {
    if (!task) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
      });

      if (result.canceled || !result.assets[0]) return;

      setIsUploadingDoorPic(true);
      const url = await uploadDoorPicture(task.id, result.assets[0].uri);
      setTask((prev) => prev ? { ...prev, gateImage: url } : prev);

      Alert.alert(
        language === 'ur' ? 'تصویر محفوظ' : 'Picture Saved',
        language === 'ur'
          ? 'دروازے کی تصویر کامیابی سے محفوظ ہو گئی۔ یہ تصویر اس پتے کے ساتھ ہر جگہ اپ ڈیٹ ہو جائے گی۔'
          : 'Door picture saved successfully. It will be updated everywhere for this address.'
      );
    } catch (error) {
      Alert.alert(
        language === 'ur' ? 'خرابی' : 'Error',
        language === 'ur'
          ? 'تصویر محفوظ نہیں ہو سکی'
          : 'Failed to save door picture'
      );
    } finally {
      setIsUploadingDoorPic(false);
    }
  };

  // Handle call customer (privacy feature)
  const handleCallCustomer = async () => {
    if (!task) return;

    setIsCalling(true);
    try {
      await requestCustomerCall(task.id);
      Alert.alert(
        language === 'ur' ? 'کال کی درخواست' : 'Call Request',
        language === 'ur'
          ? 'صارف کو کال کی اطلاع بھیج دی گئی ہے۔ صارف کو مطلع کیا جائے گا کہ آپ ان کے دروازے پر ہیں۔'
          : 'Call request sent to customer. They will be notified that you are at their door.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        language === 'ur' ? 'خرابی' : 'Error',
        language === 'ur'
          ? 'کال کی درخواست نہیں بھیج سکے'
          : 'Failed to send call request'
      );
    } finally {
      setIsCalling(false);
    }
  };

  // Handle mark picked up
  const handleMarkPickedUp = async () => {
    if (!task) return;

    Alert.alert(
      language === 'ur' ? 'پک اپ تصدیق کریں' : 'Confirm Pickup',
      language === 'ur'
        ? 'کیا آپ نے آرڈر اٹھا لیا ہے؟'
        : 'Have you picked up the order?',
      [
        { text: language === 'ur' ? 'نہیں' : 'No', style: 'cancel' },
        {
          text: language === 'ur' ? 'ہاں' : 'Yes',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await markPickedUp(task.id);
              Alert.alert(
                language === 'ur' ? 'تصدیق شدہ' : 'Confirmed',
                language === 'ur' ? 'پک اپ تصدیق شدہ' : 'Pickup confirmed',
                [{ text: 'OK', onPress: loadTask }]
              );
            } catch (error) {
              Alert.alert(
                language === 'ur' ? 'خرابی' : 'Error',
                language === 'ur'
                  ? 'پک اپ تصدیق نہیں ہو سکی'
                  : 'Failed to confirm pickup'
              );
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Handle mark delivered - Cash on Delivery, no photo needed
  const handleMarkDelivered = async () => {
    if (!task) return;

    Alert.alert(
      language === 'ur' ? 'ڈیلیوری تصدیق کریں' : 'Confirm Delivery',
      language === 'ur'
        ? 'کیا آپ نے آرڈر صارف کو پہنچا دیا ہے؟'
        : 'Have you delivered the order to the customer?',
      [
        { text: language === 'ur' ? 'نہیں' : 'No', style: 'cancel' },
        {
          text: language === 'ur' ? 'ہاں' : 'Yes',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await markDelivered(task.id, {
                notes: 'Delivered successfully - COD',
              });

              Alert.alert(
                language === 'ur' ? 'تصدیق شدہ' : 'Confirmed',
                language === 'ur' ? 'ڈیلیوری تصدیق شدہ' : 'Delivery confirmed',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]
              );
            } catch (error) {
              Alert.alert(
                language === 'ur' ? 'خرابی' : 'Error',
                language === 'ur'
                  ? 'ڈیلیوری تصدیق نہیں ہو سکی'
                  : 'Failed to confirm delivery'
              );
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Get action buttons based on task status
  const getActionButtons = () => {
    if (!task) return null;

    switch (task.status) {
      case 'assigned':
        return (
          task.type === 'delivery' ? (
            <Button
              title={language === 'ur' ? 'ڈیلیورڈ کا نشان لگائیں' : 'Mark Delivered'}
              onPress={handleMarkDelivered}
              variant="success"
              size="large"
              fullWidth
              icon="check-circle"
              loading={isProcessing}
            />
          ) : (
            <Button
              title={language === 'ur' ? 'پک اپ کا نشان لگائیں' : 'Mark Picked Up'}
              onPress={handleMarkPickedUp}
              variant="primary"
              size="large"
              fullWidth
              icon="package-variant-closed-check"
              loading={isProcessing}
            />
          )
        );
      case 'picked_up':
      case 'in_transit':
        return (
          <Button
            title={language === 'ur' ? 'ڈیلیورڈ کا نشان لگائیں' : 'Mark Delivered'}
            onPress={handleMarkDelivered}
            variant="success"
            size="large"
            fullWidth
            icon="check-circle"
            loading={isProcessing}
          />
        );
      case 'delivered':
        return (
          <View style={styles.completedBadge}>
            <MaterialCommunityIcons name="check-circle" size={24} color={COLORS.success} />
            <Text style={styles.completedText}>
              {language === 'ur' ? 'مکمل شدہ' : 'Completed'}
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner
          message={language === 'ur' ? 'لوڈ ہو رہا ہے...' : 'Loading...'}
          fullScreen
        />
      </SafeAreaView>
    );
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle" size={64} color={COLORS.danger} />
          <Text style={styles.errorText}>
            {language === 'ur' ? 'کام نہیں ملا' : 'Task not found'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} nestedScrollEnabled>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.typeBadge}>
            <MaterialCommunityIcons
              name={
                task.type === 'delivery'
                  ? 'truck-delivery'
                  : task.type === 'pickup'
                  ? 'package-variant'
                  : 'grain'
              }
              size={20}
              color={COLORS.primary}
            />
            <Text style={styles.typeText}>{getTaskTypeLabel(task.type, language)}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: `${COLORS.primary}15` },
            ]}
          >
            <Text style={[styles.statusText, { color: COLORS.primary }]}>
              {getTaskStatusLabel(task.status, language)}
            </Text>
          </View>
        </View>

        {/* Order ID */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {language === 'ur' ? 'آرڈر نمبر' : 'Order Number'}
          </Text>
          <Text style={styles.orderId}>#{task.orderId || task.attaRequestId}</Text>
        </View>

        {/* Map Preview */}
        {task.latitude && task.longitude ? (
          <>
            <MapPreview
              latitude={adjustedLocation?.latitude ?? task.latitude}
              longitude={adjustedLocation?.longitude ?? task.longitude}
              title={task.customerAddress}
              onNavigate={handleNavigate}
              height={250}
              draggable={task.status !== 'delivered' && task.status !== 'cancelled'}
              onMarkerDragEnd={(lat, lng) => setAdjustedLocation({ latitude: lat, longitude: lng })}
            />
            {adjustedLocation && task.status !== 'delivered' && task.status !== 'cancelled' && (
              <View style={styles.adjustedLocationBar}>
                <Button
                  title={language === 'ur' ? '📍 نئی جگہ محفوظ کریں' : '📍 Save Adjusted Location'}
                  onPress={async () => {
                    setIsPinningLocation(true);
                    try {
                      await pinLocation(task.id, adjustedLocation.latitude, adjustedLocation.longitude);
                      setAdjustedLocation(null);
                      Alert.alert(
                        language === 'ur' ? 'مقام محفوظ' : 'Location Saved',
                        language === 'ur'
                          ? 'ایڈجسٹ شدہ مقام محفوظ ہو گیا۔'
                          : 'Adjusted location saved successfully.',
                        [{ text: 'OK', onPress: loadTask }]
                      );
                    } catch (error) {
                      Alert.alert(
                        language === 'ur' ? 'خرابی' : 'Error',
                        language === 'ur' ? 'مقام محفوظ نہیں ہو سکا' : 'Failed to save location.'
                      );
                    } finally {
                      setIsPinningLocation(false);
                    }
                  }}
                  variant="primary"
                  size="small"
                  loading={isPinningLocation}
                  style={{ flex: 1 }}
                />
                <Button
                  title={language === 'ur' ? 'واپس' : 'Reset'}
                  onPress={() => setAdjustedLocation(null)}
                  variant="outline"
                  size="small"
                  style={{ marginLeft: SPACING.sm }}
                />
              </View>
            )}
          </>
        ) : (
          <View style={[styles.addressCard, { justifyContent: 'center', alignItems: 'center', height: 100 }]}>
            <MaterialCommunityIcons name="map-marker-off" size={32} color={COLORS.gray400} />
            <Text style={[styles.landmarkText, { marginTop: SPACING.xs }]}>
              {language === 'ur' ? 'نقشے کا مقام دستیاب نہیں' : 'Map location not available'}
            </Text>
          </View>
        )}

        {/* Address Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {getTranslation('customerAddress', language)}
          </Text>
          <View style={styles.addressCard}>
            <MaterialCommunityIcons name="map-marker" size={24} color={COLORS.danger} />
            <View style={styles.addressContent}>
              <Text style={styles.addressText}>{task.customerAddress}</Text>
              {task.houseNumber && (
                <View style={styles.houseNumberRow}>
                  <MaterialCommunityIcons name="home" size={16} color={COLORS.primary} />
                  <Text style={styles.houseNumberText}>
                    {language === 'ur' ? 'گھر نمبر: ' : 'House #:'} {task.houseNumber}
                  </Text>
                </View>
              )}
              {task.landmark && (
                <Text style={styles.landmarkText}>
                  {language === 'ur' ? 'نزدیک: ' : 'Near: '} {task.landmark}
                </Text>
              )}
              {(task.area || task.city) && (
                <Text style={styles.landmarkText}>
                  {[task.area, task.city].filter(Boolean).join(', ')}
                </Text>
              )}
            </View>
          </View>

          {/* Pin Location Button - show when address has no map location or allow update */}
          {task.status !== 'delivered' && task.status !== 'cancelled' && (
            <>
              {!task.has_location ? (
                <View style={styles.pinLocationCard}>
                  <MaterialCommunityIcons name="map-marker-plus" size={20} color={COLORS.accent} />
                  <Text style={styles.pinLocationText}>
                    {language === 'ur'
                      ? 'اس پتے کا مقام محفوظ نہیں ہے۔ اپنے موجودہ مقام سے محفوظ کریں۔'
                      : 'No map location saved for this address. Pin your current location.'}
                  </Text>
                  <Button
                    title={language === 'ur' ? '📍 مقام محفوظ کریں' : '📍 Pin My Location'}
                    onPress={handlePinLocation}
                    variant="primary"
                    size="small"
                    loading={isPinningLocation}
                  />
                </View>
              ) : (
                <View style={styles.locationSavedBadge}>
                  <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.success} />
                  <Text style={styles.locationSavedText}>
                    {language === 'ur'
                      ? `مقام ${task.location_added_by === 'rider' ? 'رائیڈر' : 'صارف'} نے محفوظ کیا`
                      : `Location pinned by ${task.location_added_by || 'user'}`}
                  </Text>
                  <Button
                    title={language === 'ur' ? '📍 مقام اپ ڈیٹ کریں' : '📍 Update Location'}
                    onPress={handlePinLocation}
                    variant="outline"
                    size="small"
                    loading={isPinningLocation}
                    style={styles.updateLocationBtn}
                  />
                </View>
              )}
            </>
          )}
        </View>

        {/* Gate/Door Image with upload/update */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {language === 'ur' ? 'گیٹ/دروازہ کی تصویر' : 'Gate/Door Image'}
          </Text>
          {task.gateImage ? (
            <View>
              <Image source={{ uri: task.gateImage }} style={styles.gateImage} />
              {task.status !== 'delivered' && task.status !== 'cancelled' && (
                <Button
                  title={language === 'ur' ? '📷 تصویر اپ ڈیٹ کریں' : '📷 Update Picture'}
                  onPress={handleUploadDoorPicture}
                  variant="outline"
                  size="small"
                  loading={isUploadingDoorPic}
                  style={styles.doorPicButton}
                />
              )}
            </View>
          ) : (
            task.status !== 'delivered' && task.status !== 'cancelled' && (
              <View style={styles.pinLocationCard}>
                <MaterialCommunityIcons name="camera-plus" size={20} color={COLORS.accent} />
                <Text style={styles.pinLocationText}>
                  {language === 'ur'
                    ? 'اس پتے کی دروازے/گیٹ کی تصویر نہیں ہے۔ تصویر شامل کریں تاکہ اگلی بار آسانی ہو۔'
                    : 'No door/gate picture for this address. Add one to help with future deliveries.'}
                </Text>
                <Button
                  title={language === 'ur' ? '📷 تصویر شامل کریں' : '📷 Add Picture'}
                  onPress={handleUploadDoorPicture}
                  variant="primary"
                  size="small"
                  loading={isUploadingDoorPic}
                />
              </View>
            )
          )}
        </View>

        {/* Time Window */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {getTranslation('timeWindow', language)}
          </Text>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="clock-outline" size={18} color={COLORS.gray500} />
            <View style={{ flex: 1, marginLeft: SPACING.sm }}>
              {task.requestedDeliveryDate && (
                <Text style={{ fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 2 }}>
                  {new Date(task.requestedDeliveryDate).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              )}
              <Text style={{ fontSize: FONT_SIZES.md, color: COLORS.textPrimary }}>{task.timeWindow}</Text>
            </View>
          </View>
        </View>

        {/* Order Items */}
        {task.items && task.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {language === 'ur' ? 'آرڈر اشیاء' : 'Order Items'}
            </Text>
            <View style={styles.itemsCard}>
              {task.items.map((item, index) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemNumber}>
                    <Text style={styles.itemNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.nameUrdu && (
                      <Text style={styles.itemNameUrdu}>{item.nameUrdu}</Text>
                    )}
                  </View>
                  <Text style={styles.itemQuantity}>
                    {item.quantity} {item.unit}
                  </Text>
                </View>
              ))}
              {task.totalAmount && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {language === 'ur' ? 'کل رقم:' : 'Total:'}
                  </Text>
                  <Text style={styles.totalAmount}>
                    {formatCurrency(task.totalAmount)}
                  </Text>
                </View>
              )}
              {task.deliveryFee && (
                <View style={[styles.totalRow, { borderTopWidth: 0, marginTop: 0, paddingTop: SPACING.xs }]}>
                  <Text style={styles.landmarkText}>
                    {language === 'ur' ? 'ڈیلیوری چارجز:' : 'Delivery Fee:'}
                  </Text>
                  <Text style={styles.landmarkText}>
                    {formatCurrency(task.deliveryFee)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Payment Info */}
        {task.paymentMethod && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {language === 'ur' ? 'ادائیگی' : 'Payment'}
            </Text>
            <View style={styles.infoRow}>
              <MaterialCommunityIcons
                name={task.paymentMethod === 'cod' ? 'cash' : 'credit-card'}
                size={18}
                color={COLORS.gray500}
              />
              <Text style={styles.infoText}>
                {task.paymentMethod === 'cod'
                  ? (language === 'ur' ? 'کیش آن ڈیلیوری' : 'Cash on Delivery')
                  : task.paymentMethod}
              </Text>
              {task.paymentStatus && (
                <View style={[
                  styles.paymentStatusBadge,
                  { backgroundColor: task.paymentStatus === 'completed' ? `${COLORS.success}20` : `${COLORS.accent}20` }
                ]}>
                  <Text style={[
                    styles.paymentStatusText,
                    { color: task.paymentStatus === 'completed' ? COLORS.success : COLORS.accent }
                  ]}>
                    {task.paymentStatus === 'completed'
                      ? (language === 'ur' ? 'مکمل' : 'Paid')
                      : (language === 'ur' ? 'زیر التوا' : 'Pending')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Special Instructions */}
        {task.specialInstructions && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {getTranslation('specialInstructions', language)}
            </Text>
            <View style={styles.instructionsCard}>
              <MaterialCommunityIcons
                name="information-outline"
                size={20}
                color={COLORS.accent}
              />
              <Text style={styles.instructionsText}>{task.specialInstructions}</Text>
            </View>
          </View>
        )}

        {/* Customer Contact */}
        {task.status !== 'delivered' && task.status !== 'cancelled' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {language === 'ur' ? 'صارف سے رابطہ' : 'Customer Contact'}
            </Text>
            {(task.customerPhone || (task as any).customer_phone) ? (
              <>
                <View style={styles.addressCard}>
                  <MaterialCommunityIcons name="account" size={24} color={COLORS.primary} />
                  <View style={styles.addressContent}>
                    {(task.customerName || (task as any).customer_name) && (
                      <Text style={styles.addressText}>{task.customerName || (task as any).customer_name}</Text>
                    )}
                    <Text style={styles.landmarkText}>{task.customerPhone || (task as any).customer_phone}</Text>
                  </View>
                </View>
                <View style={styles.contactButtons}>
                  <Button
                    title={language === 'ur' ? 'کال کریں' : 'Call'}
                    onPress={() => {
                      const phone = task.customerPhone || (task as any).customer_phone;
                      const url = Platform.OS === 'ios'
                        ? `telprompt:${phone}`
                        : `tel:${phone}`;
                      Linking.openURL(url);
                    }}
                    variant="outline"
                    size="large"
                    icon="phone"
                    style={styles.contactBtn}
                  />
                  <Button
                    title={language === 'ur' ? 'واٹس ایپ' : 'WhatsApp'}
                    onPress={() => {
                      const phone = (task.customerPhone || (task as any).customer_phone || '').replace(/[^0-9]/g, '');
                      const msg = language === 'ur'
                        ? `السلام علیکم! میں FreshBazar رائیڈر ہوں۔ آپ کا آرڈر #${task.orderId || ''} لے کر آ رہا ہوں۔`
                        : `Hi! I'm your FreshBazar rider. I'm on my way with your order #${task.orderId || ''}.`;
                      Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`);
                    }}
                    variant="primary"
                    size="large"
                    icon="whatsapp"
                    style={styles.contactBtn}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.contactButtons}>
                  <Button
                    title={
                      isCalling
                        ? getTranslation('ringing', language)
                        : (language === 'ur' ? 'کال کریں' : 'Call')
                    }
                    onPress={handleCallCustomer}
                    variant="outline"
                    size="large"
                    icon={isCalling ? 'phone-ring' : 'phone'}
                    loading={isCalling}
                    style={styles.contactBtn}
                  />
                </View>
              </>
            )}
          </View>
        )}

        {/* Chat with Customer */}
        {task.orderId && task.status !== 'delivered' && task.status !== 'cancelled' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {language === 'ur' ? 'صارف سے چیٹ' : 'Chat with Customer'}
            </Text>
            <OrderChat orderId={task.orderId} senderType="rider" orderStatus={task.status} />
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.section}>{getActionButtons()}</View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.primary}15`,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.xs,
  },
  typeText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary,
  },
  statusBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  statusText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderId: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  addressCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addressContent: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  addressText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  houseNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    backgroundColor: `${COLORS.primary}10`,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  houseNumberText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: SPACING.xs,
  },
  landmarkText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontStyle: 'italic',
  },
  pinLocationCard: {
    marginTop: SPACING.md,
    backgroundColor: `${COLORS.accent}10`,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: `${COLORS.accent}30`,
    borderStyle: 'dashed',
  },
  adjustedLocationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },
  pinLocationText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  locationSavedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  locationSavedText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.success,
    fontWeight: '500',
  },
  gateImage: {
    width: '100%',
    height: 200,
    borderRadius: BORDER_RADIUS.lg,
    resizeMode: 'cover',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  infoText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    marginLeft: SPACING.sm,
  },
  itemsCard: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  itemNumber: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemNumberText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  itemDetails: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  itemName: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
  },
  itemNameUrdu: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  itemQuantity: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
  },
  totalLabel: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  totalAmount: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  instructionsCard: {
    flexDirection: 'row',
    backgroundColor: `${COLORS.accent}10`,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
  },
  instructionsText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    marginLeft: SPACING.sm,
    lineHeight: 22,
  },
  privacyNote: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  actionButtons: {
    gap: SPACING.md,
  },
  photoPreview: {
    alignItems: 'center',
  },
  photoImage: {
    width: '100%',
    height: 200,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  retakeButton: {
    alignSelf: 'center',
  },
  deliverButton: {
    marginTop: SPACING.sm,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${COLORS.success}15`,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  completedText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.success,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  errorText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  updateLocationBtn: {
    marginLeft: 'auto' as any,
  },
  doorPicButton: {
    marginTop: SPACING.sm,
    alignSelf: 'center' as any,
  },
  contactButtons: {
    flexDirection: 'row' as any,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  contactBtn: {
    flex: 1,
  },
  paymentStatusBadge: {
    marginLeft: 'auto' as any,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.md,
  },
  paymentStatusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600' as any,
  },
});

export default TaskDetailScreen;
