import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useTaskStore } from '../../store/taskStore';
import { useSettingsStore } from '../../store/settingsStore';
import Button from '../../components/Button';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../utils/constants';
import { getInitials, formatCurrency, getRatingColor } from '../../utils/helpers';

interface ProfileScreenProps {
  navigation: any;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { rider, logout } = useAuthStore();
  const { todayStats } = useTaskStore();
  const { language } = useSettingsStore();

  const handleLogout = () => {
    Alert.alert(
      language === 'ur' ? 'لاگ آؤٹ' : 'Logout',
      language === 'ur' ? 'کیا آپ واقعی لاگ آؤٹ کرنا چاہتے ہیں؟' : 'Are you sure you want to logout?',
      [
        { text: language === 'ur' ? 'نہیں' : 'No', style: 'cancel' },
        {
          text: language === 'ur' ? 'ہاں' : 'Yes',
          onPress: async () => {
            try {
              await logout();
            } catch (error) {
              console.error('Logout error:', error);
            }
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: 'cash',
      title: language === 'ur' ? 'میری کمائی' : 'My Earnings',
      subtitle: language === 'ur' ? 'کمائی کی تاریخ دیکھیں' : 'View earnings history',
      onPress: () => navigation.navigate('Earnings'),
      color: COLORS.success,
    },
    {
      icon: 'history',
      title: language === 'ur' ? 'ٹاسک ہسٹری' : 'Task History',
      subtitle: language === 'ur' ? 'ماضی کے کام دیکھیں' : 'View past tasks',
      onPress: () => navigation.navigate('Tasks', { screen: 'TasksList' }),
      color: COLORS.secondary,
    },
    {
      icon: 'cog',
      title: language === 'ur' ? 'ترتیبات' : 'Settings',
      subtitle: language === 'ur' ? 'ایپ کی ترتیبات تبدیل کریں' : 'Change app settings',
      onPress: () => navigation.navigate('Settings'),
      color: COLORS.gray500,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {rider?.avatar ? (
              <Image source={{ uri: rider.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {getInitials(rider?.name || 'R')}
                </Text>
              </View>
            )}
            <View
              style={[
                styles.statusIndicator,
                {
                  backgroundColor:
                    rider?.status === 'online'
                      ? COLORS.success
                      : rider?.status === 'busy'
                      ? COLORS.warning
                      : COLORS.gray400,
                },
              ]}
            />
          </View>

          <Text style={styles.riderName}>{rider?.name}</Text>
          <Text style={styles.riderPhone}>{rider?.phone}</Text>

          {/* Rating */}
          <View style={styles.ratingContainer}>
            <MaterialCommunityIcons name="star" size={18} color={COLORS.accent} />
            <Text
              style={[
                styles.ratingText,
                { color: getRatingColor(rider?.rating || 0) },
              ]}
            >
              {rider?.rating?.toFixed(1) || '0.0'}
            </Text>
          </View>

          {/* Vehicle Info */}
          {rider?.vehicleType && (
            <View style={styles.vehicleInfo}>
              <MaterialCommunityIcons
                name={
                  rider.vehicleType === 'bike'
                    ? 'motorbike'
                    : rider.vehicleType === 'cycle'
                    ? 'bicycle'
                    : 'truck'
                }
                size={16}
                color={COLORS.textSecondary}
              />
              <Text style={styles.vehicleText}>
                {rider.vehicleType.charAt(0).toUpperCase() + rider.vehicleType.slice(1)}
                {rider.vehicleNumber && ` - ${rider.vehicleNumber}`}
              </Text>
            </View>
          )}
        </View>

        {/* Stats Section */}
        <View style={styles.statsSection}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{todayStats?.totalDeliveries || 0}</Text>
            <Text style={styles.statLabel}>
              {language === 'ur' ? 'آج کی ڈیلیوریز' : "Today's Deliveries"}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {formatCurrency(todayStats?.totalEarnings || 0)}
            </Text>
            <Text style={styles.statLabel}>
              {language === 'ur' ? 'آج کی کمائی' : "Today's Earnings"}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{rider?.totalDeliveries || 0}</Text>
            <Text style={styles.statLabel}>
              {language === 'ur' ? 'کل ڈیلیوریز' : 'Total Deliveries'}
            </Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.menuIconContainer,
                  { backgroundColor: `${item.color}15` },
                ]}
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={24}
                  color={item.color}
                />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={COLORS.gray400}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        <View style={styles.logoutSection}>
          <Button
            title={language === 'ur' ? 'لاگ آؤٹ' : 'Logout'}
            onPress={handleLogout}
            variant="danger"
            size="large"
            fullWidth
            icon="logout"
          />
        </View>

        {/* App Version */}
        <Text style={styles.versionText}>Rider App v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

// Need to import Image
import { Image } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },
  profileHeader: {
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.card,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: BORDER_RADIUS.full,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '700',
    color: COLORS.white,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 3,
    borderColor: COLORS.card,
  },
  riderName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  riderPhone: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    backgroundColor: COLORS.gray50,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  ratingText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    marginLeft: SPACING.xs,
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  vehicleText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  menuSection: {
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  menuTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  menuSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  logoutSection: {
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.md,
  },
  versionText: {
    textAlign: 'center',
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.xl,
  },
});

export default ProfileScreen;
