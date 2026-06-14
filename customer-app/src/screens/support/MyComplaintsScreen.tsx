import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { OrdersStackParamList, Complaint, ComplaintStatus } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { EmptyState, ErrorView, SkeletonList } from '@components';
import { feedbackService } from '@services/feedback.service';
import { formatDate } from '@utils/helpers';

type Nav = NativeStackNavigationProp<OrdersStackParamList, 'MyComplaints'>;

const STATUS_META: Record<ComplaintStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'کھلی', color: '#b45309', bg: '#fffbeb' },
  in_progress: { label: 'زیرِ عمل', color: '#1d4ed8', bg: '#eff6ff' },
  resolved: { label: 'حل شدہ', color: '#15803d', bg: '#f0fdf4' },
  closed: { label: 'بند', color: '#6b7280', bg: '#f3f4f6' },
};

export const MyComplaintsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await feedbackService.getMyComplaints();
      if (res.success) setComplaints(res.data);
    } catch (err: any) {
      setError(err?.message || 'شکایات لوڈ نہیں ہو سکیں');
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

  const renderItem = ({ item }: { item: Complaint }) => {
    const meta = STATUS_META[item.status] || STATUS_META.open;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.ticket}>#{item.ticketNumber}</Text>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={styles.subject} numberOfLines={1}>
          {item.subject}
        </Text>
        <Text style={styles.message} numberOfLines={2}>
          {item.message}
        </Text>
        {item.orderNumber ? (
          <Text style={styles.meta}>آرڈر #{item.orderNumber}</Text>
        ) : null}
        {item.adminResponse ? (
          <View style={styles.response}>
            <Text style={styles.responseLabel}>ٹیم کا جواب:</Text>
            <Text style={styles.responseText}>{item.adminResponse}</Text>
          </View>
        ) : null}
        <Text style={styles.date}>{item.createdAt ? formatDate(item.createdAt) : ''}</Text>
      </View>
    );
  };

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header navigation={navigation} />
        <ErrorView message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header navigation={navigation} />
      {loading ? (
        <SkeletonList count={4} />
      ) : complaints.length === 0 ? (
        <EmptyState
          icon="support-agent"
          title="کوئی شکایت نہیں"
          message="آپ نے ابھی تک کوئی شکایت درج نہیں کی۔"
          actionTitle="نئی شکایت درج کریں"
          onAction={() => navigation.navigate('NewComplaint')}
        />
      ) : (
        <FlatList
          data={complaints}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
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

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewComplaint')}
        activeOpacity={0.85}
      >
        <MaterialIcons name="add" size={24} color={COLORS.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const Header: React.FC<{ navigation: Nav }> = ({ navigation }) => (
  <View style={styles.header}>
    <TouchableOpacity onPress={() => navigation.goBack()}>
      <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
    </TouchableOpacity>
    <Text style={styles.headerTitle}>میری شکایات</Text>
    <View style={{ width: 24 }} />
  </View>
);

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
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ticket: { fontSize: 13, fontWeight: '700', color: COLORS.primary700 },
  badge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.sm },
  badgeText: { fontSize: 11, fontWeight: '700' },
  subject: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.gray900,
    marginTop: SPACING.sm,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  message: { fontSize: 13, color: COLORS.gray600, marginTop: 4, textAlign: 'right', writingDirection: 'rtl' },
  meta: { fontSize: 12, color: COLORS.gray500, marginTop: 6, textAlign: 'right' },
  response: {
    marginTop: SPACING.sm,
    backgroundColor: '#f0fdf4',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
  },
  responseLabel: { fontSize: 12, fontWeight: '700', color: '#15803d', textAlign: 'right', writingDirection: 'rtl' },
  responseText: { fontSize: 13, color: '#166534', marginTop: 2, textAlign: 'right', writingDirection: 'rtl' },
  date: { fontSize: 11, color: COLORS.gray400, marginTop: SPACING.sm, textAlign: 'right' },
  fab: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary600,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});

export default MyComplaintsScreen;
