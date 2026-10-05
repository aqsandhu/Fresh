import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Task, taskReference, GeoPoint } from '../types';
import { colors, spacing, typography, radius } from '../theme';
import { formatCurrency, formatSlotRange, formatDate, haversineMeters, formatDistance, formatDateTime } from '../utils/helpers';
import { useT, tEnum } from '../i18n';
import { Card, Badge } from './ui';
import { taskStatusTone, taskStatusIcon, taskTypeIcon, taskTypeColor, isAttaTask } from '../utils/taskMeta';

interface TaskCardProps {
  task: Task;
  onPress?: (task: Task) => void;
  /** Rider's last known position — enables the straight-line distance chip. */
  riderPoint?: GeoPoint | null;
  compact?: boolean;
  testID?: string;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onPress, riderPoint, compact = false, testID }) => {
  const { t, language } = useT();
  const accent = taskTypeColor[task.type];
  const atta = isAttaTask(task);

  const distance = useMemo(() => {
    if (!riderPoint || !task.location) return null;
    return haversineMeters(riderPoint, task.location);
  }, [riderPoint, task.location]);

  const schedule = task.isUrgent
    ? t('detail.urgentEta', { eta: task.urgentEta || '—' })
    : [task.requestedDate ? formatDate(task.requestedDate) : '', task.timeSlotName || formatSlotRange(task.slotStart, task.slotEnd)]
        .filter(Boolean)
        .join(' · ');

  const reference = `${t(atta ? 'tasks.request' : 'tasks.order')} #${taskReference(task)}`;

  return (
    <Card onPress={onPress ? () => onPress(task) : undefined} accent={accent} style={styles.card} testID={testID}>
      {/* Header: type + reference | status */}
      <View style={styles.header}>
        <View style={[styles.typeIcon, { backgroundColor: `${accent}22` }]}>
          <MaterialCommunityIcons name={taskTypeIcon[task.type]} size={22} color={accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.reference} numberOfLines={1}>
            {reference}
          </Text>
          <Text style={styles.typeLabel} numberOfLines={1}>
            {tEnum(language, 'taskType', task.type)}
            {task.isUrgent ? <Text style={styles.urgent}>  •  {t('tasks.urgent')}</Text> : null}
          </Text>
        </View>
        <Badge label={tEnum(language, 'taskStatus', task.status)} tone={taskStatusTone[task.status]} icon={taskStatusIcon[task.status]} />
      </View>

      {/* Address */}
      <View style={styles.addressRow}>
        <MaterialCommunityIcons name="map-marker" size={20} color={colors.danger} style={styles.addressIcon} />
        <View style={styles.addressBody}>
          <Text style={styles.address} numberOfLines={compact ? 1 : 2}>
            {task.address || '—'}
          </Text>
          {!compact && (task.houseNumber || task.landmark) ? (
            <Text style={styles.addressMeta} numberOfLines={1}>
              {[task.houseNumber ? `${t('tasks.house')} ${task.houseNumber}` : null, task.landmark ? `${t('tasks.near')} ${task.landmark}` : null]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>
          ) : null}
        </View>
        {task.houseNumber ? (
          <View style={styles.housePill}>
            <Text style={styles.housePillLabel}>{t('tasks.house')}</Text>
            <Text style={styles.housePillValue} numberOfLines={1} adjustsFontSizeToFit>
              {task.houseNumber}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Footer chips */}
      <View style={styles.footer}>
        {schedule ? (
          <View style={styles.chip}>
            <MaterialCommunityIcons name={task.isUrgent ? 'lightning-bolt' : 'clock-outline'} size={14} color={task.isUrgent ? colors.danger : colors.gray500} />
            <Text style={[styles.chipText, task.isUrgent && { color: colors.danger, fontWeight: typography.weight.bold }]} numberOfLines={1}>
              {schedule}
            </Text>
          </View>
        ) : null}
        {distance !== null ? (
          <View style={styles.chip}>
            <MaterialCommunityIcons name="map-marker-distance" size={14} color={colors.gray500} />
            <Text style={styles.chipText}>~{formatDistance(distance)}</Text>
          </View>
        ) : null}
        {atta && task.wheatKg ? (
          <View style={styles.chip}>
            <MaterialCommunityIcons name="weight-kilogram" size={14} color={colors.gray500} />
            <Text style={styles.chipText}>{t('tasks.wheat', { kg: task.wheatKg })}</Text>
          </View>
        ) : null}
        {task.status === 'completed' && task.completedAt ? (
          <View style={styles.chip}>
            <MaterialCommunityIcons name="check" size={14} color={colors.gray500} />
            <Text style={styles.chipText}>{formatDateTime(task.completedAt)}</Text>
          </View>
        ) : null}
        <View style={styles.spacer} />
        {task.codAmount !== null && task.codAmount > 0 ? (
          <View style={[styles.cod, task.status === 'completed' && styles.codDone]}>
            <MaterialCommunityIcons name="cash" size={16} color={task.status === 'completed' ? colors.gray600 : colors.warningSoft} />
            <Text style={[styles.codText, task.status === 'completed' && styles.codTextDone]}>
              {task.status === 'completed' ? formatCurrency(task.codAmount) : t('tasks.collect', { amount: formatCurrency(task.codAmount) })}
            </Text>
          </View>
        ) : task.paymentMethod && task.totalAmount ? (
          <View style={[styles.cod, styles.codDone]}>
            <MaterialCommunityIcons name="check-circle-outline" size={16} color={colors.success} />
            <Text style={[styles.codText, styles.codTextDone]}>{t('tasks.paid')}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerText: { flex: 1, marginRight: spacing.sm },
  reference: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.text },
  typeLabel: { fontSize: typography.size.sm, color: colors.textMuted, marginTop: 1 },
  urgent: { color: colors.danger, fontWeight: typography.weight.bold },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start' },
  addressIcon: { marginTop: 1, marginRight: spacing.sm },
  addressBody: { flex: 1 },
  address: { fontSize: typography.size.md, color: colors.text, lineHeight: typography.size.md * 1.35 },
  addressMeta: { fontSize: typography.size.sm, color: colors.textMuted, marginTop: 2 },
  housePill: {
    marginLeft: spacing.sm,
    minWidth: 56,
    maxWidth: 96,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.gray900,
    alignItems: 'center',
  },
  housePillLabel: { fontSize: 9, color: colors.gray400, textTransform: 'uppercase', letterSpacing: 0.6 },
  housePillValue: { fontSize: typography.size.lg, fontWeight: typography.weight.heavy, color: colors.white },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '70%' },
  chipText: { fontSize: typography.size.sm, color: colors.textSecondary },
  spacer: { flex: 1 },
  cod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gray900,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  codDone: { backgroundColor: colors.gray100 },
  codText: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.white },
  codTextDone: { color: colors.gray700 },
});

export default TaskCard;
