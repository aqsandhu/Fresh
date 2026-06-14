import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { StarRating } from '@components/common/StarRating';
import { ReviewModal, ReviewTarget } from './ReviewModal';
import { feedbackService } from '@services/feedback.service';
import { OrderReviewables, Review } from '@app-types';

interface OrderFeedbackSectionProps {
  orderId: string;
  delivered: boolean;
  onComplaint: () => void;
}

/**
 * "Rate this order" block shown below a delivered order — lets the customer
 * rate each product, the rider, and the overall service, and open a complaint.
 */
export const OrderFeedbackSection: React.FC<OrderFeedbackSectionProps> = ({
  orderId,
  delivered,
  onComplaint,
}) => {
  const [data, setData] = useState<OrderReviewables | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTarget, setActiveTarget] = useState<ReviewTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await feedbackService.getOrderReviewables(orderId);
      if (res.success) setData(res.data);
    } catch {
      /* feedback is non-critical — silently skip on failure */
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (delivered) load();
  }, [delivered, load]);

  const findReview = (predicate: (r: Review) => boolean): Review | undefined =>
    data?.reviews.find(predicate);

  if (!delivered) return null;

  const riderReview = findReview((r) => r.targetType === 'rider');
  const serviceReview = findReview((r) => r.targetType === 'service');

  const openTarget = (target: ReviewTarget) => setActiveTarget(target);

  const renderRow = (
    key: string,
    label: string,
    target: ReviewTarget,
    existing: Review | undefined,
    image?: string | null,
    icon?: keyof typeof MaterialIcons.glyphMap
  ) => (
    <TouchableOpacity key={key} style={styles.row} onPress={() => openTarget(target)} activeOpacity={0.7}>
      {image ? (
        <Image source={{ uri: image }} style={styles.thumb} />
      ) : (
        <View style={styles.iconCircle}>
          <MaterialIcons name={icon || 'star-border'} size={20} color={COLORS.primary600} />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {existing ? (
          <View style={styles.ratedRow}>
            <StarRating value={existing.rating} size={16} />
            <Text style={styles.editHint}>تبدیل کریں</Text>
          </View>
        ) : (
          <Text style={styles.ratePrompt}>درجہ بندی کے لیے دبائیں</Text>
        )}
      </View>
      <MaterialIcons name="chevron-left" size={22} color={COLORS.gray400} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="rate-review" size={18} color={COLORS.primary700} />
        <Text style={styles.headerTitle}>اپنی رائے دیں</Text>
      </View>

      {loading && !data ? (
        <ActivityIndicator style={{ paddingVertical: SPACING.md }} color={COLORS.primary600} />
      ) : (
        <>
          {/* Products */}
          {data?.products.map((p) =>
            renderRow(
              `p-${p.productId}`,
              p.productName,
              { type: 'product', label: p.productName, productId: p.productId, image: p.productImage },
              findReview((r) => r.targetType === 'product' && r.productId === p.productId),
              p.productImage
            )
          )}

          {/* Rider */}
          {data?.rider
            ? renderRow(
                'rider',
                `رائڈر: ${data.rider.riderName || 'ڈیلیوری'}`,
                { type: 'rider', label: `رائڈر: ${data.rider.riderName || 'ڈیلیوری'}` },
                riderReview,
                null,
                'two-wheeler'
              )
            : null}

          {/* Service */}
          {renderRow(
            'service',
            'سروس / ڈیلیوری کا تجربہ',
            { type: 'service', label: 'سروس / ڈیلیوری کا تجربہ' },
            serviceReview,
            null,
            'storefront'
          )}
        </>
      )}

      <TouchableOpacity style={styles.complaintBtn} onPress={onComplaint} activeOpacity={0.8}>
        <MaterialIcons name="report-problem" size={18} color="#b91c1c" />
        <Text style={styles.complaintText}>شکایت درج کریں</Text>
      </TouchableOpacity>

      <ReviewModal
        visible={!!activeTarget}
        orderId={orderId}
        target={activeTarget}
        initialRating={
          activeTarget
            ? findReview((r) =>
                activeTarget.type === 'product'
                  ? r.targetType === 'product' && r.productId === activeTarget.productId
                  : r.targetType === activeTarget.type
              )?.rating || 0
            : 0
        }
        initialComment={
          activeTarget
            ? findReview((r) =>
                activeTarget.type === 'product'
                  ? r.targetType === 'product' && r.productId === activeTarget.productId
                  : r.targetType === activeTarget.type
              )?.comment || ''
            : ''
        }
        onClose={() => setActiveTarget(null)}
        onSubmitted={load}
      />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  thumb: { width: 40, height: 40, borderRadius: BORDER_RADIUS.md },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: COLORS.gray900, textAlign: 'right', writingDirection: 'rtl' },
  ratedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
  editHint: { fontSize: 11, color: COLORS.primary700, fontWeight: '600' },
  ratePrompt: { fontSize: 12, color: COLORS.gray500, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  complaintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  complaintText: { color: '#b91c1c', fontSize: 14, fontWeight: '700' },
});

export default OrderFeedbackSection;
