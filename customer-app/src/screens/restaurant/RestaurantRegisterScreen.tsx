import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Button } from '@components';
import { restaurantApi } from '@services/restaurant.service';

export const RestaurantRegisterScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [form, setForm] = useState({ business_name: '', owner_name: '', phone: '', pin: '', city: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (form.business_name.trim().length < 2) return Toast.show({ type: 'error', text1: 'Enter your restaurant name' });
    if (!/^(\+92|0)[0-9]{10}$/.test(form.phone.replace(/[^\d+]/g, ''))) {
      return Toast.show({ type: 'error', text1: 'Enter a valid phone number' });
    }
    if (!/^\d{4}$/.test(form.pin)) return Toast.show({ type: 'error', text1: 'PIN must be 4 digits' });
    setSaving(true);
    try {
      await restaurantApi.register({
        business_name: form.business_name.trim(),
        owner_name: form.owner_name.trim() || undefined,
        phone: form.phone.trim(),
        pin: form.pin,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
      });
      setDone(true);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Could not submit your request' });
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <View style={styles.successIcon}>
            <MaterialIcons name="check-circle" size={48} color={COLORS.success || '#16a34a'} />
          </View>
          <Text style={styles.successTitle}>Request submitted</Text>
          <Text style={styles.urduNote}>
            24 گھنٹوں میں ہماری ٹیم آپ کی ریسٹورنٹ ریکوئسٹ کو ریویو کرے گی، اور آپ کو اُس ریویو کے متعلق واٹس ایپ یا کال کے ذریعے آگاہ کر دیا جائے گا۔
          </Text>
          <Button title="Back to Login" onPress={() => navigation.replace('RestaurantLogin')} style={{ marginTop: SPACING.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Register as Restaurant</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Field label="Restaurant name *"><TextInput value={form.business_name} onChangeText={(t) => set('business_name', t)} placeholder="e.g. Al-Madina Foods" style={styles.input} /></Field>
          <Field label="Owner / contact person"><TextInput value={form.owner_name} onChangeText={(t) => set('owner_name', t)} placeholder="Full name" style={styles.input} /></Field>
          <Field label="Phone number *"><TextInput value={form.phone} onChangeText={(t) => set('phone', t)} placeholder="03001234567" keyboardType="phone-pad" style={styles.input} /></Field>
          <Field label="4-digit PIN *"><TextInput value={form.pin} onChangeText={(t) => set('pin', t.replace(/\D/g, '').slice(0, 4))} placeholder="••••" keyboardType="number-pad" secureTextEntry maxLength={4} style={[styles.input, { letterSpacing: 8, textAlign: 'center' }]} /></Field>
          <Field label="City"><TextInput value={form.city} onChangeText={(t) => set('city', t)} placeholder="e.g. Gujrat" style={styles.input} /></Field>
          <Field label="Address"><TextInput value={form.address} onChangeText={(t) => set('address', t)} placeholder="Complete address" multiline style={[styles.input, { height: 70, textAlignVertical: 'top' }]} /></Field>
          <Button title="Submit request" onPress={submit} loading={saving} style={{ marginTop: SPACING.md }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: SPACING.sm }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.gray200,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  scroll: { padding: SPACING.lg },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.gray700, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: COLORS.gray300, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 16, color: COLORS.gray900,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  successIcon: { marginBottom: SPACING.md },
  successTitle: { fontSize: 20, fontWeight: '700', color: COLORS.gray900, marginBottom: SPACING.md },
  urduNote: { textAlign: 'right', writingDirection: 'rtl', lineHeight: 28, fontSize: 15, color: COLORS.gray700 },
});

export default RestaurantRegisterScreen;
