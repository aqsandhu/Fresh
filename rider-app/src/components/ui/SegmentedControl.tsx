import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { colors, radius, spacing, typography, TOUCH_TARGET } from '../../theme';

export interface Segment<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

function SegmentedControl<T extends string>({ segments, value, onChange, style }: SegmentedControlProps<T>) {
  return (
    <View style={[styles.container, style]} accessibilityRole="tablist">
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <TouchableOpacity
            key={segment.value}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            activeOpacity={0.85}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{segment.label}</Text>
            {typeof segment.count === 'number' && segment.count > 0 ? (
              <View style={[styles.count, active && styles.countActive]}>
                <Text style={[styles.countText, active && styles.countTextActive]}>{segment.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.gray200,
    borderRadius: radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: TOUCH_TARGET - 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 2,
    gap: spacing.xs,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
  },
  labelActive: { color: colors.text },
  count: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countActive: { backgroundColor: colors.primary },
  countText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.gray700,
  },
  countTextActive: { color: colors.white },
});

export default SegmentedControl;
