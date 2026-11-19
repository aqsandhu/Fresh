import { asCaughtError } from '@/lib/caughtError';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { getRestaurantInfo, clearRestaurantSession, restaurantApi, type RestaurantInfo } from '@services/restaurant.service';
import { RestaurantTabBar } from './RestaurantTabBar';
import Toast from 'react-native-toast-message';

export const RestaurantProfileScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [info, setInfo] = useState<RestaurantInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [deletePin, setDeletePin] = useState('');

  useEffect(() => {
    getRestaurantInfo().then((i) => {
      if (!i) {
        navigation.replace('RestaurantLogin');
        return;
      }
      setInfo(i);
      setReady(true);
    });
  }, [navigation]);

  const logout = async () => {
    await clearRestaurantSession();
    navigation.replace('RestaurantLogin');
  };

  /** Last step: the server asks for the PIN again (a session alone may not delete). */
  const confirmDeleteWithPin = async () => {
    if (deleting || deletePin.length !== 4) return;
    setDeleting(true);
    try {
      await restaurantApi.deleteAccount(deletePin);
      setPinPromptOpen(false);
      await clearRestaurantSession();
      Toast.show({ type: 'success', text1: 'Restaurant account deleted' });
      navigation.replace('RestaurantLogin');
    } catch (eCaught: unknown) {
      const e = asCaughtError(eCaught);
      setDeletePin('');
      // The server says why: wrong PIN, or an order still on its way.
      Toast.show({ type: 'error', text1: e?.message || 'Could not delete restaurant account' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAccount = () => {
    if (deleting) return;
    Alert.alert(
      'Delete restaurant account',
      'This will permanently delete this restaurant account. Business details, contact info, address, storefront photo, and PIN will be removed. Order records may be kept for bookkeeping but will no longer identify the restaurant.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeletePin('');
            setPinPromptOpen(true);
          },
        },
      ]
    );
  };

  if (!ready) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Restaurant Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.md }}>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.avatar}>
              <MaterialIcons name="restaurant" size={26} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.bizName}>{info?.business_name}</Text>
              {!!info?.status && (
                <View style={styles.statusPill}><Text style={styles.statusText}>{info.status}</Text></View>
              )}
            </View>
          </View>
          <View style={{ marginTop: SPACING.md, gap: 8 }}>
            {!!info?.owner_name && <Line icon="person" text={info.owner_name} />}
            <Line icon="phone" text={info?.phone || ''} />
            {!!info?.city && <Line icon="location-on" text={info.city} />}
          </View>
        </View>

        <MenuItem icon="storefront" label="Browse catalog" onPress={() => navigation.navigate('RestaurantShop')} />
        <MenuItem icon="receipt-long" label="My orders" onPress={() => navigation.navigate('RestaurantOrders')} />
        <MenuItem icon="logout" label="Logout" danger onPress={logout} />
        <MenuItem
          icon="delete-forever"
          label={deleting ? 'Deleting restaurant account...' : 'Delete Restaurant Account'}
          danger
          onPress={handleDeleteAccount}
          disabled={deleting}
        />
      </ScrollView>

      <RestaurantTabBar active="profile" />

      <Modal visible={pinPromptOpen} transparent animationType="fade" onRequestClose={() => setPinPromptOpen(false)}>
        <View style={styles.pinBackdrop}>
          <View style={styles.pinCard}>
            <Text style={styles.pinTitle}>Enter your PIN</Text>
            <Text style={styles.pinHelp}>Type the restaurant&apos;s 4-digit PIN again to delete this account.</Text>
            <TextInput
              style={styles.pinInput}
              value={deletePin}
              onChangeText={(t) => setDeletePin(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              autoFocus
              accessibilityLabel="4-digit PIN"
              testID="restaurant-delete-pin-input"
            />
            <TouchableOpacity
              style={[styles.pinDelete, (deletePin.length !== 4 || deleting) && styles.menuItemDisabled]}
              disabled={deletePin.length !== 4 || deleting}
              onPress={confirmDeleteWithPin}
              accessibilityRole="button"
              testID="restaurant-delete-pin-confirm"
            >
              <Text style={styles.pinDeleteText}>{deleting ? 'Deleting…' : 'Delete account'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPinPromptOpen(false)} disabled={deleting} accessibilityRole="button">
              <Text style={styles.pinCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

function Line({ icon, text }: { icon: keyof typeof MaterialIcons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <MaterialIcons name={icon} size={16} color={COLORS.gray400} />
      <Text style={{ color: COLORS.gray700, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger, disabled }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.menuItem, disabled && styles.menuItemDisabled]} onPress={onPress} disabled={disabled}>
      <MaterialIcons name={icon} size={20} color={danger ? COLORS.error : COLORS.primary} />
      <Text style={[styles.menuLabel, danger && { color: COLORS.error }]}>{label}</Text>
      <MaterialIcons name="chevron-right" size={20} color={COLORS.gray300} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray200,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  card: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.gray100, marginBottom: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primary100, alignItems: 'center', justifyContent: 'center' },
  bizName: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  statusPill: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: COLORS.primary100, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '700', color: COLORS.primary700, textTransform: 'capitalize' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderWidth: 1, borderColor: COLORS.gray100, marginBottom: SPACING.sm,
  },
  menuLabel: { fontSize: 15, fontWeight: '600', color: COLORS.gray800 },
  menuItemDisabled: { opacity: 0.6 },
  pinBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: SPACING.lg },
  pinCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg },
  pinTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  pinHelp: { fontSize: 14, color: COLORS.gray600, marginTop: SPACING.xs },
  pinInput: {
    marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.gray300, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm, fontSize: 24, letterSpacing: 12, textAlign: 'center', color: COLORS.gray900,
  },
  pinDelete: { marginTop: SPACING.md, backgroundColor: COLORS.error, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center' },
  pinDeleteText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  pinCancel: { marginTop: SPACING.md, textAlign: 'center', color: COLORS.gray700, fontWeight: '600' },
});

export default RestaurantProfileScreen;
