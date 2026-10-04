import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolateColor } from 'react-native-reanimated';
import { colors, radius, spacing, typography, shadow } from '../theme';
import { useT } from '../i18n';
import type { LocationFix } from '../types';

interface DutyCardProps {
  isOnDuty: boolean;
  isSwitching: boolean;
  isTracking: boolean;
  lastFix: LocationFix | null;
  lastSentAt: number | null;
  onToggle: () => void;
}

const TRACK_WIDTH = 116;
const THUMB = 48;

const relative = (ts: number | null, t: ReturnType<typeof useT>['t']): string => {
  if (!ts) return t('common.never');
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return t('common.justNow');
  const m = Math.floor(s / 60);
  if (m < 60) return t('common.minutesAgo', { count: m });
  return t('common.hoursAgo', { count: Math.floor(m / 60) });
};

/** The hero control on Home: on/off duty switch with live GPS status. */
const DutyCard: React.FC<DutyCardProps> = ({ isOnDuty, isSwitching, isTracking, lastFix, lastSentAt, onToggle }) => {
  const { t } = useT();
  const progress = useSharedValue(isOnDuty ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isOnDuty ? 1 : 0, { stiffness: 420, damping: 32 });
  }, [isOnDuty, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.gray300, colors.primary]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (TRACK_WIDTH - THUMB - 8) }],
  }));

  const gpsLabel = !isOnDuty
    ? t('duty.gpsOff')
    : !isTracking
      ? t('duty.gpsWaiting')
      : lastFix?.accuracy
        ? `${t('duty.gpsActive')} · ${t('duty.accuracy', { meters: Math.round(lastFix.accuracy) })}`
        : t('duty.gpsActive');

  return (
    <View style={[styles.card, isOnDuty ? styles.cardOn : styles.cardOff]}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={[styles.status, { color: isOnDuty ? colors.primaryDark : colors.gray700 }]}>
            {isSwitching ? t('duty.switching') : isOnDuty ? t('duty.on') : t('duty.off')}
          </Text>
          <Text style={styles.hint}>{isOnDuty ? t('duty.onHint') : t('duty.offHint')}</Text>
        </View>
        <TouchableOpacity
          onPress={onToggle}
          disabled={isSwitching}
          activeOpacity={0.9}
          accessibilityRole="switch"
          accessibilityState={{ checked: isOnDuty, busy: isSwitching }}
          accessibilityLabel={isOnDuty ? t('duty.goOff') : t('duty.goOn')}
          testID="duty-toggle"
        >
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.thumb, thumbStyle]}>
              {isSwitching ? (
                <ActivityIndicator size="small" color={isOnDuty ? colors.primary : colors.gray600} />
              ) : (
                <MaterialCommunityIcons name={isOnDuty ? 'power' : 'power-standby'} size={24} color={isOnDuty ? colors.primary : colors.gray600} />
              )}
            </Animated.View>
          </Animated.View>
        </TouchableOpacity>
      </View>

      <View style={styles.gpsRow}>
        <View style={[styles.dot, { backgroundColor: isOnDuty && isTracking ? colors.success : colors.gray400 }]} />
        <Text style={styles.gpsText} numberOfLines={1}>
          {gpsLabel}
        </Text>
        {isOnDuty ? (
          <Text style={styles.gpsMeta} numberOfLines={1}>
            {t('duty.lastUpdate', { when: relative(lastSentAt, t) })}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    ...shadow.card,
  },
  cardOn: { backgroundColor: colors.primaryTint, borderColor: colors.primarySoft },
  cardOff: { backgroundColor: colors.surface, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center' },
  textCol: { flex: 1, marginRight: spacing.md },
  status: { fontSize: typography.size.xxl, fontWeight: typography.weight.heavy, letterSpacing: 0.5 },
  hint: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: 4, lineHeight: typography.size.sm * 1.4 },
  track: {
    width: TRACK_WIDTH,
    height: THUMB + 8,
    borderRadius: (THUMB + 8) / 2,
    padding: 4,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  gpsText: { flex: 1, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.textSecondary },
  gpsMeta: { fontSize: typography.size.xs, color: colors.textMuted, marginLeft: spacing.sm },
});

export default DutyCard;
