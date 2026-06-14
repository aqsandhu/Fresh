import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { StarRating } from '@components/common/StarRating';
import { feedbackService } from '@services/feedback.service';

interface ProductReviewItem {
  id: string;
  rating: number;
  comment?: string | null;
  adminReply?: string | null;
  authorName?: string;
  createdAt?: string;
}

interface ProductReviewsProps {
  productId: string;
}

/** Published customer reviews for a product on its detail screen. */
export const ProductReviews: React.FC<ProductReviewsProps> = ({ productId }) => {
  const [summary, setSummary] = useState<{ average: number; count: number }>({ average: 0, count: 0 });
  const [reviews, setReviews] = useState<ProductReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await feedbackService.getProductReviews(productId);
        if (active && res.success) {
          setSummary(res.data.summary);
          setReviews(res.data.reviews as ProductReviewItem[]);
        }
      } catch {
        /* non-critical */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [productId]);

  if (loading) {
    return <ActivityIndicator style={{ paddingVertical: SPACING.md }} color={COLORS.primary600} />;
  }
  if (summary.count === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Customer Reviews</Text>
        <View style={styles.summary}>
          <StarRating value={summary.average} size={16} allowHalf />
          <Text style={styles.summaryText}>
            {summary.average.toFixed(1)} ({summary.count})
          </Text>
        </View>
      </View>

      {reviews.map((r) => (
        <View key={r.id} style={styles.review}>
          <View style={styles.reviewHead}>
            <Text style={styles.author}>{r.authorName || 'Customer'}</Text>
            <StarRating value={r.rating} size={14} />
          </View>
          {r.comment ? <Text style={styles.comment}>{r.comment}</Text> : null}
          {r.adminReply ? (
            <View style={styles.reply}>
              <Text style={styles.replyLabel}>Seller reply</Text>
              <Text style={styles.replyText}>{r.adminReply}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryText: { fontSize: 13, fontWeight: '700', color: COLORS.gray700 },
  review: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    paddingVertical: SPACING.sm,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  author: { fontSize: 14, fontWeight: '600', color: COLORS.gray800 },
  comment: { fontSize: 13, color: COLORS.gray600, marginTop: 4, lineHeight: 20 },
  reply: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
  },
  replyLabel: { fontSize: 11, fontWeight: '700', color: COLORS.primary700 },
  replyText: { fontSize: 13, color: COLORS.gray700, marginTop: 2 },
});

export default ProductReviews;
