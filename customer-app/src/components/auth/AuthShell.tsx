import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { BrandLogo } from '@components/BrandLogo';

interface AuthShellProps {
  title: string;
  subtitle?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Compact mobile auth card — matches website (auth) mobile layout. */
export const AuthShell: React.FC<AuthShellProps> = ({
  title,
  subtitle,
  compact,
  children,
  footer,
}) => (
  <View style={[styles.card, compact && styles.cardCompact]}>
    <View style={[styles.logoWrap, compact && styles.logoWrapCompact]}>
      <BrandLogo height={compact ? 44 : 56} />
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{subtitle}</Text>
      ) : null}
    </View>
    {children}
    {footer}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    padding: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardCompact: {
    padding: SPACING.md,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logoWrapCompact: {
    marginBottom: SPACING.md,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary600,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  logoBoxCompact: {
    width: 44,
    height: 44,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.gray900,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 18,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: SPACING.xs,
    lineHeight: 18,
  },
  subtitleCompact: {
    fontSize: 12,
  },
});

export default AuthShell;
