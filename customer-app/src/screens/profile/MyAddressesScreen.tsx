import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList, Address } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Button, ErrorView, EmptyState } from '@components';
import { addressService } from '@services/address.service';

export const MyAddressesScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    try {
      setError(null);
      const response = await addressService.getAddresses();
      if (response.success) {
        setAddresses(response.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load addresses');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAddresses();
  };

  const handleSetDefault = async (id: string) => {
    try {
      await addressService.setDefaultAddress(id);
      loadAddresses();
    } catch (error) {
      console.error('Error setting default address:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await addressService.deleteAddress(id);
      loadAddresses();
    } catch (error) {
      console.error('Error deleting address:', error);
    }
  };

  const renderAddress = ({ item }: { item: Address }) => (
    <View style={styles.addressCard}>
      <View style={styles.addressHeader}>
        <View style={styles.labelContainer}>
          <MaterialIcons
            name={item.label === 'home' || item.label === 'Home' ? 'home' : item.label === 'work' || item.label === 'office' || item.label === 'Office' ? 'business' : 'location-on'}
            size={20}
            color={COLORS.primary}
          />
          <Text style={styles.label}>{item.label}</Text>
          {item.isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultText}>Default</Text>
            </View>
          )}
        </View>
        <View style={styles.actions}>
          {!item.isDefault && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleSetDefault(item.id)}
            >
              <MaterialIcons name="check-circle-outline" size={20} color={COLORS.gray400} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionButton}>
            <MaterialIcons name="edit" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDelete(item.id)}
          >
            <MaterialIcons name="delete" size={20} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.addressText}>{item.fullAddress}</Text>
      {item.doorImage && (
        <View style={styles.doorImageIndicator}>
          <MaterialIcons name="image" size={16} color={COLORS.gray400} />
          <Text style={styles.doorImageText}>Door picture added</Text>
        </View>
      )}
    </View>
  );

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadAddresses} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>My Addresses</Text>
        <View style={{ width: 24 }} />
      </View>

      {addresses.length === 0 && !loading ? (
        <EmptyState
          icon="location-off"
          title="No addresses"
          message="Add an address for faster checkout"
          actionTitle="Add Address"
          onAction={() => navigation.navigate('AddAddress' as any)}
        />
      ) : (
        <FlatList
          data={addresses}
          renderItem={renderAddress}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Add Address Button */}
      <View style={styles.footer}>
        <Button
          title="Add New Address"
          onPress={() => navigation.navigate('AddAddress' as any)}
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
  list: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  addressCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  defaultBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  defaultText: {
    fontSize: 10,
    color: COLORS.white,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  actionButton: {
    padding: SPACING.xs,
  },
  addressText: {
    fontSize: 14,
    color: COLORS.gray600,
    lineHeight: 20,
  },
  doorImageIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  doorImageText: {
    fontSize: 12,
    color: COLORS.gray400,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
});

export default MyAddressesScreen;
