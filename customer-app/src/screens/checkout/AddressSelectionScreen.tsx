import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { CartStackParamList, Address } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, STORAGE_KEYS } from '@utils/constants';
import { Button, ErrorView, EmptyState } from '@components';
import { addressService } from '@services/address.service';
import { useCheckoutStore } from '@store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const AddressSelectionScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CartStackParamList>>();
  const route = useRoute<RouteProp<CartStackParamList, 'AddressSelection'>>();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { selectedAddress, setSelectedAddress } = useCheckoutStore();

  const loadAddresses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      let allAddresses: Address[] = [];
      let apiSuccess = false;
      
      // Try to fetch from API first
      try {
        const response = await addressService.getAddresses();
        if (response.success && response.data) {
          allAddresses = response.data;
          apiSuccess = true;
        }
      } catch (apiError: any) {
        console.log('API fetch failed, using local storage:', apiError?.message);
      }
      
      // Fallback: Load from local storage if API fails or for merged results
      try {
        const localAddressesJson = await AsyncStorage.getItem(STORAGE_KEYS.ADDRESSES);
        if (localAddressesJson) {
          const localAddresses = JSON.parse(localAddressesJson);
          
          if (!apiSuccess) {
            // If API failed, use local addresses only
            allAddresses = localAddresses;
          } else {
            // Merge API and local addresses (avoid duplicates)
            const existingIds = new Set(allAddresses.map((a: Address) => a.id));
            const uniqueLocalAddresses = localAddresses.filter((a: Address) => !existingIds.has(a.id));
            allAddresses = [...allAddresses, ...uniqueLocalAddresses];
          }
        }
      } catch (localError) {
        console.log('Error loading local addresses:', localError);
      }
      
      setAddresses(allAddresses);
      
      // Auto-select default address if none selected
      if (!selectedAddress) {
        const defaultAddress = allAddresses.find((a) => a.isDefault);
        if (defaultAddress) {
          setSelectedAddress(defaultAddress);
        } else if (allAddresses.length > 0) {
          // Select first address if no default
          setSelectedAddress(allAddresses[0]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  }, [selectedAddress, setSelectedAddress]);

  // Load addresses on initial mount
  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  // Reload addresses when screen comes into focus (e.g., after adding new address)
  useFocusEffect(
    useCallback(() => {
      // Check if refresh is needed (e.g., from navigation params)
      const params = route.params as { refresh?: boolean } | undefined;
      if (params?.refresh) {
        loadAddresses();
        // Clear the refresh param
        navigation.setParams({ refresh: undefined } as any);
      }
    }, [route.params, loadAddresses, navigation])
  );

  const handleAddressSelect = (address: Address) => {
    setSelectedAddress(address);
  };

  const handleContinue = () => {
    if (selectedAddress) {
      navigation.navigate('TimeSlot');
    }
  };

  const renderAddress = ({ item }: { item: Address }) => {
    const isSelected = selectedAddress?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.addressCard, isSelected && styles.addressCardSelected]}
        onPress={() => handleAddressSelect(item)}
        activeOpacity={0.8}
      >
        <View style={styles.addressHeader}>
          <View style={styles.labelContainer}>
            <MaterialIcons
              name={item.label === 'home' || item.label === 'Home' ? 'home' : item.label === 'work' || item.label === 'office' || item.label === 'Office' ? 'business' : 'location-on'}
              size={20}
              color={isSelected ? COLORS.primary : COLORS.gray500}
            />
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {item.label}
            </Text>
            {item.isDefault && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultText}>Default</Text>
              </View>
            )}
          </View>
          {isSelected && (
            <MaterialIcons name="check-circle" size={24} color={COLORS.primary} />
          )}
        </View>
        <Text style={styles.addressText}>{item.fullAddress}</Text>
        {item.doorImage && (
          <View style={styles.doorImageIndicator}>
            <MaterialIcons name="image" size={16} color={COLORS.gray400} />
            <Text style={styles.doorImageText}>Door picture added</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

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
        <Text style={styles.title}>Select Address</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressStep, styles.progressStepActive]} />
        <View style={styles.progressLine} />
        <View style={styles.progressStep} />
        <View style={styles.progressLine} />
        <View style={styles.progressStep} />
      </View>

      {addresses.length === 0 ? (
        <EmptyState
          icon="location-off"
          title="No addresses found"
          message="Add an address to continue with your order"
          actionTitle="Add Address"
          onAction={() => navigation.navigate('AddAddress')}
        />
      ) : (
        <>
          <FlatList
            data={addresses}
            renderItem={renderAddress}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />

          {/* Add New Address Button */}
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('AddAddress')}
          >
            <MaterialIcons name="add" size={24} color={COLORS.primary} />
            <Text style={styles.addButtonText}>Add New Address</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Continue Button */}
      <View style={styles.footer}>
        <Button
          title="Continue"
          onPress={handleContinue}
          disabled={!selectedAddress}
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
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  progressStep: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.gray300,
  },
  progressStepActive: {
    backgroundColor: COLORS.primary,
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.gray200,
    marginHorizontal: SPACING.sm,
  },
  list: {
    padding: SPACING.lg,
  },
  addressCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  addressCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
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
    color: COLORS.gray700,
  },
  labelSelected: {
    color: COLORS.primary,
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: SPACING.sm,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
});

export default AddressSelectionScreen;
