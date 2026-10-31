import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useT } from '../../i18n';
import { taskService } from '../../services/task.service';
import { getApiErrorMessage } from '../../services/api';
import { ScreenHeader, Card, EmptyState, Banner } from '../../components/ui';
import { colors, spacing, typography, radius } from '../../theme';
import { formatDateTime } from '../../utils/helpers';
import type { RiderReviews, RiderReview } from '../../types';

/** Customer reviews of this rider (published only; customers shown by first name). */
const ReviewsScreen: React.FC = () => {
  const { t } = useT();
  const navigation = useNavigation();
  const [data, setData] = useState<RiderReviews | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await taskService.getReviews());
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = ({ item }: { item: RiderReview }) => (
    <Card style={styles.review}>
      <View style={styles.row}>
        <Stars value={item.rating} />
        <Text style={styles.meta}>{formatDateTime(item.createdAt)}</Text>
      </View>
      {item.comment ? <Text style={styles.comment}>{item.comment}</Text> : null}
      <Text style={styles.meta}>
        {item.customerFirstName ? `— ${item.customerFirstName}` : ''}
        {item.orderNumber ? `  ·  ${t('reviews.order', { number: item.orderNumber })}` : ''}
      </Text>
      {item.adminReply ? <Text style={styles.reply}>{t('reviews.officeReply', { reply: item.adminReply })}</Text> : null}
    </Card>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('reviews.title')} onBack={() => navigation.goBack()} />
      {error ? <Banner tone="warning" icon="alert-circle-outline" message={error} actionLabel={t('common.retry')} onAction={load} style={{ margin: spacing.lg }} /> : null}
      <FlatList
        data={data?.reviews || []}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          data && data.ratingCount > 0 ? (
            <Card style={styles.summary}>
              <MaterialCommunityIcons name="star" size={36} color={colors.warning} />
              <View>
                <Text style={styles.summaryValue}>{(data.rating ?? 0).toFixed(1)}</Text>
                <Text style={styles.meta}>{t('reviews.summary', { rating: (data.rating ?? 0).toFixed(1), count: data.ratingCount })}</Text>
              </View>
            </Card>
          ) : null
        }
        ListEmptyComponent={data ? <EmptyState compact icon="star-outline" title={t('reviews.title')} body={t('reviews.empty')} /> : null}
      />
    </View>
  );
};

const Stars: React.FC<{ value: number }> = ({ value }) => (
  <View style={styles.stars}>
    {[1, 2, 3, 4, 5].map((n) => (
      <MaterialCommunityIcons key={n} name={n <= value ? 'star' : 'star-outline'} size={18} color={n <= value ? colors.warning : colors.gray300} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  summaryValue: { fontSize: typography.size.display, fontWeight: typography.weight.heavy, color: colors.text },
  review: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stars: { flexDirection: 'row', gap: 2 },
  comment: { fontSize: typography.size.md, color: colors.text, marginTop: spacing.sm, lineHeight: typography.size.md * 1.4 },
  meta: { fontSize: typography.size.xs, color: colors.textMuted, marginTop: spacing.xs },
  reply: {
    fontSize: typography.size.sm,
    color: colors.primaryDark,
    marginTop: spacing.sm,
    backgroundColor: colors.primaryTint,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
});

export default ReviewsScreen;
