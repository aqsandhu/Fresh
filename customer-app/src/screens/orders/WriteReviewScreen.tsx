import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { OrdersStackParamList, OrderReviewables, ReviewTargetType } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { StarRating, ErrorView } from '@components';
import { feedbackService } from '@services/feedback.service';

type Nav = NativeStackNavigationProp<OrdersStackParamList, 'WriteReview'>;
type Rt = RouteProp<OrdersStackParamList, 'WriteReview'>;

interface Row {
  key: string;
  target: ReviewTargetType;
  productId?: string;
  label: string;
  image?: string | null;
}

interface Draft {
  rating: number;
  comment: string;
}

const RATING_LABELS = ['', 'بہت خراب', 'خراب', 'ٹھیک', 'اچھا', 'بہترین'];

export const WriteReviewScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { orderId } = route.params;

  const [data, setData] = useState<OrderReviewables | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await feedbackService.getOrderReviewables(orderId);
      if (res.success) {
        setData(res.data);
        const initial: Record<string, Draft> = {};
        for (const r of res.data.reviews) {
          const key = r.targetType === 'product' ? `product:${r.productId}` : r.targetType;
          initial[key] = { rating: r.rating, comment: r.comment || '' };
        }
        setDrafts(initial);
      }
    } catch (err: any) {
      setError(err?.message || 'لوڈ نہیں ہو سکا');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows: Row[] = data
    ? [
        ...data.products.map((p) => ({
          key: `product:${p.productId}`,
          target: 'product' as ReviewTargetType,
          productId: p.productId,
          label: p.productName,
          image: p.productImage,
        })),
        {
          key: 'rider',
          target: 'rider' as ReviewTargetType,
          label: data.rider?.riderName ? `رائڈر: ${data.rider.riderName}` : 'رائڈر کا رویہ',
        },
        { key: 'service', target: 'service' as ReviewTargetType, label: 'کمپنی سروس' },
      ]
    : [];

  const setDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({
      ...prev,
      [key]: { rating: prev[key]?.rating || 0, comment: prev[key]?.comment || '', ...patch },
    }));

  // One submit for the whole order: send only the targets the user actually
  // rated (rating >= 1). Empty stars mean "not reviewed" and are skipped.
  const submitAll = async () => {
    const toSubmit = rows.filter((r) => (drafts[r.key]?.rating || 0) >= 1);
    if (toSubmit.length === 0) {
      Toast.show({ type: 'error', text1: 'کم از کم ایک چیز کو درجہ بندی دیں' });
      return;
    }
    setSubmitting(true);
    try {
      for (const r of toSubmit) {
        const d = drafts[r.key];
        await feedbackService.submitReview({
          targetType: r.target,
          orderId,
          productId: r.productId,
          rating: d.rating,
          comment: d.comment.trim() || undefined,
        });
      }
      Toast.show({ type: 'success', text1: 'شکریہ! آپ کی رائے موصول ہو گئی' });
      navigation.goBack();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message || 'رائے جمع نہیں ہو سکی' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>رائے اور درجہ بندی</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xl }} color={COLORS.primary600} />
      ) : error ? (
        <ErrorView message={error} onRetry={load} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.hint}>
              جس چیز کا چاہیں درجہ بندی دیں، باقی خالی چھوڑ دیں۔ ایک ہی بٹن سے سب جمع ہو جائے گا۔
            </Text>

            {rows.map((row) => {
              const d = drafts[row.key] || { rating: 0, comment: '' };
              return (
                <View key={row.key} style={styles.card}>
                  <View style={styles.cardHead}>
                    {row.image ? <Image source={{ uri: row.image }} style={styles.thumb} /> : null}
                    <Text style={styles.cardLabel} numberOfLines={2}>
                      {row.label}
                    </Text>
                  </View>
                  <View style={styles.starsRow}>
                    <StarRating
                      value={d.rating}
                      onChange={(rating) => setDraft(row.key, { rating })}
                      size={34}
                    />
                    {d.rating > 0 ? (
                      <Text style={styles.ratingLabel}>{RATING_LABELS[d.rating]}</Text>
                    ) : null}
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="اپنی رائے لکھیں (اختیاری)"
                    placeholderTextColor={COLORS.gray400}
                    value={d.comment}
                    onChangeText={(comment) => setDraft(row.key, { comment })}
                    multiline
                    maxLength={2000}
                    textAlign="right"
                    textAlignVertical="top"
                  />
                </View>
              );
            })}

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitDisabled]}
              onPress={submitAll}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.submitText}>رائے جمع کریں</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  content: { padding: SPACING.lg },
  hint: {
    fontSize: 13,
    color: COLORS.gray500,
    marginBottom: SPACING.md,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  thumb: { width: 44, height: 44, borderRadius: BORDER_RADIUS.md },
  cardLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.gray900,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  starsRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  ratingLabel: { fontSize: 13, fontWeight: '600', color: '#b45309', writingDirection: 'rtl' },
  input: {
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    minHeight: 64,
    color: COLORS.gray900,
    writingDirection: 'rtl',
  },
  submitBtn: {
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});

export default WriteReviewScreen;
