import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { getRestaurantInfo, clearRestaurantSession, type RestaurantInfo } from '@services/restaurant.service';
import { RestaurantTabBar } from './RestaurantTabBar';

export const RestaurantProfileScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [info, setInfo] = useState<RestaurantInfo | null>(null);
  const [ready, setReady] = useState(false);

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
      </ScrollView>

      <RestaurantTabBar active="profile" />
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

function MenuItem({ icon, label, onPress, danger }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
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
});

export default RestaurantProfileScreen;
