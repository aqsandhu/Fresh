import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Button } from '@components';
import { workAsRiderService, WorkAsRiderContent } from '@services/workAsRider.service';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'WorkAsRider'>;

const VEHICLES = ['Motorcycle', 'Bicycle', 'Car', 'Rickshaw', 'Other'];

const lines = (t?: string) =>
  (t || '').split('\n').map((s) => s.trim()).filter(Boolean);

export const WorkAsRiderScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const [content, setContent] = useState<WorkAsRiderContent | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [vehicleType, setVehicleType] = useState('Motorcycle');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    workAsRiderService.getContent().then(setContent).catch(() => {});
  }, []);

  const submit = async () => {
    if (fullName.trim().length < 2) {
      Toast.show({ type: 'error', text1: 'اپنا پورا نام لکھیں' });
      return;
    }
    if (!/^(\+92|0)[0-9]{10}$/.test(phone.replace(/[^\d+]/g, ''))) {
      Toast.show({ type: 'error', text1: 'درست موبائل نمبر درج کریں (مثلاً 03001234567)' });
      return;
    }
    setSubmitting(true);
    try {
      await workAsRiderService.apply({
        fullName: fullName.trim(),
        phone: phone.trim(),
        city: city.trim() || undefined,
        area: area.trim() || undefined,
        vehicleType,
        message: message.trim() || undefined,
      });
      setDone(true);
      Toast.show({ type: 'success', text1: 'درخواست موصول ہو گئی' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message || 'درخواست جمع نہیں ہو سکی' });
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
        <Text style={styles.headerTitle}>بطور رائڈر کام کریں</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Intro */}
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <MaterialIcons name="two-wheeler" size={26} color={COLORS.white} />
            </View>
            <Text style={styles.intro}>
              {content?.intro || 'FreshBazar کے ساتھ بطور رائڈر کام کریں۔'}
            </Text>
          </View>

          <Section icon="check-circle" color="#16a34a" title="فوائد" items={lines(content?.benefits)} />
          {content?.hours ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <MaterialIcons name="schedule" size={18} color="#2563eb" />
                <Text style={styles.cardTitle}>اوقاتِ کار</Text>
              </View>
              <Text style={styles.cardText}>{content.hours}</Text>
            </View>
          ) : null}
          <Section icon="verified-user" color="#d97706" title="شرائط و ضوابط" items={lines(content?.terms)} />

          {/* Form */}
          {done ? (
            <View style={styles.doneCard}>
              <MaterialIcons name="check-circle" size={48} color="#16a34a" />
              <Text style={styles.doneTitle}>درخواست موصول ہو گئی</Text>
              <Text style={styles.doneSub}>ہماری ٹیم جلد آپ سے رابطہ کرے گی۔</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.formTitle}>درخواست دیں</Text>
              <TextInput style={styles.input} placeholder="پورا نام *" placeholderTextColor={COLORS.gray400} value={fullName} onChangeText={setFullName} textAlign="right" />
              <TextInput style={styles.input} placeholder="موبائل نمبر (03001234567) *" placeholderTextColor={COLORS.gray400} value={phone} onChangeText={setPhone} keyboardType="phone-pad" textAlign="right" />
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="شہر" placeholderTextColor={COLORS.gray400} value={city} onChangeText={setCity} textAlign="right" />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="علاقہ" placeholderTextColor={COLORS.gray400} value={area} onChangeText={setArea} textAlign="right" />
              </View>
              <View style={styles.chips}>
                {VEHICLES.map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.chip, vehicleType === v && styles.chipActive]}
                    onPress={() => setVehicleType(v)}
                  >
                    <Text style={[styles.chipText, vehicleType === v && styles.chipTextActive]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.input, { minHeight: 80 }]}
                placeholder="کوئی اضافی بات؟ (اختیاری)"
                placeholderTextColor={COLORS.gray400}
                value={message}
                onChangeText={setMessage}
                multiline
                textAlign="right"
                textAlignVertical="top"
              />
              <Button title="درخواست جمع کریں" onPress={submit} loading={submitting} style={{ marginTop: SPACING.sm }} />
            </View>
          )}
          {submitting && !done ? <ActivityIndicator style={{ marginTop: SPACING.md }} color={COLORS.primary600} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const Section: React.FC<{ icon: keyof typeof MaterialIcons.glyphMap; color: string; title: string; items: string[] }> = ({
  icon,
  color,
  title,
  items,
}) => {
  if (items.length === 0) return null;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <MaterialIcons name={icon} size={18} color={color} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {items.map((it, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bullet, { backgroundColor: color }]} />
          <Text style={styles.bulletText}>{it}</Text>
        </View>
      ))}
    </View>
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
  hero: {
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: { color: COLORS.white, fontSize: 14, lineHeight: 26, textAlign: 'right', writingDirection: 'rtl' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.gray900 },
  cardText: { fontSize: 13.5, lineHeight: 24, color: COLORS.gray700, textAlign: 'right', writingDirection: 'rtl' },
  bulletRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  bulletText: { flex: 1, fontSize: 13.5, lineHeight: 24, color: COLORS.gray700, textAlign: 'right', writingDirection: 'rtl' },
  formTitle: { fontSize: 16, fontWeight: '800', color: COLORS.gray900, marginBottom: SPACING.sm, textAlign: 'right', writingDirection: 'rtl' },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    color: COLORS.gray900,
    marginBottom: SPACING.sm,
    writingDirection: 'rtl',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm, justifyContent: 'flex-end' },
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
  doneCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  doneTitle: { fontSize: 16, fontWeight: '800', color: COLORS.gray900, marginTop: SPACING.sm },
  doneSub: { fontSize: 13, color: COLORS.gray500, textAlign: 'center' },
});

export default WorkAsRiderScreen;
