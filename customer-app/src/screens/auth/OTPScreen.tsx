import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList, RootStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Button, LoadingOverlay } from '@components';
import AuthShell from '@components/auth/AuthShell';
import { useAuthStore } from '@store';
import { formatPhoneNumber } from '@utils/helpers';
import { isOtpBypassEnabled, otpBypassHint } from '@utils/otpBypass';
import { finishAuthRedirect } from '@utils/authRedirect';
import { setLastPhone } from '@/lib/phoneStorage';

type OTPScreenProps = NativeStackScreenProps<AuthStackParamList, 'OTP'>;

export const OTPScreen: React.FC<OTPScreenProps> = ({ route, navigation }) => {
  const { phone, purpose, redirect, userName } = route.params;
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(60);
  const { verifyOTP, isLoading } = useAuthStore();
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const finishLogin = useCallback(() => {
    finishAuthRedirect(rootNavigation, redirect);
  }, [redirect, rootNavigation]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (index === 5 && value) {
      const fullOtp = [...newOtp.slice(0, 5), value].join('');
      if (fullOtp.length === 6) {
        handleVerify(fullOtp);
      }
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (fullOtp?: string) => {
    const code = fullOtp || otp.join('');

    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    if (route.params.userExists === false) {
      navigation.replace('Register', { phone, code, redirect });
      return;
    }

    if (purpose === 'resetPin') {
      navigation.replace('Login', {
        phone,
        initialStep: 'newPin',
        resetCode: code,
        redirect,
      });
      return;
    }

    try {
      await verifyOTP(phone, code);
      await setLastPhone(phone);
      finishLogin();
    } catch (err: any) {
      setError(err.message || 'Invalid OTP. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = () => {
    setTimer(60);
    setOtp(['', '', '', '', '', '']);
    setError('');
    inputRefs.current[0]?.focus();
    const { sendOtp } = useAuthStore.getState();
    sendOtp(phone).catch(console.error);
  };

  const isResetPin = purpose === 'resetPin';

  return (
    <SafeAreaView style={styles.container}>
      <LoadingOverlay visible={isLoading} message="Verifying..." />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
          </TouchableOpacity>

          <AuthShell
            title="Verify OTP"
            subtitle={
              isOtpBypassEnabled() ? (
                otpBypassHint()
              ) : isResetPin ? (
                `Verify OTP to reset your PIN for ${formatPhoneNumber(phone)}`
              ) : (
                `OTP sent to ${formatPhoneNumber(phone)} via SMS`
              )
            }
          >
            {userName ? (
              <Text style={styles.greeting}>Hi, {userName}!</Text>
            ) : null}

            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  style={[
                    styles.otpInput,
                    digit && styles.otpInputFilled,
                    error && styles.otpInputError,
                  ]}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(index, value)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : <View style={styles.errorSpacer} />}

            <Button
              title={isResetPin ? 'Verify OTP' : 'Verify & Login'}
              onPress={() => handleVerify()}
              disabled={otp.join('').length !== 6}
              size="large"
            />

            <View style={styles.resendContainer}>
              {timer > 0 ? (
                <Text style={styles.timerText}>
                  Resend OTP in <Text style={styles.timer}>{timer}s</Text>
                </Text>
              ) : (
                <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendText}>Resend OTP</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.changeNumberBtn}
              onPress={() => navigation.navigate('Login', { redirect })}
            >
              <MaterialIcons name="arrow-back" size={16} color={COLORS.gray500} />
              <Text style={styles.changeNumberText}>Change number</Text>
            </TouchableOpacity>
          </AuthShell>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary50 },
  keyboardView: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.xl },
  backButton: { marginBottom: SPACING.sm },
  greeting: {
    textAlign: 'center',
    color: COLORS.primary600,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    marginTop: SPACING.sm,
  },
  otpInput: {
    width: 44,
    height: 52,
    borderWidth: 2,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.md,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    color: COLORS.gray900,
    backgroundColor: COLORS.gray50,
  },
  otpInputFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
  },
  otpInputError: { borderColor: COLORS.error },
  errorText: { color: COLORS.error, textAlign: 'center', marginBottom: SPACING.md, minHeight: 20 },
  errorSpacer: { minHeight: 20, marginBottom: SPACING.md },
  resendContainer: { alignItems: 'center', marginTop: SPACING.lg },
  timerText: { fontSize: 14, color: COLORS.gray500 },
  timer: { fontWeight: '600', color: COLORS.primary },
  resendText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  changeNumberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: SPACING.lg,
  },
  changeNumberText: { fontSize: 14, color: COLORS.gray500 },
});

export default OTPScreen;
