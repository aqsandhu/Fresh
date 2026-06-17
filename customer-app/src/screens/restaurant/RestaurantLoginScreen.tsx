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
import { restaurantApi, setRestaurantSession } from '@services/restaurant.service';

export const RestaurantLoginScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!/^(\+92|0)[0-9]{10}$/.test(phone.replace(/[^\d+]/g, ''))) {
      return Toast.show({ type: 'error', text1: 'Enter a valid phone number' });
    }
    if (!/^\d{4}$/.test(pin)) return Toast.show({ type: 'error', text1: 'PIN must be 4 digits' });
    setLoading(true);
    try {
      const { token, restaurant } = await restaurantApi.login(phone.trim(), pin);
      await setRestaurantSession(token, restaurant);
      Toast.show({ type: 'success', text1: `Welcome, ${restaurant?.business_name || 'Restaurant'}` });
      navigation.replace('RestaurantShop');
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Invalid phone or PIN' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Login as Restaurant</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="restaurant" size={36} color={COLORS.primary} />
          </View>

          {/* Urdu eligibility note */}
          <Text style={styles.urduNote}>
            یہ سہولت صرف ریسٹورنٹس کیلئے ہے۔ اگر آپ اپنے گھر یا دفتر کیلئے آرڈر کرنا چاہتے ہیں تو واپس جا کر عام طریقے سے آرڈر کریں۔
          </Text>

          <Text style={styles.label}>Phone number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="03001234567"
            keyboardType="phone-pad"
            style={styles.input}
          />

          <Text style={styles.label}>4-digit PIN</Text>
          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            style={[styles.input, styles.pin]}
          />

          <Button title="Login" onPress={submit} loading={loading} style={{ marginTop: SPACING.md }} />

          <TouchableOpacity style={styles.registerBtn} onPress={() => navigation.navigate('RestaurantRegister')}>
            <MaterialIcons name="store" size={20} color={COLORS.primary} />
            <Text style={styles.registerText}>Register as Restaurant</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray200,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  scroll: { padding: SPACING.lg },
  iconWrap: {
    alignSelf: 'center', width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.primaryLight || '#E8F5E9', alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  urduNote: {
    textAlign: 'right', writingDirection: 'rtl', lineHeight: 26, fontSize: 14,
    color: '#92400e', backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg,
  },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.gray700, marginBottom: 6, marginTop: SPACING.sm },
  input: {
    borderWidth: 1, borderColor: COLORS.gray300, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 16, color: COLORS.gray900,
  },
  pin: { textAlign: 'center', letterSpacing: 8 },
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: SPACING.lg, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight || '#E8F5E9',
  },
  registerText: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
});

export default RestaurantLoginScreen;
