import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList, Review } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { EmptyState, ErrorView, SkeletonList, StarRating, GuidanceTips } from '@components';
import { REVIEWS_TIPS } from '@/content/guidanceTips';
import { feedbackService } from '@services/feedback.service';
import { formatDate } from '@utils/helpers';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'MyReviews'>;

const TARGET_LABEL: Record<string, string> = {
  product: 'پروڈکٹ',
  rider: 'رائڈر',
  service: 'سروس',
};

export const MyReviewsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await feedbackService.getMyReviews();
      if (res.success) setReviews(res.data);
    } catch (err: any) {
      setError(err?.message || 'ریویو لوڈ نہیں ہو سکے');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const titleFor = (r: Review): string => {
    if (r.targetType === 'product') return r.productName || 'پروڈکٹ';
    if (r.targetType === 'rider') return r.riderName ? `رائڈر: ${r.riderName}` : 'رائڈر';
    return 'سروس / ڈیلیوری';
  };

  const renderItem = ({ item }: { item: Review }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title} numberOfLines={1}>
          {titleFor(item)}
        </Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{TARGET_LABEL[item.targetType]}</Text>
        </View>
      </View>
      <StarRating value={item.rating} size={18} />
      {item.comment ? <Text style={styles.comment}>{item.comment}</Text> : null}
      {item.orderNumber ? <Text style={styles.meta}>آرڈر #{item.orderNumber}</Text> : null}
      {item.adminReply ? (
        <View style={styles.reply}>
          <Text style={styles.replyLabel}>جواب:</Text>
          <Text style={styles.replyText}>{item.adminReply}</Text>
        </View>
      ) : null}
      <Text style={styles.date}>{item.createdAt ? formatDate(item.createdAt) : ''}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>میرے ریویو</Text>
        <View style={{ width: 24 }} />
      </View>

      {error && !loading ? (
        <ErrorView message={error} onRetry={load} />
      ) : loading ? (
        <SkeletonList count={4} />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon="star-border"
          title="کوئی ریویو نہیں"
          message="جب آپ کسی آرڈر کو درجہ بندی دیں گے تو وہ یہاں نظر آئے گا۔"
        />
      ) : (
        <FlatList
          data={reviews}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<GuidanceTips tips={REVIEWS_TIPS} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        />
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
  list: { padding: SPACING.lg },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.gray900, textAlign: 'right', writingDirection: 'rtl' },
  tag: {
    backgroundColor: COLORS.primary50,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginLeft: SPACING.sm,
  },
  tagText: { fontSize: 11, fontWeight: '700', color: COLORS.primary700 },
  comment: { fontSize: 13, color: COLORS.gray700, marginTop: 6, textAlign: 'right', writingDirection: 'rtl' },
  meta: { fontSize: 12, color: COLORS.gray500, marginTop: 6, textAlign: 'right' },
  reply: { marginTop: SPACING.sm, backgroundColor: '#eff6ff', borderRadius: BORDER_RADIUS.md, padding: SPACING.sm },
  replyLabel: { fontSize: 12, fontWeight: '700', color: '#1d4ed8', textAlign: 'right', writingDirection: 'rtl' },
  replyText: { fontSize: 13, color: '#1e40af', marginTop: 2, textAlign: 'right', writingDirection: 'rtl' },
  date: { fontSize: 11, color: COLORS.gray400, marginTop: SPACING.sm, textAlign: 'right' },
});

export default MyReviewsScreen;
