import React from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { COLORS, SPACING } from '@utils/constants';
import { formatCurrency } from '@utils/helpers';

interface CartSummaryRowsProps {
  subtotal: number;
  deliveryCharge: number;
  total: number;
  compact?: boolean;
  deliveryLoading?: boolean;
  /** Optional coupon line — when set, a discount row is shown. */
  couponCode?: string | null;
  /** Money taken off the subtotal by the coupon (0 for free-delivery coupons). */
  couponDiscount?: number;
  /** When true, the delivery line reads "FREE (coupon)". */
  couponFreeDelivery?: boolean;
}

interface SummaryLineProps {
  label: string;
  value: string;
  labelSize: number;
  valueSize: number;
  valueStyle?: object;
  bold?: boolean;
  valuePrefix?: React.ReactNode;
}

/** Label column fixed width so amount never overlaps and clips the label. */
const SummaryLine: React.FC<SummaryLineProps> = ({
  label,
  value,
  labelSize,
  valueSize,
  valueStyle,
  bold,
  valuePrefix,
}) => (
  <View style={styles.row}>
    <View style={styles.labelCol}>
      <Text
        style={[
          styles.label,
          { fontSize: labelSize },
          bold && styles.boldLabel,
        ]}
      >
        {label}
      </Text>
    </View>
    <View style={styles.valueWrap}>
      {valuePrefix}
      <Text
        numberOfLines={1}
        style={[
          styles.value,
          { fontSize: valueSize },
          bold && styles.boldValue,
          valueStyle,
        ]}
      >
        {value}
      </Text>
    </View>
  </View>
);

export const CartSummaryRows: React.FC<CartSummaryRowsProps> = ({
  subtotal,
  deliveryCharge,
  total,
  compact = false,
  deliveryLoading = false,
  couponCode,
  couponDiscount = 0,
  couponFreeDelivery = false,
}) => {
  const freeDelivery = deliveryCharge === 0;
  const labelSize = compact ? 13 : 14;
  const valueSize = compact ? 13 : 14;
  const totalSize = compact ? 14 : 16;

  return (
    <View style={styles.wrap}>
      <SummaryLine
        label="Subtotal"
        value={formatCurrency(subtotal)}
        labelSize={labelSize}
        valueSize={valueSize}
      />
      {couponDiscount > 0 ? (
        <SummaryLine
          label={couponCode ? `Coupon (${couponCode})` : 'Coupon'}
          value={`-${formatCurrency(couponDiscount)}`}
          labelSize={labelSize}
          valueSize={valueSize}
          valueStyle={styles.freeValue}
        />
      ) : null}
      <SummaryLine
        label="Delivery"
        value={
          freeDelivery
            ? couponFreeDelivery
              ? 'FREE (coupon)'
              : 'FREE'
            : formatCurrency(deliveryCharge)
        }
        labelSize={labelSize}
        valueSize={valueSize}
        valueStyle={freeDelivery ? styles.freeValue : undefined}
        valuePrefix={
          deliveryLoading ? (
            <ActivityIndicator
              size="small"
              color={COLORS.gray400}
              style={styles.deliverySpinner}
            />
          ) : undefined
        }
      />
      <View style={styles.totalRow}>
        <SummaryLine
          label="Total"
          value={formatCurrency(total)}
          labelSize={totalSize}
          valueSize={totalSize}
          bold
        />
      </View>
    </View>
  );
};

const LABEL_COL_WIDTH = 88;

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: SPACING.sm,
  },
  labelCol: {
    width: LABEL_COL_WIDTH,
    flexShrink: 0,
    paddingRight: SPACING.sm,
  },
  label: {
    color: COLORS.gray600,
    ...(Platform.OS === 'android' ? { includeFontPadding: true } : null),
  },
  valueWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  value: {
    flexShrink: 1,
    color: COLORS.gray900,
    fontWeight: '600',
    textAlign: 'right',
  },
  deliverySpinner: { marginRight: 6 },
  boldLabel: {
    color: COLORS.gray900,
    fontWeight: '700',
  },
  boldValue: {
    fontWeight: '700',
  },
  freeValue: {
    color: COLORS.success,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingTop: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: 0,
  },
});

export default CartSummaryRows;
