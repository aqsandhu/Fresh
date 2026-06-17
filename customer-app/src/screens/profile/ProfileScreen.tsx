import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { ProfileStackParamList, RootStackParamList, Address } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { formatPhoneNumber, getInitials } from '@utils/helpers';
import { useAuthStore } from '@store';
import { useOptionalCityName, useCityContext } from '@/context/CityContext';
import { addressMatchesSelectedCity } from '@/lib/cityStorage';
import { Button, Input } from '@components';
import { MobileHeader } from '@components/layout/MobileHeader';
import { addressService } from '@services/address.service';
import { authService } from '@services/auth.service';
import { cartService, type MyCoupon } from '@services/cart.service';

interface MenuItem {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  showArrow?: boolean;
}

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, isAuthenticated, updateUser } = useAuthStore();
  const cityName = useOptionalCityName();
  const { selectedCity } = useCityContext();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [myCoupons, setMyCoupons] = useState<MyCoupon[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAddresses = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await addressService.getAddresses();
      if (res.success) {
        const list = selectedCity?.name
          ? res.data.filter((a) =>
              addressMatchesSelectedCity((a as any).city || a.city, selectedCity.name)
            )
          : res.data;
        setAddresses(list);
      }
    } catch {
      /* optional */
    }
  }, [isAuthenticated, selectedCity?.id, selectedCity?.name]);

  useEffect(() => {
    setAddresses([]);
    loadAddresses();
    if (user) {
      setEditName(user.fullName || '');
      setEditEmail(user.email || '');
    }
  }, [loadAddresses, user]);

  useEffect(() => {
    if (!isAuthenticated) {
      setMyCoupons([]);
      return;
    }
    cartService.getMyCoupons().then((res) => setMyCoupons(res.coupons || []));
  }, [isAuthenticated, selectedCity?.id]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await authService.updateProfile({ fullName: editName, email: editEmail || undefined });
      if (res.success) {
        updateUser({ fullName: editName, email: editEmail || undefined });
        setIsEditing(false);
        Toast.show({ type: 'success', text1: 'Profile updated successfully!' });
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.message || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAddress = (id: string) => {
    Alert.alert('Delete Address', 'Are you sure you want to delete this address?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await addressService.deleteAddress(id);
            setAddresses((prev) => prev.filter((a) => a.id !== id));
            Toast.show({ type: 'success', text1: 'Address deleted' });
          } catch (err: any) {
            Toast.show({ type: 'error', text1: err.message || 'Failed to delete address' });
          }
        },
      },
    ]);
  };

  const menuItems: MenuItem[] = [
    {
      icon: 'restaurant',
      title: 'Order as Restaurant',
      subtitle: 'Wholesale catalog for restaurants',
      onPress: () => navigation.navigate('RestaurantLogin'),
      showArrow: true,
    },
    {
      icon: 'grain',
      title: 'Atta Chakki',
      subtitle: 'Grind your wheat at our mill',
      onPress: () => navigation.navigate('AttaChakkiMain'),
      showArrow: true,
    },
    {
      icon: 'location-city',
      title: 'Change City',
      subtitle: cityName,
      onPress: () => navigation.navigate('SelectCity'),
      showArrow: true,
    },
    ...(isAuthenticated
      ? [
          {
            icon: 'person',
            title: 'Edit Profile',
            subtitle: 'Update your personal information',
            onPress: () => navigation.navigate('EditProfile'),
            showArrow: true,
          },
          {
            icon: 'location-on',
            title: 'My Addresses',
            subtitle: 'Manage your delivery addresses',
            onPress: () => navigation.navigate('MyAddresses'),
            showArrow: true,
          },
          {
            icon: 'favorite-border',
            title: 'Wishlist',
            subtitle: 'View your saved items',
            onPress: () => navigation.navigate('Wishlist'),
            showArrow: true,
          },
          {
            icon: 'receipt-long',
            title: 'My Orders',
            subtitle: 'View your order history',
            onPress: () =>
              navigation.getParent()?.navigate('Orders' as never),
            showArrow: true,
          },
          {
            icon: 'rate-review',
            title: 'Reviews & Complaints',
            subtitle: 'Rate orders or raise a complaint',
            onPress: () => navigation.navigate('Support'),
            showArrow: true,
          },
          {
            icon: 'notifications',
            title: 'Notifications',
            subtitle: 'Manage notification preferences',
            onPress: () => navigation.navigate('Notifications'),
            showArrow: true,
          },
          {
            icon: 'settings',
            title: 'Settings',
            subtitle: 'App settings and preferences',
            onPress: () => navigation.navigate('Settings'),
            showArrow: true,
          },
        ]
      : []),
    {
      icon: 'two-wheeler',
      title: 'Work as a Rider',
      subtitle: 'Join our delivery team',
      onPress: () => navigation.navigate('WorkAsRider'),
      showArrow: true,
    },
    {
      icon: 'help',
      title: 'Help & Support',
      subtitle: 'Get help with your orders',
      onPress: () => navigation.navigate('Help'),
      showArrow: true,
    },
    {
      icon: 'info',
      title: 'About',
      subtitle: 'App version and information',
      onPress: () => navigation.navigate('About'),
      showArrow: true,
    },
  ];

  const handleLogout = async () => {
    await logout();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MobileHeader
        onSearchPress={() =>
          rootNavigation.navigate('Main', {
            screen: 'Home',
            params: { screen: 'Search' },
          })
        }
      />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Profile</Text>
        </View>

        {/* User Card */}
        {isAuthenticated ? (
        <>
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <TouchableOpacity onPress={() => setIsEditing((v) => !v)}>
              <Text style={styles.editLink}>{isEditing ? 'Cancel' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.profileAvatarRow}>
            <View style={styles.avatar}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{getInitials(user?.fullName || 'U')}</Text>
              )}
            </View>
            <View>
              <Text style={styles.userName}>{user?.fullName || 'User'}</Text>
              <Text style={styles.userPhone}>{formatPhoneNumber(user?.phone || '')}</Text>
            </View>
          </View>
          {isEditing ? (
            <View style={styles.editForm}>
              <Input label="Full Name" value={editName} onChangeText={setEditName} />
              <Input label="Phone Number" value={user?.phone || ''} editable={false} />
              <Input
                label="Email"
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
              />
              <View style={styles.editActions}>
                <Button title="Cancel" variant="outline" onPress={() => setIsEditing(false)} style={{ flex: 1 }} />
                <Button title={saving ? 'Saving...' : 'Save Changes'} onPress={handleSaveProfile} disabled={saving} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <View style={styles.infoGrid}>
              <View style={styles.infoTile}>
                <MaterialIcons name="phone" size={18} color={COLORS.gray400} />
                <View>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{formatPhoneNumber(user?.phone || '')}</Text>
                </View>
              </View>
              <View style={styles.infoTile}>
                <MaterialIcons name="email" size={18} color={COLORS.gray400} />
                <View>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{user?.email || 'Not provided'}</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Saved Addresses</Text>
            <TouchableOpacity onPress={() => navigation.navigate('MyAddresses')}>
              <Text style={styles.editLink}>+ Manage Addresses</Text>
            </TouchableOpacity>
          </View>
          {addresses.length === 0 ? (
            <Text style={styles.noAddresses}>No saved addresses yet</Text>
          ) : (
            addresses.map((address) => (
              <View key={address.id} style={styles.addressRow}>
                <View style={styles.addressIcon}>
                  <MaterialIcons name="location-on" size={18} color={COLORS.primary600} />
                </View>
                <View style={styles.addressContent}>
                  <View style={styles.addressLabelRow}>
                    <Text style={styles.addressLabel}>{address.label || 'Address'}</Text>
                    {address.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.addressText} numberOfLines={2}>{address.fullAddress}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteAddress(address.id)}>
                  <MaterialIcons name="delete-outline" size={20} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* My Coupons */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Coupons</Text>
          </View>
          {myCoupons.length === 0 ? (
            <Text style={styles.noAddresses}>
              No coupons right now. Loyalty & welcome-back rewards appear here automatically.
            </Text>
          ) : (
            myCoupons.map((c) => (
              <View key={c.code} style={styles.couponCard}>
                <Text style={styles.couponCardCode}>
                  <MaterialIcons name="local-offer" size={14} color={COLORS.primary700} /> {c.code}
                </Text>
                <Text style={styles.couponCardSummary}>{c.summary}</Text>
              </View>
            ))
          )}
        </View>
        </>
        ) : (
          <View style={styles.guestCard}>
            <Text style={styles.guestTitle}>Login to your account</Text>
            <Text style={styles.guestSubtitle}>
              Access orders, addresses, and saved preferences
            </Text>
            <Button
              title="Login / Register"
              onPress={() => rootNavigation.navigate('Auth', { screen: 'Login' })}
              size="large"
            />
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.menuItem,
                index === menuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={item.onPress}
            >
              <View style={styles.menuIcon}>
                <MaterialIcons
                  name={item.icon as any}
                  size={22}
                  color={COLORS.primary}
                />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                {item.subtitle && (
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                )}
              </View>
              {item.showArrow && (
                <MaterialIcons
                  name="chevron-right"
                  size={22}
                  color={COLORS.gray400}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        {isAuthenticated ? (
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MaterialIcons name="logout" size={22} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
        ) : null}

        {/* App Version */}
        <Text style={styles.version}>Version 1.0.0</Text>

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  sectionCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  editLink: { fontSize: 14, fontWeight: '600', color: COLORS.primary600 },
  profileAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  editForm: { gap: SPACING.sm },
  editActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  infoGrid: { gap: SPACING.sm },
  infoTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.gray50,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  infoLabel: { fontSize: 12, color: COLORS.gray500 },
  infoValue: { fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  noAddresses: { fontSize: 14, color: COLORS.gray500 },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  addressIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressContent: { flex: 1 },
  addressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  addressLabel: { fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  defaultBadge: {
    backgroundColor: COLORS.primary100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  defaultBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary700 },
  addressText: { fontSize: 13, color: COLORS.gray600, marginTop: 4 },
  couponCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.primary200,
    backgroundColor: COLORS.primary50,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  couponCardCode: { fontSize: 15, fontWeight: '700', color: COLORS.primary700 },
  couponCardSummary: { fontSize: 12, color: COLORS.gray600, marginTop: 2 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.primary50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
  },
  guestCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.primary50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
  },
  guestTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: SPACING.xs,
  },
  guestSubtitle: {
    fontSize: 14,
    color: COLORS.gray600,
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  userInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  userPhone: {
    fontSize: 14,
    color: COLORS.gray600,
    marginTop: 2,
  },
  userEmail: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSection: {
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primaryLighter,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  menuSubtitle: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.error + '10',
    borderRadius: BORDER_RADIUS.lg,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.error,
    marginLeft: SPACING.sm,
  },
  version: {
    fontSize: 12,
    color: COLORS.gray400,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  bottomPadding: {
    height: SPACING.xxl,
  },
});

export default ProfileScreen;
