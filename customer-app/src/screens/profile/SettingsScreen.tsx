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
import { ProfileStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

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
      icon: 'dark-mode',
      title: 'Dark Mode',
      subtitle: 'Switch to dark theme',
      type: 'toggle',
      value: darkMode,
      onToggle: setDarkMode,
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
      onPress: () => {},
    },
    {
      icon: 'description',
      title: 'Terms of Service',
      type: 'link',
      onPress: () => {},
    },
    {
      icon: 'delete',
      title: 'Clear Cache',
      type: 'button',
      onPress: () => {},
    },
  ];

  const renderSettingItem = (item: SettingItem, index: number) => (
    <View
      key={index}
      style={[
        styles.settingItem,
        index === settings.length - 1 && styles.settingItemLast,
      ]}
    >
      <View style={styles.settingIcon}>
        <MaterialIcons name={item.icon as any} size={22} color={COLORS.primary} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{item.title}</Text>
        {item.subtitle && (
          <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
        )}
      </View>
      {item.type === 'toggle' && (
        <Switch
          value={item.value}
          onValueChange={item.onToggle}
          trackColor={{ false: COLORS.gray300, true: COLORS.primary }}
          thumbColor={COLORS.white}
        />
      )}
      {item.type === 'link' && (
        <MaterialIcons name="chevron-right" size={22} color={COLORS.gray400} />
      )}
      {item.type === 'button' && (
        <TouchableOpacity onPress={item.onPress}>
          <MaterialIcons name="chevron-right" size={22} color={COLORS.gray400} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.settingsCard}>
            {settings.slice(0, 4).map((item, index) => renderSettingItem(item, index))}
          </View>
        </View>

        {/* General Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>General</Text>
          <View style={styles.settingsCard}>
            {settings.slice(4).map((item, index) => renderSettingItem(item, index + 4))}
          </View>
        </View>

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
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray500,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingsCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  settingItemLast: {
    borderBottomWidth: 0,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primaryLighter,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.gray900,
  },
  settingSubtitle: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },
  bottomPadding: {
    height: SPACING.xxl,
  },
});

export default SettingsScreen;
