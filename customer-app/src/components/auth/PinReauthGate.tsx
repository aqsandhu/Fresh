import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import PinInput from '@components/auth/PinInput';
import { useAuthStore } from '@store';
import { maskPhone, PIN_STALE_MS } from '@/lib/phoneStorage';

interface Props {
  thresholdMs?: number;
  children: React.ReactNode;
}

export const PinReauthGate: React.FC<Props> = ({ thresholdMs = PIN_STALE_MS, children }) => {
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, isAuthenticated, pinVerifiedAt, verifyWithPin } = useAuthStore();
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [stale, setStale] = useState(() => {
    if (!pinVerifiedAt) return true;
    return Date.now() - pinVerifiedAt > thresholdMs;
  });

  useEffect(() => {
    if (!pinVerifiedAt) {
      setStale(true);
      return;
    }
    setStale(Date.now() - pinVerifiedAt > thresholdMs);
  }, [pinVerifiedAt, thresholdMs]);

  const handleVerify = async (entered: string) => {
    if (!user?.phone) {
      Toast.show({ type: 'error', text1: 'Session error. Please log in again.' });
      return;
    }
    setIsVerifying(true);
    try {
      await verifyWithPin(user.phone, entered);
      setStale(false);
      setPin('');
      Toast.show({ type: 'success', text1: 'Verified' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.message || 'Wrong PIN. Please try again.' });
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  };

  // Guests are NOT bounced to a login screen — they stay on checkout and sign
  // in via the inline CheckoutAuthPanel (website parity).
  if (!isAuthenticated || !user?.phone) {
    return <>{children}</>;
  }

  if (!stale) {
    return <>{children}</>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconBox}>
          <MaterialIcons name="verified-user" size={32} color={COLORS.primary700} />
        </View>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Enter your 4-digit PIN to continue</Text>
        <Text style={styles.phone}>{maskPhone(user.phone)}</Text>
        <PinInput value={pin} onChange={setPin} onComplete={handleVerify} disabled={isVerifying} />
        {isVerifying && (
          <View style={styles.verifyingRow}>
            <ActivityIndicator size="small" color={COLORS.primary600} />
            <Text style={styles.verifyingText}>Verifying…</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => rootNavigation.navigate('Auth', { screen: 'Login', params: { redirect: 'CartFlow' } })}
        >
          <Text style={styles.linkText}>Login with another number</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary50,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    alignItems: 'center',
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primary100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  subtitle: { fontSize: 14, color: COLORS.gray500, marginTop: 4, textAlign: 'center' },
  phone: { fontSize: 15, fontWeight: '600', color: COLORS.gray800, marginVertical: SPACING.md },
  verifyingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.md },
  verifyingText: { color: COLORS.primary600, fontSize: 14 },
  linkBtn: { marginTop: SPACING.lg },
  linkText: { color: COLORS.primary600, fontWeight: '600', fontSize: 14 },
});

export default PinReauthGate;
