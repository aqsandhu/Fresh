import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { OrdersStackParamList, ComplaintCategory } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Button, GuidanceTips } from '@components';
import { COMPLAINT_TIPS } from '@/content/guidanceTips';
import { feedbackService } from '@services/feedback.service';

type Nav = NativeStackNavigationProp<OrdersStackParamList, 'NewComplaint'>;
type Rt = RouteProp<OrdersStackParamList, 'NewComplaint'>;

const CATEGORIES: { value: ComplaintCategory; label: string }[] = [
  { value: 'delivery', label: 'ڈیلیوری میں دیر' },
  { value: 'product_quality', label: 'پروڈکٹ کا معیار' },
  { value: 'rider_behavior', label: 'رائڈر کا رویہ' },
  { value: 'payment', label: 'ادائیگی / رقم' },
  { value: 'app_issue', label: 'ایپ کا مسئلہ' },
  { value: 'other', label: 'دیگر' },
];

export const NewComplaintScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const orderId = route.params?.orderId;
  const orderNumber = route.params?.orderNumber;

  const [category, setCategory] = useState<ComplaintCategory>('delivery');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (subject.trim().length < 3) {
      Toast.show({ type: 'error', text1: 'مختصر عنوان لکھیں' });
      return;
    }
    if (message.trim().length < 5) {
      Toast.show({ type: 'error', text1: 'شکایت کی تفصیل لکھیں' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await feedbackService.fileComplaint({
        subject: subject.trim(),
        message: message.trim(),
        category,
        orderId,
      });
      Toast.show({
        type: 'success',
        text1: 'شکایت درج ہو گئی',
        text2: `ٹکٹ: ${res.data.ticketNumber}`,
      });
      navigation.navigate('MyComplaints');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message || 'شکایت درج نہیں ہو سکی' });
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
        <Text style={styles.headerTitle}>نئی شکایت</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <GuidanceTips tips={COMPLAINT_TIPS} page="complaint" />

          {orderNumber ? (
            <View style={styles.orderTag}>
              <MaterialIcons name="receipt-long" size={16} color={COLORS.primary700} />
              <Text style={styles.orderTagText}>آرڈر #{orderNumber} سے منسلک</Text>
            </View>
          ) : null}

          <Text style={styles.label}>مسئلے کی قسم</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => {
              const active = category === c.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setCategory(c.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>عنوان</Text>
          <TextInput
            style={styles.input}
            placeholder="مختصر عنوان"
            placeholderTextColor={COLORS.gray400}
            value={subject}
            onChangeText={setSubject}
            maxLength={200}
            textAlign="right"
          />

          <Text style={styles.label}>تفصیل</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="اپنی شکایت تفصیل سے لکھیں"
            placeholderTextColor={COLORS.gray400}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={4000}
            textAlign="right"
            textAlignVertical="top"
          />

          <Button
            title="شکایت جمع کریں"
            onPress={handleSubmit}
            loading={submitting}
            style={{ marginTop: SPACING.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  orderTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    backgroundColor: COLORS.primary50,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    marginBottom: SPACING.md,
  },
  orderTagText: { fontSize: 12, fontWeight: '600', color: COLORS.primary700 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: SPACING.sm,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md, justifyContent: 'flex-end' },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.gray300,
    backgroundColor: COLORS.white,
  },
  chipActive: { backgroundColor: COLORS.primary600, borderColor: COLORS.primary600 },
  chipText: { fontSize: 13, color: COLORS.gray700 },
  chipTextActive: { color: COLORS.white, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    color: COLORS.gray900,
    marginBottom: SPACING.md,
    writingDirection: 'rtl',
  },
  textarea: { minHeight: 120 },
});

export default NewComplaintScreen;
