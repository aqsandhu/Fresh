import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store/authStore';
import { useTaskStore } from '../../store/taskStore';
import { useDutyStore } from '../../store/dutyStore';
import { useT, tEnum } from '../../i18n';
import Button from '../../components/Button';
import { ScreenHeader, Card, Badge, StatTile } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme';
import { formatCurrency, getInitials, getRatingColor } from '../../utils/helpers';
import { APP_VERSION } from '../../utils/constants';
import type { RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const vehicleIcon = (type?: string): keyof typeof MaterialCommunityIcons.glyphMap => {
  switch (type) {
    case 'cycle':
      return 'bicycle';
    case 'car':
      return 'car';
    case 'van':
      return 'van-utility';
    default:
      return 'motorbike';
  }
};

const ProfileScreen: React.FC = () => {
  const { t, language } = useT();
  const navigation = useNavigation<Nav>();
  const [refreshing, setRefreshing] = useState(false);
  const { rider, logout, refreshProfile } = useAuthStore();
  const myStats = useTaskStore((s) => s.myStats);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  }, [refreshProfile]);

  const handleLogout = () => {
    Alert.alert(t('profile.logoutConfirmTitle'), t('profile.logoutConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.logout'), style: 'destructive', onPress: () => logout().catch(() => {}) },
    ]);
  };

  const rating = rider?.rating ?? 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('profile.title')} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />} showsVerticalScrollIndicator={false}>
        <Card style={styles.identity}>
          <View style={styles.avatarWrap}>
            {rider?.avatarUrl ? <Image source={{ uri: rider.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{getInitials(rider?.name || 'R')}</Text></View>}
            <View style={[styles.statusDot, { backgroundColor: isOnDuty ? colors.success : colors.gray400 }]} />
          </View>
          <Text style={styles.name}>{rider?.name || t('home.rider')}</Text>
          <Text style={styles.phone}>{rider?.phone}</Text>
          <View style={styles.badges}>
            <Badge label={isOnDuty ? t('profile.statusOnline') : t('profile.statusOffline')} tone={isOnDuty ? 'success' : 'neutral'} icon={isOnDuty ? 'power' : 'power-standby'} />
            {rider?.rating !== undefined ? (
              <View style={styles.rating}>
                <MaterialCommunityIcons name="star" size={16} color={colors.warning} />
                <Text style={[styles.ratingText, { color: getRatingColor(rating) }]}>{rating.toFixed(1)}</Text>
                {rider.ratingCount ? <Text style={styles.ratingCount}>{t('profile.ratingCount', { count: rider.ratingCount })}</Text> : null}
              </View>
            ) : null}
          </View>
          {rider?.vehicleType ? (
            <View style={styles.vehicle}>
              <MaterialCommunityIcons name={vehicleIcon(rider.vehicleType)} size={18} color={colors.textSecondary} />
              <Text style={styles.vehicleText}>
                {tEnum(language, 'profile.vehicle', rider.vehicleType)}
                {rider.vehicleNumber ? `  ·  ${rider.vehicleNumber}` : ''}
              </Text>
            </View>
          ) : null}
          {rider?.cnic ? (
            <View style={styles.vehicle}>
              <MaterialCommunityIcons name="card-account-details-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.vehicleText}>{t('profile.cnic')}  ·  {rider.cnic}</Text>
            </View>
          ) : null}
        </Card>

        <View style={styles.tiles}>
          <StatTile label={t('profile.totalDeliveries')} value={String(rider?.totalDeliveries ?? 0)} icon="motorbike" tone="primary" />
          <StatTile label={t('profile.totalEarned')} value={formatCurrency(myStats?.payment.totalEarned ?? rider?.totalEarnings ?? 0)} icon="wallet-outline" tone="success" />
        </View>

        <Card padded={false} style={styles.menu}>
          <MenuItem icon="cog-outline" title={t('profile.settings')} subtitle={t('profile.settingsHint')} onPress={() => navigation.navigate('Settings')} />
          <MenuItem icon="help-circle-outline" title={t('profile.help')} subtitle={t('profile.helpHint')} onPress={() => navigation.navigate('Help')} last />
        </Card>

        <Button title={t('profile.logout')} icon="logout" variant="outline" size="large" fullWidth onPress={handleLogout} style={styles.logout} textStyle={{ color: colors.danger }} />
        <Text style={styles.version}>{t('common.version', { version: APP_VERSION })}</Text>
      </ScrollView>
    </View>
  );
};

const MenuItem: React.FC<{ icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; subtitle: string; onPress: () => void; last?: boolean }> = ({ icon, title, subtitle, onPress, last }) => (
  <TouchableOpacity style={[styles.menuItem, !last && styles.menuItemBorder]} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
    <View style={styles.menuIcon}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.primaryDark} />
    </View>
    <View style={styles.flex}>
      <Text style={styles.menuTitle}>{title}</Text>
      <Text style={styles.menuSubtitle}>{subtitle}</Text>
    </View>
    <MaterialCommunityIcons name="chevron-right" size={24} color={colors.gray400} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  identity: { alignItems: 'center' },
  avatarWrap: { marginBottom: spacing.md },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: typography.size.display, fontWeight: typography.weight.bold, color: colors.white },
  statusDot: { position: 'absolute', right: 2, bottom: 2, width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: colors.surface },
  name: { fontSize: typography.size.xxl, fontWeight: typography.weight.bold, color: colors.text },
  phone: { fontSize: typography.size.md, color: colors.textSecondary, marginTop: 2 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.gray100, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  ratingText: { fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  ratingCount: { fontSize: typography.size.xs, color: colors.textMuted },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  vehicleText: { fontSize: typography.size.sm, color: colors.textSecondary },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  menu: { marginTop: spacing.lg },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  menuItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  menuSubtitle: { fontSize: typography.size.sm, color: colors.textMuted, marginTop: 2 },
  logout: { marginTop: spacing.xl, borderColor: colors.dangerSoft },
  version: { textAlign: 'center', fontSize: typography.size.xs, color: colors.textMuted, marginTop: spacing.lg },
});

export default ProfileScreen;
