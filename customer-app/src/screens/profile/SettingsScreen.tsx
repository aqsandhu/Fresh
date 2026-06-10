import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useAuthStore } from '@store';

interface SettingItem {
  icon: string;
  title: string;
  subtitle?: string;
  type: 'toggle' | 'link' | 'button';
  value?: boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
}

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { user } = useAuthStore();

  const [notifications, setNotifications] = useState(true);
  const [promotions, setPromotions] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [locationServices, setLocationServices] = useState(true);

  const settings: SettingItem[] = [
    {
      icon: 'notifications',
      title: 'Order Notifications',
      subtitle: 'Get notified about order updates',
      type: 'toggle',
      value: notifications,
      onToggle: setNotifications,
    },
    {
      icon: 'local-offer',
      title: 'Promotions',
      subtitle: 'Receive promotional offers',
      type: 'toggle',
      value: promotions,
      onToggle: setPromotions,
    },
    {
      icon: 'location-on',
      title: 'Location Services',
      subtitle: 'Enable location for better experience',
      type: 'toggle',
      value: locationServices,
      onToggle: setLocationServices,
    },
    {
      icon: 'verified-user',
      title: 'PIN Security',
      subtitle: 'Change your 4-digit login PIN',
      type: 'link',
      onPress: () => navigation.navigate('ChangePin'),
    },
    {
      icon: 'language',
      title: 'Language',
      subtitle: 'English',
      type: 'link',
      onPress: () => {},
    },
    {
      icon: 'privacy-tip',
      title: 'Privacy Policy',
      type: 'link',
      onPress: () => navigation.navigate('StaticPage', { pageId: 'privacy' }),
    },
    {
      icon: 'description',
      title: 'Terms of Service',
      type: 'link',
      onPress: () => navigation.navigate('StaticPage', { pageId: 'terms' }),
    },
    {
      icon: 'help',
      title: 'FAQ',
      type: 'link',
      onPress: () => navigation.navigate('StaticPage', { pageId: 'faq' }),
    },
    {
      icon: 'local-shipping',
      title: 'Shipping Info',
      type: 'link',
      onPress: () => navigation.navigate('StaticPage', { pageId: 'shipping' }),
    },
    {
      icon: 'assignment-return',
      title: 'Returns Policy',
      type: 'link',
      onPress: () => navigation.navigate('StaticPage', { pageId: 'returns' }),
    },
  ];

  const renderSettingItem = (item: SettingItem, index: number) => (
    <TouchableOpacity
      key={index}
      style={[styles.settingItem, index === settings.length - 1 && styles.settingItemLast]}
      onPress={item.type === 'link' || item.type === 'button' ? item.onPress : undefined}
      disabled={item.type === 'toggle'}
      activeOpacity={item.type === 'toggle' ? 1 : 0.7}
    >
      <View style={styles.settingIcon}>
        <MaterialIcons name={item.icon as any} size={22} color={COLORS.primary600} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{item.title}</Text>
        {item.subtitle && <Text style={styles.settingSubtitle}>{item.subtitle}</Text>}
      </View>
      {item.type === 'toggle' && (
        <Switch
          value={item.value}
          onValueChange={item.onToggle}
          trackColor={{ false: COLORS.gray300, true: COLORS.primary500 }}
          thumbColor={COLORS.white}
        />
      )}
      {item.type === 'link' && (
        <MaterialIcons name="chevron-right" size={22} color={COLORS.gray400} />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.fullName || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.userName}>{user?.fullName || 'User'}</Text>
            <Text style={styles.userPhone}>{user?.phone || ''}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.settingsCard}>
            {settings.map((item, index) => renderSettingItem(item, index))}
          </View>
        </View>
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
  },
  title: { fontSize: 18, fontWeight: '600', color: COLORS.gray900 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    margin: SPACING.lg,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: COLORS.primary600 },
  userName: { fontSize: 17, fontWeight: '600', color: COLORS.gray900 },
  userPhone: { fontSize: 14, color: COLORS.gray500, marginTop: 2 },
  section: { paddingHorizontal: SPACING.lg },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray500,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  settingsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  settingItemLast: { borderBottomWidth: 0 },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingContent: { flex: 1, marginLeft: SPACING.md },
  settingTitle: { fontSize: 15, fontWeight: '500', color: COLORS.gray900 },
  settingSubtitle: { fontSize: 12, color: COLORS.gray500, marginTop: 2 },
  bottomPadding: { height: SPACING.xxl },
});

export default SettingsScreen;
