import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Linking, AppState } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore } from '../../store/settingsStore';
import { useT, SUPPORTED_LANGUAGES } from '../../i18n';
import { notificationService } from '../../services/notification.service';
import { hasForegroundPermission, hasBackgroundPermission } from '../../services/location.service';
import { ScreenHeader, Card, SectionTitle, Badge } from '../../components/ui';
import Button from '../../components/Button';
import { colors, radius, spacing, typography, TOUCH_TARGET } from '../../theme';
import { APP_VERSION } from '../../utils/constants';

const SettingsScreen: React.FC = () => {
  const { t, language } = useT();
  const navigation = useNavigation();
  const { notificationsEnabled, soundEnabled, vibrationEnabled, setLanguage, toggleNotifications, toggleSound, toggleVibration, resetSettings } = useSettingsStore();
  const [locPerm, setLocPerm] = useState<'always' | 'foreground' | 'denied' | null>(null);
  const [notifPerm, setNotifPerm] = useState<boolean | null>(null);

  const refreshPermissions = useCallback(async () => {
    const [fg, bg, notif] = await Promise.all([hasForegroundPermission(), hasBackgroundPermission(), notificationService.hasPermission()]);
    setLocPerm(bg ? 'always' : fg ? 'foreground' : 'denied');
    setNotifPerm(notif);
  }, []);

  useEffect(() => {
    refreshPermissions();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshPermissions();
    });
    return () => sub.remove();
  }, [refreshPermissions]);

  const onSound = () => {
    toggleSound();
    notificationService.refreshChannels();
  };
  const onVibration = () => {
    toggleVibration();
    notificationService.refreshChannels();
  };

  const handleReset = () => {
    Alert.alert(t('settings.resetTitle'), t('settings.resetBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.reset'), style: 'destructive', onPress: resetSettings },
    ]);
  };

  const openSettings = () => Linking.openSettings().catch(() => {});

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('settings.title')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionTitle title={t('settings.preferences')} />
        <Card padded={false}>
          <View style={[styles.row, styles.rowBorder]}>
            <Icon name="translate" />
            <View style={styles.flex}>
              <Text style={styles.title}>{t('settings.language')}</Text>
              <Text style={styles.subtitle}>{t('settings.languageHint')}</Text>
            </View>
            <View style={styles.langGroup}>
              {SUPPORTED_LANGUAGES.map((l) => (
                <TouchableOpacity key={l.code} style={[styles.langChip, language === l.code && styles.langChipOn]} onPress={() => setLanguage(l.code)} accessibilityRole="radio" accessibilityState={{ selected: language === l.code }}>
                  <Text style={[styles.langText, language === l.code && styles.langTextOn]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <ToggleRow icon="bell-outline" title={t('settings.notifications')} subtitle={t('settings.notificationsHint')} value={notificationsEnabled} onToggle={toggleNotifications} border />
          <ToggleRow icon="volume-high" title={t('settings.sound')} subtitle={t('settings.soundHint')} value={soundEnabled} onToggle={onSound} border disabled={!notificationsEnabled} />
          <ToggleRow icon="vibrate" title={t('settings.vibration')} subtitle={t('settings.vibrationHint')} value={vibrationEnabled} onToggle={onVibration} disabled={!notificationsEnabled} />
        </Card>

        <SectionTitle title={t('settings.permissions')} style={styles.sectionGap} />
        <Card padded={false}>
          <View style={[styles.row, styles.rowBorder]}>
            <Icon name="map-marker-outline" />
            <View style={styles.flex}>
              <Text style={styles.title}>{t('settings.location')}</Text>
              <Text style={styles.subtitle}>{locPerm === 'always' ? t('settings.locationAlways') : locPerm === 'foreground' ? t('settings.locationGranted') : t('settings.locationDenied')}</Text>
            </View>
            <Badge label={locPerm === 'denied' ? t('settings.denied') : t('settings.granted')} tone={locPerm === 'always' ? 'success' : locPerm === 'foreground' ? 'warning' : 'danger'} />
          </View>
          <View style={styles.row}>
            <Icon name="bell-ring-outline" />
            <View style={styles.flex}>
              <Text style={styles.title}>{t('settings.notifPermission')}</Text>
              <Text style={styles.subtitle}>{notifPerm ? t('settings.granted') : t('settings.denied')}</Text>
            </View>
            <Badge label={notifPerm ? t('settings.granted') : t('settings.denied')} tone={notifPerm ? 'success' : 'danger'} />
          </View>
          <View style={styles.settingsBtn}>
            <Button title={t('common.openSettings')} icon="open-in-new" variant="outline" size="small" onPress={openSettings} />
          </View>
        </Card>

        <SectionTitle title={t('settings.about')} style={styles.sectionGap} />
        <Card>
          <Text style={styles.about}>Fresh Bazar Rider</Text>
          <Text style={styles.subtitle}>{t('common.version', { version: APP_VERSION })}</Text>
        </Card>

        <Button title={t('settings.reset')} icon="restore" variant="ghost" onPress={handleReset} style={styles.reset} />
      </ScrollView>
    </View>
  );
};

const Icon: React.FC<{ name: keyof typeof MaterialCommunityIcons.glyphMap }> = ({ name }) => (
  <View style={styles.icon}>
    <MaterialCommunityIcons name={name} size={22} color={colors.primaryDark} />
  </View>
);

const ToggleRow: React.FC<{ icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; subtitle: string; value: boolean; onToggle: () => void; border?: boolean; disabled?: boolean }> = ({ icon, title, subtitle, value, onToggle, border, disabled }) => (
  <View style={[styles.row, border && styles.rowBorder, disabled && { opacity: 0.5 }]}>
    <Icon name={icon} />
    <View style={styles.flex}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
    <Switch value={value} onValueChange={onToggle} disabled={disabled} trackColor={{ false: colors.gray300, true: colors.primarySoft }} thumbColor={value ? colors.primary : colors.gray100} accessibilityLabel={title} />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionGap: { marginTop: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, minHeight: TOUCH_TARGET + 16 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  subtitle: { fontSize: typography.size.sm, color: colors.textMuted, marginTop: 2 },
  langGroup: { flexDirection: 'row', backgroundColor: colors.gray200, borderRadius: radius.pill, padding: 3 },
  langChip: { paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  langChipOn: { backgroundColor: colors.gray900 },
  langText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.textSecondary },
  langTextOn: { color: colors.white },
  settingsBtn: { padding: spacing.lg, paddingTop: 0, alignItems: 'flex-start' },
  about: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  reset: { marginTop: spacing.xl, alignSelf: 'center' },
});

export default SettingsScreen;
