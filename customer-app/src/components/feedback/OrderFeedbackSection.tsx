import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { StarRating } from '@components/common/StarRating';
import { feedbackService } from '@services/feedback.service';
import { OrderReviewables } from '@app-types';

interface OrderFeedbackSectionProps {
  orderId: string;
  delivered: boolean;
  onReview: () => void;
  onComplaint: () => void;
}

const TARGET_LABEL: Record<string, string> = {
  product: 'پروڈکٹ',
  rider: 'رائڈر',
  service: 'سروس',
};

/**
 * "Rate this order" block shown below a delivered order. Tapping "Rate &
 * Review" opens a single form (one submit for products + rider + service); a
 * compact summary of already-submitted ratings is shown inline.
 */
export const OrderFeedbackSection: React.FC<OrderFeedbackSectionProps> = ({
  orderId,
  delivered,
  onReview,
  onComplaint,
}) => {
  const [data, setData] = useState<OrderReviewables | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await feedbackService.getOrderReviewables(orderId);
      if (res.success) setData(res.data);
    } catch {
      /* feedback is non-critical */
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (delivered) load();
  }, [delivered, load]);

  if (!delivered) return null;

  const reviews = data?.reviews ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="rate-review" size={18} color={COLORS.primary700} />
        <Text style={styles.headerTitle}>اپنی رائے دیں</Text>
      </View>

      {loading && !data ? (
        <ActivityIndicator style={{ paddingVertical: SPACING.sm }} color={COLORS.primary600} />
      ) : reviews.length > 0 ? (
        <View style={styles.summary}>
          {reviews.map((r) => (
            <View key={r.id} style={styles.summaryRow}>
              <StarRating value={r.rating} size={14} />
              <Text style={styles.summaryLabel}>
                {r.targetType === 'product'
                  ? r.productName || TARGET_LABEL.product
                  : TARGET_LABEL[r.targetType]}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.prompt}>پروڈکٹ، رائڈر اور سروس کو درجہ بندی دیں۔</Text>
      )}

      <TouchableOpacity style={styles.reviewBtn} onPress={onReview} activeOpacity={0.85}>
        <MaterialIcons name="star" size={18} color={COLORS.white} />
        <Text style={styles.reviewText}>
          {reviews.length > 0 ? 'رائے میں تبدیلی کریں' : 'رائے اور درجہ بندی دیں'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.complaintBtn} onPress={onComplaint} activeOpacity={0.85}>
        <MaterialIcons name="report-problem" size={18} color="#b91c1c" />
        <Text style={styles.complaintText}>شکایت درج کریں</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  headerTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray900, writingDirection: 'rtl' },
  prompt: {
    fontSize: 13,
    color: COLORS.gray500,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: SPACING.sm,
  },
  summary: { marginBottom: SPACING.sm, gap: 6 },
  summaryRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  summaryLabel: { fontSize: 13, color: COLORS.gray700, writingDirection: 'rtl' },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary600,
    marginBottom: SPACING.sm,
  },
  reviewText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  complaintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  complaintText: { color: '#b91c1c', fontSize: 14, fontWeight: '700' },
});

export default OrderFeedbackSection;
