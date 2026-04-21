import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { AttaStackParamList, Address, DeliverySlot } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, ATTA_CHAKKI } from '@utils/constants';
import { formatCurrency } from '@utils/helpers';
import { Button, Input, LoadingOverlay } from '@components';
import { addressService } from '@services/address.service';
import { orderService } from '@services/order.service';
import { attaService } from '@services/atta.service';

export const AttaRequestScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AttaStackParamList>>();
  
  const [weight, setWeight] = useState('');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<DeliverySlot | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ 
    weight?: string; 
    address?: string; 
    slot?: string;
    notes?: string;
  }>({});

  const loadData = useCallback(async () => {
    try {
      const [addressesRes, slotsRes] = await Promise.all([
        addressService.getAddresses(),
        orderService.getDeliverySlots(),
      ]);
      
      if (addressesRes.success) {
        setAddresses(addressesRes.data);
        const defaultAddr = addressesRes.data.find((a) => a.isDefault);
        if (defaultAddr) setSelectedAddress(defaultAddr);
      }
      
      if (slotsRes.success) {
        setSlots(slotsRes.data.filter((s) => s.available));
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const weightValue = parseFloat(weight) || 0;
  const totalPrice = weightValue * ATTA_CHAKKI.PRICE_PER_KG;

  const validate = (): boolean => {
    const newErrors: { 
      weight?: string; 
      address?: string; 
      slot?: string;
      notes?: string;
    } = {};
    
    // Weight validation
    if (!weight || weight.trim() === '') {
      newErrors.weight = 'Please enter wheat weight';
    } else if (isNaN(weightValue) || weightValue <= 0) {
      newErrors.weight = 'Please enter a valid weight';
    } else if (weightValue < ATTA_CHAKKI.MIN_WEIGHT_KG) {
      newErrors.weight = `Minimum weight is ${ATTA_CHAKKI.MIN_WEIGHT_KG}kg`;
    } else if (weightValue > ATTA_CHAKKI.MAX_WEIGHT_KG) {
      newErrors.weight = `Maximum weight is ${ATTA_CHAKKI.MAX_WEIGHT_KG}kg`;
    }
    
    // Address validation
    if (!selectedAddress) {
      newErrors.address = 'Please select a pickup address';
    }
    
    // Time slot validation
    if (!selectedSlot) {
      newErrors.slot = 'Please select a preferred pickup time';
    }
    
    // Notes validation (optional but with max length)
    if (notes && notes.length > 500) {
      newErrors.notes = 'Notes should not exceed 500 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !selectedAddress || !selectedSlot) return;

    setLoading(true);
    try {
      const response = await attaService.createRequest({
        addressId: selectedAddress.id,
        wheatQuantityKg: weightValue,
        specialInstructions: notes || undefined,
      });

      if (response.success) {
        navigation.navigate('AttaTracking', { requestId: response.data.id });
      }
    } catch (error) {
      console.error('Error creating request:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LoadingOverlay visible={loading} message="Submitting request..." />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Request Atta Grinding</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Weight Input */}
        <View style={styles.section}>
          <Text style={styles.label}>Wheat Weight (kg)</Text>
          <Input
            placeholder={`Min ${ATTA_CHAKKI.MIN_WEIGHT_KG}kg - Max ${ATTA_CHAKKI.MAX_WEIGHT_KG}kg`}
            value={weight}
            onChangeText={(text) => {
              setWeight(text.replace(/[^0-9]/g, ''));
              setErrors({});
            }}
            keyboardType="numeric"
            error={errors.weight}
            leftIcon={<MaterialIcons name="scale" size={20} color={COLORS.gray400} />}
          />
          <Text style={styles.pricePreview}>
            Total: {formatCurrency(totalPrice)}
          </Text>
        </View>

        {/* Address Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Pickup Address</Text>
          {errors.address && (
            <Text style={styles.errorText}>{errors.address}</Text>
          )}
          {addresses.length === 0 ? (
            <View style={styles.noAddressContainer}>
              <MaterialIcons name="location-off" size={32} color={COLORS.gray400} />
              <Text style={styles.noAddressText}>No addresses found</Text>
              <Text style={styles.noAddressSubtext}>Please add an address first</Text>
            </View>
          ) : (
            addresses.map((address) => (
            <TouchableOpacity
              key={address.id}
              style={[
                styles.addressCard,
                selectedAddress?.id === address.id && styles.addressCardSelected,
              ]}
              onPress={() => setSelectedAddress(address)}
            >
              <MaterialIcons
                name={address.label?.toLowerCase() === 'home' ? 'home' : 'business'}
                size={20}
                color={selectedAddress?.id === address.id ? COLORS.primary : COLORS.gray500}
              />
              <View style={styles.addressInfo}>
                <Text style={styles.addressLabel}>{address.label}</Text>
                <Text style={styles.addressText} numberOfLines={2}>
                  {address.fullAddress}
                </Text>
              </View>
              {selectedAddress?.id === address.id && (
                <MaterialIcons name="check-circle" size={20} color={COLORS.primary} />
              )}
            </TouchableOpacity>
          )))}
        </View>

        {/* Time Slot Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Preferred Pickup Time</Text>
          {errors.slot && (
            <Text style={styles.errorText}>{errors.slot}</Text>
          )}
          {slots.length === 0 ? (
            <View style={styles.noSlotsContainer}>
              <MaterialIcons name="schedule" size={32} color={COLORS.gray400} />
              <Text style={styles.noSlotsText}>No time slots available</Text>
            </View>
          ) : (
          <View style={styles.slotsGrid}>
            {slots.map((slot) => (
              <TouchableOpacity
                key={slot.id}
                style={[
                  styles.slotCard,
                  selectedSlot?.id === slot.id && styles.slotCardSelected,
                ]}
                onPress={() => setSelectedSlot(slot)}
              >
                <Text
                  style={[
                    styles.slotText,
                    selectedSlot?.id === slot.id && styles.slotTextSelected,
                  ]}
                >
                  {slot.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          )}
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Additional Notes (Optional)</Text>
          {errors.notes && (
            <Text style={styles.errorText}>{errors.notes}</Text>
          )}
          <Input
            placeholder="Any special instructions..."
            value={notes}
            onChangeText={(text) => {
              setNotes(text);
              if (errors.notes) {
                setErrors({ ...errors, notes: undefined });
              }
            }}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={styles.notesInput}
            error={errors.notes}
          />
          <Text style={styles.characterCount}>
            {notes.length}/500 characters
          </Text>
        </View>

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.footer}>
        <Button
          title={`Submit Request - ${formatCurrency(totalPrice)}`}
          onPress={handleSubmit}
          disabled={!weight || !selectedAddress || !selectedSlot}
          size="large"
        />
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
  section: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: SPACING.sm,
  },
  pricePreview: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: SPACING.sm,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  addressCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
  },
  addressInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  addressText: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -SPACING.xs,
  },
  slotCard: {
    width: '50%',
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  slotText: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: 14,
    color: COLORS.gray700,
    textAlign: 'center',
  },
  slotCardSelected: {},
  slotTextSelected: {
    backgroundColor: COLORS.primary,
    color: COLORS.white,
  },
  notesInput: {
    height: 80,
    paddingTop: SPACING.md,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    marginBottom: SPACING.xs,
  },
  characterCount: {
    fontSize: 12,
    color: COLORS.gray400,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  noAddressContainer: {
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.md,
  },
  noAddressText: {
    fontSize: 14,
    color: COLORS.gray600,
    marginTop: SPACING.sm,
  },
  noAddressSubtext: {
    fontSize: 12,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
  },
  noSlotsContainer: {
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.md,
  },
  noSlotsText: {
    fontSize: 14,
    color: COLORS.gray600,
    marginTop: SPACING.sm,
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
});

export default AttaRequestScreen;
