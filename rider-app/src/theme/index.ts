/**
 * Fresh Bazar Rider — design tokens.
 *
 * Single source of truth for colour, spacing, radius, typography and shadow.
 * The rider works outdoors on a phone mounted to a bike: contrast is high,
 * touch targets are large (≥ 48 dp) and the primary actions are unmistakable.
 *
 * Brand green matches the customer app / website primary scale.
 */

export const colors = {
  // Brand
  primary: '#10B981',
  primaryDark: '#059669',
  primaryDarker: '#047857',
  primaryLight: '#34D399',
  primarySoft: '#D1FAE5',
  primaryTint: '#ECFDF5',

  // Semantic
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  purple: '#7C3AED',
  purpleSoft: '#EDE9FE',

  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  // Surfaces
  background: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F9FAFB',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  overlay: 'rgba(17, 24, 39, 0.55)',

  // Text
  text: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  textInverse: '#FFFFFF',

  // Navigation chrome
  tabBar: '#111827',
  tabInactive: '#9CA3AF',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    display: 32,
    hero: 40,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
  lineHeight: {
    tight: 1.15,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const;

export const shadow = {
  card: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  raised: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

/** Minimum touch target (Material / Apple HIG) */
export const TOUCH_TARGET = 48;
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export type ThemeColor = keyof typeof colors;

/** Status → tone mapping used by badges, cards and the bottom action bar. */
export type Tone = 'neutral' | 'info' | 'primary' | 'success' | 'warning' | 'danger' | 'purple';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.gray700, bg: colors.gray100 },
  info: { fg: colors.info, bg: colors.infoSoft },
  primary: { fg: colors.primaryDark, bg: colors.primarySoft },
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: '#B45309', bg: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  purple: { fg: colors.purple, bg: colors.purpleSoft },
};

const theme = { colors, spacing, radius, typography, shadow, toneColors };
export default theme;
