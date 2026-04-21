import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettingsStore } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../utils/constants';
import { getTranslation } from '../../utils/helpers';

interface SettingsScreenProps {
  navigation: any;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const {
    language,
    notificationsEnabled,
    soundEnabled,
    vibrationEnabled,
    autoAcceptTasks,
    darkMode,
    setLanguage,
    toggleNotifications,
    toggleSound,
    toggleVibration,
    toggleAutoAcceptTasks,
    toggleDarkMode,
    resetSettings,
  } = useSettingsStore();

  const { rider } = useAuthStore();

  // Handle language change
  const handleLanguageChange = () => {
    Alert.alert(
      language === 'ur' ? 'زبان منتخب کریں' : 'Select Language',
      '',
      [
        {
          text: 'English',
          onPress: () => setLanguage('en'),
          style: language === 'en' ? 'default' : 'cancel',
        },
        {
          text: 'اردو',
          onPress: () => setLanguage('ur'),
          style: language === 'ur' ? 'default' : 'cancel',
        },
        {
          text: language === 'ur' ? 'منسوخ' : 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  // Handle reset settings
  const handleResetSettings = () => {
    Alert.alert(
      language === 'ur' ? 'ترتیبات ری سیٹ کریں' : 'Reset Settings',
      language === 'ur'
        ? 'کیا آپ تمام ترتیبات دوبارہ سیٹ کرنا چاہتے ہیں؟'
        : 'Are you sure you want to reset all settings?',
      [
        { text: language === 'ur' ? 'نہیں' : 'No', style: 'cancel' },
        {
          text: language === 'ur' ? 'ہاں' : 'Yes',
          onPress: resetSettings,
          style: 'destructive',
        },
      ]
    );
  };

  // Handle contact support
  const handleContactSupport = () => {
    Linking.openURL('tel:+923001234567');
  };

  // Toggle item component
  const ToggleItem = ({
    icon,
    title,
    subtitle,
    value,
    onToggle,
    color = COLORS.primary,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    value: boolean;
    onToggle: () => void;
    color?: string;
  }) => (
    <View style={styles.settingItem}>
      <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.gray300, true: `${color}50` }}
        thumbColor={value ? color : COLORS.gray500}
      />
    </View>
  );

  // Action item component
  const ActionItem = ({
    icon,
    title,
    subtitle,
    onPress,
    color = COLORS.primary,
    value,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress: () => void;
    color?: string;
    value?: string;
  }) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.valueContainer}>
        {value && <Text style={styles.valueText}>{value}</Text>}
        <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.gray400} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <MaterialCommunityIcons
          name="arrow-left"
          size={24}
          color={COLORS.textPrimary}
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerTitle}>
          {getTranslation('settings', language)}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'ur' ? 'ترجیحات' : 'Preferences'}
          </Text>

          <ActionItem
            icon="translate"
            title={getTranslation('language', language)}
            subtitle={language === 'ur' ? 'ایپ کی زبان' : 'App language'}
            value={language === 'ur' ? 'اردو' : 'English'}
            onPress={handleLanguageChange}
            color={COLORS.secondary}
          />

          <ToggleItem
            icon="bell-outline"
            title={getTranslation('notifications', language)}
            subtitle={language === 'ur' ? 'اطلاعات وصول کریں' : 'Receive notifications'}
            value={notificationsEnabled}
            onToggle={toggleNotifications}
            color={COLORS.accent}
          />

          <ToggleItem
            icon="volume-high"
            title={language === 'ur' ? 'آواز' : 'Sound'}
            subtitle={language === 'ur' ? 'اطلاعات کی آواز' : 'Notification sounds'}
            value={soundEnabled}
            onToggle={toggleSound}
            color={COLORS.primary}
          />

          <ToggleItem
            icon="vibrate"
            title={language === 'ur' ? 'وائبریشن' : 'Vibration'}
            subtitle={language === 'ur' ? 'وائبریشن الرٹس' : 'Vibration alerts'}
            value={vibrationEnabled}
            onToggle={toggleVibration}
            color={COLORS.secondary}
          />
        </View>

        {/* Task Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'ur' ? 'ٹاسک کی ترتیبات' : 'Task Settings'}
          </Text>

          <ToggleItem
            icon="auto-fix"
            title={language === 'ur' ? 'خودکار قبولیت' : 'Auto Accept'}
            subtitle={
              language === 'ur'
                ? 'کام خودکار طور پر قبول کریں'
                : 'Automatically accept tasks'
            }
            value={autoAcceptTasks}
            onToggle={toggleAutoAcceptTasks}
            color={COLORS.success}
          />
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'ur' ? 'ظاہری شکل' : 'Appearance'}
          </Text>

          <ToggleItem
            icon="theme-light-dark"
            title={language === 'ur' ? 'ڈارک موڈ' : 'Dark Mode'}
            subtitle={language === 'ur' ? 'گہرا تھیم استعمال کریں' : 'Use dark theme'}
            value={darkMode}
            onToggle={toggleDarkMode}
            color={COLORS.gray700}
          />
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'ur' ? 'مدد' : 'Support'}
          </Text>

          <ActionItem
            icon="headset"
            title={language === 'ur' ? 'رابطہ کریں' : 'Contact Support'}
            subtitle={language === 'ur' ? 'ہماری ٹیم سے رابطہ کریں' : 'Reach out to our team'}
            onPress={handleContactSupport}
            color={COLORS.info}
          />

          <ActionItem
            icon="information"
            title={language === 'ur' ? 'ایپ کے بارے میں' : 'About App'}
            subtitle="Rider App v1.0.0"
            onPress={() => {}}
            color={COLORS.gray500}
          />
        </View>

        {/* Reset Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetSettings}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="restore" size={20} color={COLORS.danger} />
            <Text style={styles.resetText}>
              {language === 'ur' ? 'ترتیبات ری سیٹ کریں' : 'Reset Settings'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  scrollContent: {
    paddingVertical: SPACING.md,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  settingTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  settingSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    marginRight: SPACING.xs,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${COLORS.danger}10`,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  resetText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.danger,
  },
});

export default SettingsScreen;
