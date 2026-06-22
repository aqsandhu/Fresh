import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { franchiseService } from '@services/franchise.service';

const BENEFITS = [
  { icon: 'trending-up', text: 'Proven grocery-delivery model with real demand' },
  { icon: 'local-shipping', text: 'Rider network & delivery playbook' },
  { icon: 'campaign', text: 'Brand, app & marketing handled centrally' },
  { icon: 'school', text: 'Training for you and your team' },
];

const STEPS = ['Apply', 'Discuss', 'Agreement', 'Launch'];

export const FranchiseScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (name.trim().length < 2) return Alert.alert('Name required', 'Please enter your name.');
    if (!/^\+?[0-9\-\s]{10,20}$/.test(phone.trim()))
      return Alert.alert('Invalid phone', 'Please enter a valid phone number.');
    setSubmitting(true);
    const res = await franchiseService.submitInquiry({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      city: city.trim() || undefined,
      message: message.trim() || undefined,
    });
    setSubmitting(false);
    if (res.success) {
      Alert.alert('Application received', 'Thank you! Our team will contact you soon.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      Alert.alert('Error', res.message || 'Could not submit. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Franchise</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
        <Text style={styles.title}>Bring FreshBazar to your city</Text>
        <Text style={styles.titleUr}>اپنے شہر میں فریش بازار کی فرنچائز لیں</Text>
        <Text style={styles.subtitle}>
          Partner with us to launch fresh grocery delivery in your area — with our brand, technology,
          logistics and training behind you.
        </Text>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b.text} style={styles.benefitRow}>
              <MaterialIcons name={b.icon as any} size={20} color={COLORS.primary600} />
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={s} style={styles.stepChip}>
              <Text style={styles.stepChipNum}>{i + 1}</Text>
              <Text style={styles.stepChipText}>{s}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.formTitle}>Apply for a franchise</Text>
        <TextInput style={styles.input} placeholder="Full name *" value={name} onChangeText={setName} />
        <TextInput
          style={styles.input}
          placeholder="Phone *"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput style={styles.input} placeholder="City *" value={city} onChangeText={setCity} />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Message"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          value={message}
          onChangeText={setMessage}
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.submitBtnText}>Submit application</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.gray900 },
  titleUr: { fontSize: 16, color: COLORS.primary700, marginTop: 4 },
  subtitle: { fontSize: 14, color: COLORS.gray600, marginTop: SPACING.sm, lineHeight: 20 },
  benefits: { marginTop: SPACING.lg, gap: SPACING.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  benefitText: { fontSize: 14, color: COLORS.gray700, flex: 1 },
  steps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  stepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary50,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  stepChipNum: { fontWeight: '800', color: COLORS.primary700 },
  stepChipText: { color: COLORS.primary700, fontWeight: '600' },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.gray900,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 15,
    color: COLORS.gray900,
    marginBottom: SPACING.md,
  },
  textArea: { height: 90 },
  submitBtn: {
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  submitBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
});

export default FranchiseScreen;
