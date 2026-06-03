import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Address } from '@types';
import { COLORS, SPACING } from '@utils/constants';
import { addressService } from '@services/address.service';
import {
  CheckoutAddressForm,
  CheckoutAddressFormInitial,
} from './CheckoutAddressForm';

interface CheckoutAddressActionsProps {
  address: Address;
  cityName: string;
  onUpdated: (updated: Address) => void;
  onDeleted: (id: string) => void;
}

export const CheckoutAddressActions: React.FC<CheckoutAddressActionsProps> = ({
  address,
  cityName,
  onUpdated,
  onDeleted,
}) => {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    Alert.alert('Delete Address', 'Delete this saved address? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await addressService.deleteAddress(address.id);
            onDeleted(address.id);
            Toast.show({ type: 'success', text1: 'Address deleted' });
          } catch (err: any) {
            Toast.show({ type: 'error', text1: err.message || 'Could not delete address' });
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (editing) {
    const initial: CheckoutAddressFormInitial = {
      id: address.id,
      label: (address as any).label || address.addressType,
      fullAddress: (address as any).writtenAddress || address.writtenAddress || address.fullAddress,
      areaName: address.areaName || (address as any).areaName,
      landmark: address.landmark,
      city: address.city || cityName,
      latitude: (address as any).latitude || address.location?.lat,
      longitude: (address as any).longitude || address.location?.lng,
      doorImage: (address as any).doorImage || address.doorPictureUrl,
    };

    return (
      <View style={styles.editWrap}>
        <CheckoutAddressForm
          cityName={cityName}
          initial={initial}
          onSaved={(updated) => {
            onUpdated(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.actionBtn} onPress={() => setEditing(true)}>
        <MaterialIcons name="edit" size={14} color={COLORS.primary600} />
        <Text style={styles.editText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionBtn} onPress={handleDelete} disabled={deleting}>
        {deleting ? (
          <ActivityIndicator size="small" color={COLORS.error} />
        ) : (
          <>
            <MaterialIcons name="delete-outline" size={14} color={COLORS.error} />
            <Text style={styles.deleteText}>Delete</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editText: { fontSize: 12, fontWeight: '600', color: COLORS.primary600 },
  deleteText: { fontSize: 12, fontWeight: '600', color: COLORS.error },
  editWrap: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary100,
    borderRadius: 8,
    backgroundColor: COLORS.white,
  },
});

export default CheckoutAddressActions;
