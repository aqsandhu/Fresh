import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useAuthStore } from '@store';
import { authService } from '@services/auth.service';
import { isOtpBypassEnabled, otpBypassHint } from '@/utils/otpBypass';
import { getLastPhone, maskPhone, setLastPhone } from '@/lib/phoneStorage';

type Step = 'phone' | 'pin' | 'otp' | 'register';

const PHONE_RE = /^03[0-9]{9}$/;

/**
 * Inline login / sign-up shown at the TOP of the checkout page for guests —
 * mirrors the website's CheckoutAuthPanel so a guest NEVER leaves checkout to a
 * separate login screen. The moment they sign in, the parent re-renders the
 * real checkout (isAuthenticated flips true).
 */
export const CheckoutAuthPanel: React.FC = () => {
  const { sendOtp, verifyWithPin, verifyOTP, register, setPin: savePin } = useAuthStore();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [pin, setPin] = useState('');
  const [otp, setOtp] = useState('');
  const [otpPurpose, setOtpPurpose] = useState<'login' | 'register'>('login');
  const verifiedCodeRef = useRef('');

  const [regName, setRegName] = useState('');
  const [regPin, setRegPin] = useState('');

  useEffect(() => {
    getLastPhone().then((saved) => {
      if (saved) setPhone(saved);
    });
  }, []);

  const isSignupSide = step === 'otp' ? otpPurpose === 'register' : step === 'register';

  const startOtp = async (value: string, purpose: 'login' | 'register') => {
    await sendOtp(value);
    setOtpPurpose(purpose);
    setOtp('');
    setStep('otp');
    if (isOtpBypassEnabled()) {
      Toast.show({ type: 'info', text1: otpBypassHint(), visibilityTime: 5000 });
    } else {
      Toast.show({ type: 'success', text1: 'OTP sent via SMS' });
    }
  };

  const submitPhone = async () => {
    const value = phone.trim();
    if (!PHONE_RE.test(value)) {
      Toast.show({ type: 'error', text1: 'Enter a valid number (03XXXXXXXXX)' });
      return;
    }
    setLoading(true);
    try {
      const res = await authService.pinStatus(value);
      const status = res.data;
      setNormalizedPhone(value);
      setUserName(status.fullName || null);
      if (status.exists && status.hasPin) {
        setPin('');
        setStep('pin');
      } else if (status.exists && !status.hasPin) {
        await startOtp(value, 'login');
      } else {
        await startOtp(value, 'register');
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message || 'Could not start sign-in' });
    } finally {
      setLoading(false);
    }
  };

  const submitPin = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    try {
      await verifyWithPin(normalizedPhone || phone, pin);
      await setLastPhone(normalizedPhone || phone);
      Toast.show({ type: 'success', text1: 'Signed in!' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message || 'Invalid PIN' });
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      if (otpPurpose === 'register') {
        verifiedCodeRef.current = otp;
        setRegName('');
        setRegPin('');
        setStep('register');
        Toast.show({ type: 'success', text1: 'Phone verified! Name + PIN to finish.' });
      } else {
        await verifyOTP(normalizedPhone || phone, otp);
        await setLastPhone(normalizedPhone || phone);
        Toast.show({ type: 'success', text1: 'Signed in!' });
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message || 'Invalid OTP' });
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async () => {
    if (regName.trim().length < 2) {
      Toast.show({ type: 'error', text1: 'Please enter your name' });
      return;
    }
    if (regPin.length !== 4) {
      Toast.show({ type: 'error', text1: 'Choose a 4-digit PIN' });
      return;
    }
    setLoading(true);
    try {
      await register(normalizedPhone || phone, verifiedCodeRef.current, regName.trim());
      await savePin(regPin);
      await setLastPhone(normalizedPhone || phone);
      Toast.show({ type: 'success', text1: 'Account ready — signed in!' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message || 'Could not finish sign-up' });
    } finally {
      setLoading(false);
    }
  };

  const backToPhone = () => {
    setStep('phone');
    setPin('');
    setOtp('');
    setOtpPurpose('login');
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MaterialIcons
            name={isSignupSide ? 'person-add' : 'verified-user'}
            size={20}
            color={COLORS.primary600}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {isSignupSide ? 'Create your account' : 'Sign in to continue'}
          </Text>
          <Text style={styles.subtitle}>
            {isSignupSide ? 'Quick sign-up — then place your order' : 'Login or sign up to place your order'}
          </Text>
        </View>
      </View>

      {step === 'phone' && (
        <View style={styles.form}>
          <Text style={styles.label}>Mobile number</Text>
          <TextInput
            style={styles.input}
            placeholder="03XX-XXXXXXX"
            keyboardType="number-pad"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 11))}
            maxLength={11}
          />
          <PrimaryButton label="Continue" loading={loading} onPress={submitPhone} />
          <Text style={styles.hint}>
            New here? Bas apna number daalein — hum OTP se verify karke PIN set karwa denge.
          </Text>
        </View>
      )}

      {step === 'pin' && (
        <View style={styles.form}>
          <Text style={styles.centerNote}>
            {userName ? `Welcome back, ${userName}. ` : ''}Enter your 4-digit PIN for{' '}
            {maskPhone(normalizedPhone || phone)}
          </Text>
          <TextInput
            style={styles.codeInput}
            placeholder="••••"
            keyboardType="number-pad"
            secureTextEntry
            value={pin}
            onChangeText={(t) => {
              const v = t.replace(/\D/g, '').slice(0, 4);
              setPin(v);
              if (v.length === 4) setTimeout(submitPin, 50);
            }}
            maxLength={4}
            autoFocus
          />
          <PrimaryButton label="Sign in" loading={loading} onPress={submitPin} />
          <TouchableOpacity onPress={() => startOtp(normalizedPhone || phone, 'login')} disabled={loading}>
            <Text style={styles.linkText}>Forgot PIN? Sign in with OTP</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={backToPhone} disabled={loading}>
            <Text style={styles.mutedLink}>Use a different number</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'otp' && (
        <View style={styles.form}>
          <View style={styles.otpNote}>
            <Text style={styles.otpNoteText}>
              {isOtpBypassEnabled()
                ? otpBypassHint()
                : `6-digit code SMS kiya gaya hai ${normalizedPhone || phone} par.`}
            </Text>
          </View>
          <TextInput
            style={styles.codeInput}
            placeholder="••••••"
            keyboardType="number-pad"
            value={otp}
            onChangeText={(t) => {
              const v = t.replace(/\D/g, '').slice(0, 6);
              setOtp(v);
              if (v.length === 6) setTimeout(submitOtp, 50);
            }}
            maxLength={6}
            autoFocus
          />
          <PrimaryButton
            label={otpPurpose === 'register' ? 'Verify number' : 'Verify & sign in'}
            loading={loading}
            onPress={submitOtp}
          />
          <TouchableOpacity onPress={backToPhone} disabled={loading}>
            <Text style={styles.mutedLink}>← Change number</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'register' && (
        <View style={styles.form}>
          <View style={[styles.otpNote, styles.regNote]}>
            <Text style={[styles.otpNoteText, { color: '#166534' }]}>
              Number verified. Naam aur 4-digit PIN chunein — agli baar isi PIN se login (OTP nahi).
            </Text>
          </View>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            value={regName}
            onChangeText={setRegName}
            autoFocus
          />
          <Text style={styles.label}>Choose a 4-digit PIN</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="••••"
            keyboardType="number-pad"
            secureTextEntry
            value={regPin}
            onChangeText={(t) => setRegPin(t.replace(/\D/g, '').slice(0, 4))}
            maxLength={4}
          />
          <PrimaryButton label="Create account & continue" loading={loading} onPress={submitRegister} />
          <TouchableOpacity onPress={backToPhone} disabled={loading}>
            <Text style={styles.mutedLink}>← Start over</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        <MaterialIcons name="phone" size={13} color={COLORS.gray400} />
        <Text style={styles.footerText}>Your number is only used to secure your orders</Text>
      </View>
    </View>
  );
};

const PrimaryButton: React.FC<{ label: string; loading?: boolean; onPress: () => void }> = ({
  label,
  loading,
  onPress,
}) => (
  <TouchableOpacity style={styles.primaryBtn} onPress={onPress} disabled={loading} activeOpacity={0.85}>
    {loading ? (
      <ActivityIndicator color={COLORS.white} />
    ) : (
      <>
        <Text style={styles.primaryBtnText}>{label}</Text>
        <MaterialIcons name="arrow-forward" size={18} color={COLORS.white} />
      </>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primary100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: '600', color: COLORS.gray900 },
  subtitle: { fontSize: 13, color: COLORS.gray500, marginTop: 1 },
  form: { gap: SPACING.md },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.gray700 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.gray900,
    backgroundColor: COLORS.gray50,
  },
  codeInput: {
    borderWidth: 2,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 10,
    textAlign: 'center',
    color: COLORS.gray900,
    backgroundColor: COLORS.gray50,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary600,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.lg,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 11, color: COLORS.gray500, textAlign: 'center' },
  centerNote: { fontSize: 13, color: COLORS.gray600, textAlign: 'center' },
  linkText: { fontSize: 13, color: COLORS.primary600, fontWeight: '600', textAlign: 'center' },
  mutedLink: { fontSize: 13, color: COLORS.gray500, textAlign: 'center' },
  otpNote: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  regNote: { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' },
  otpNoteText: { fontSize: 13, color: '#1E40AF' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.md,
  },
  footerText: { fontSize: 11, color: COLORS.gray400 },
});

export default CheckoutAuthPanel;
