import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Task } from '../types';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../utils/constants';
import { getTaskTypeLabel, getTaskStatusLabel, formatTime, formatDistance } from '../utils/helpers';
import { useSettingsStore } from '../store/settingsStore';

interface TaskCardProps {
  task: Task;
  onPress?: (task: Task) => void;
  showActions?: boolean;
  compact?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onPress,
  showActions = true,
  compact = false,
}) => {
  const { language } = useSettingsStore();

  // Get icon based on task type
  const getTaskIcon = () => {
    switch (task.type) {
      case 'delivery':
        return 'truck-delivery';
      case 'pickup':
        return 'package-variant';
      case 'atta_pickup':
        return 'grain';
      case 'atta_delivery':
        return 'home-variant';
      default:
        return 'package';
    }
  };

  // Get color based on task type
  const getTaskColor = () => {
    switch (task.type) {
      case 'delivery':
        return COLORS.primary;
      case 'pickup':
        return COLORS.secondary;
      case 'atta_pickup':
        return COLORS.accent;
      case 'atta_delivery':
        return '#8B5CF6';
      default:
        return COLORS.gray500;
    }
  };

  // Get status color
  const getStatusColor = () => {
    switch (task.status) {
      case 'pending':
        return COLORS.warning;
      case 'assigned':
        return COLORS.secondary;
      case 'picked_up':
        return '#8B5CF6';
      case 'in_transit':
        return COLORS.primary;
      case 'delivered':
        return COLORS.success;
      case 'cancelled':
        return COLORS.danger;
      default:
        return COLORS.gray500;
    }
  };

  const taskColor = getTaskColor();
  const statusColor = getStatusColor();

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactContainer, { borderLeftColor: taskColor }]}
        onPress={() => onPress?.(task)}
        activeOpacity={0.8}
      >
        <View style={styles.compactHeader}>
          <View style={[styles.iconContainer, { backgroundColor: `${taskColor}20` }]}>
            <MaterialCommunityIcons name={getTaskIcon()} size={20} color={taskColor} />
          </View>
          <View style={styles.compactInfo}>
            <Text style={styles.compactOrderId}>
              #{task.orderId || task.attaRequestId}
            </Text>
            <Text style={styles.compactAddress} numberOfLines={1}>
              {task.customerAddress}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.gray400} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress?.(task)}
      activeOpacity={0.8}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.typeContainer}>
          <View style={[styles.iconContainer, { backgroundColor: `${taskColor}20` }]}>
            <MaterialCommunityIcons name={getTaskIcon()} size={24} color={taskColor} />
          </View>
          <View>
            <Text style={[styles.typeText, { color: taskColor }]}>
              {getTaskTypeLabel(task.type, language)}
            </Text>
            <Text style={styles.orderId}>
              #{task.orderId || task.attaRequestId}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {getTaskStatusLabel(task.status, language)}
          </Text>
        </View>
      </View>

      {/* Address */}
      <View style={styles.addressSection}>
        <MaterialCommunityIcons name="map-marker" size={18} color={COLORS.danger} />
        <View style={styles.addressContent}>
          <Text style={styles.addressText} numberOfLines={2}>
            {task.customerAddress}
          </Text>
          {task.houseNumber && (
            <View style={styles.houseNumberContainer}>
              <MaterialCommunityIcons name="home" size={14} color={COLORS.gray500} />
              <Text style={styles.houseNumberText}>
                House #{task.houseNumber}
              </Text>
            </View>
          )}
          {task.landmark && (
            <Text style={styles.landmarkText}>
              Near: {task.landmark}
            </Text>
          )}
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <MaterialCommunityIcons name="clock-outline" size={16} color={COLORS.gray500} />
          <Text style={styles.footerText}>{task.timeWindow}</Text>
        </View>
        {task.distance && (
          <View style={styles.footerItem}>
            <MaterialCommunityIcons name="map-marker-distance" size={16} color={COLORS.gray500} />
            <Text style={styles.footerText}>{formatDistance(parseFloat(task.distance))}</Text>
          </View>
        )}
        {task.estimatedTime && (
          <View style={styles.footerItem}>
            <MaterialCommunityIcons name="timer-outline" size={16} color={COLORS.gray500} />
            <Text style={styles.footerText}>{task.estimatedTime}</Text>
          </View>
        )}
      </View>

      {/* Special Instructions */}
      {task.specialInstructions && (
        <View style={styles.instructionsContainer}>
          <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.accent} />
          <Text style={styles.instructionsText} numberOfLines={2}>
            {task.specialInstructions}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  compactContainer: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.xs,
    borderLeftWidth: 4,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  typeText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  orderId: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  addressSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  addressContent: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  addressText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  houseNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  houseNumberText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  landmarkText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  instructionsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: `${COLORS.accent}10`,
    borderRadius: BORDER_RADIUS.md,
  },
  instructionsText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  compactOrderId: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  compactAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});

export default TaskCard;
