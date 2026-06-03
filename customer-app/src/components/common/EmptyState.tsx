import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '@utils/constants';
import Button from './Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  actionTitle?: string;
  onAction?: () => void;
  secondaryActionTitle?: string;
  onSecondaryAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'shopping-basket',
  title,
  message,
  actionTitle,
  onAction,
  secondaryActionTitle,
  onSecondaryAction,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <MaterialIcons name={icon as any} size={40} color={COLORS.primary500} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {actionTitle && onAction && (
        <Button
          title={actionTitle}
          onPress={onAction}
          style={styles.actionButton}
        />
      )}
      {secondaryActionTitle && onSecondaryAction && (
        <Button
          title={secondaryActionTitle}
          variant="outline"
          onPress={onSecondaryAction}
          style={styles.secondaryButton}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.gray900,
    marginTop: SPACING.lg,
  },
  message: {
    fontSize: 14,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
    maxWidth: 280,
  },
  actionButton: {
    minWidth: 180,
  },
  secondaryButton: {
    minWidth: 180,
    marginTop: SPACING.sm,
  },
});

export default EmptyState;
