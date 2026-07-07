import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import Toast from 'react-native-toast-message';
import { AuthStackParamList, RootStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS, VALIDATION } from '@utils/constants';
import { isOtpBypassEnabled, isValidOtpBypassCode, otpBypassHint } from '@utils/otpBypass';
import { finishAuthRedirect } from '@utils/authRedirect';
import { Button, Input, LoadingOverlay } from '@components';
import AuthShell from '@components/auth/AuthShell';
import AuthStepIndicator, { RegisterStep } from '@components/auth/AuthStepIndicator';
import PinInput from '@components/auth/PinInput';
import { useAuthStore } from '@store';
import { setLastPhone } from '@/lib/phoneStorage';
import { getDevicePhoneNumber, startSmsOtpListener } from '@/lib/phoneAutoFill';
import { formatPhoneNumber } from '@utils/helpers';

type RegisterScreenProps = NativeStackScreenProps<AuthStackParamList, 'Register'>;

type PinStage = 'create' | 'confirm';

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ route, navigation }) => {
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { phone: paramPhone, autoOtp, redirect, code: paramCode } = route.params ?? {};

  const initialStep: RegisterStep = paramCode && paramPhone ? 'profile' : 'phone';
  const [step, setStep] = useState<RegisterStep>(initialStep);
  const [phone, setPhone] = useState(paramPhone ?? '');
  const [verifiedOtpCode, setVerifiedOtpCode] = useState(paramCode ?? '');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; name?: string; email?: string }>({});
  const [pin, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStage, setPinStage] = useState<PinStage>('create');
  const [otpChannel, setOtpChannel] = useState<'whatsapp' | 'sms' | undefined>(undefined);

  const autoOtpStarted = useRef(false);
  const phoneHintShown = useRef(false);
  const otpInputRefs = useRef<(TextInput | null)[]>([]);

  const { sendOtp, register, setPin, isLoading } = useAuthStore();

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const sendRegisterOtp = useCallback(
    async (phoneNumber: string, channel?: 'whatsapp' | 'sms') => {
      try {
        const result = await sendOtp(phoneNumber, channel);
        if (result.userExists) {
          Toast.show({
            type: 'info',
            text1: 'This number is already registered. Please login with your PIN.',
          });
          navigation.replace('Login', { phone: phoneNumber, redirect });
          return;
        }
        setOtpChannel(result.channel);
        setPhone(phoneNumber);
        setStep('otp');
        setOtp(['', '', '', '', '', '']);
        setTimer(60);
      } catch (err: any) {
        Toast.show({ type: 'error', text1: err.message || 'Failed to send OTP' });
      }
    },
    [navigation, redirect, sendOtp]
  );

  useEffect(() => {
    if (!autoOtp || !paramPhone || autoOtpStarted.current) return;
    autoOtpStarted.current = true;
    sendRegisterOtp(paramPhone);
  }, [autoOtp, paramPhone, sendRegisterOtp]);

  // Android: one-tap SIM number fill on the empty phone step (see LoginScreen).
  useEffect(() => {
    if (step !== 'phone' || phone || phoneHintShown.current) return;
    phoneHintShown.current = true;
    getDevicePhoneNumber().then((detected) => {
      if (detected) {
        setPhone(detected);
        setErrors((prev) => ({ ...prev, phone: undefined }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Android zero-tap: auto-read the arriving OTP SMS while the OTP step shows.
  useEffect(() => {
    if (step !== 'otp' || isOtpBypassEnabled()) return;
    const stop = startSmsOtpListener((code) => {
      setOtp(code.split(''));
      verifyOtp(code);
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const validatePhone = (value: string): boolean => {
    if (!value) {
      setErrors({ phone: 'Phone number is required' });
      return false;
    }
    if (!VALIDATION.PHONE_REGEX.test(value)) {
      setErrors({ phone: 'Enter a valid Pakistani number (e.g. 03001234567)' });
      return false;
    }
    setErrors({});
    return true;
  };

  const onPhoneSubmit = async () => {
    if (!validatePhone(phone)) return;
    await sendRegisterOtp(phone);
  };

  const verifyOtp = async (code: string) => {
    if (code.length !== 6) return;

    if (isOtpBypassEnabled() && !isValidOtpBypassCode(code)) {
      Toast.show({ type: 'error', text1: 'Invalid OTP. Please try again.' });
      setOtp(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
      return;
    }

    setVerifiedOtpCode(code);
    setStep('profile');
    Toast.show({ type: 'success', text1: 'Phone verified! Now set up your profile.' });
  };

  /** Keyboard autofill/paste inserts the whole code into one box — distribute. */
  const applyFullCode = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    setOtp(Array.from({ length: 6 }, (_, i) => digits[i] ?? ''));
    otpInputRefs.current[Math.min(digits.length, 5)]?.focus();
    if (digits.length === 6) verifyOtp(digits);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      applyFullCode(value);
      return;
    }
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) otpInputRefs.current[index + 1]?.focus();
    if (index === 5 && value) {
      verifyOtp([...newOtp.slice(0, 5), value].join(''));
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const validateProfile = (): boolean => {
    const newErrors: { name?: string; email?: string } = {};
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.trim().length < VALIDATION.MIN_NAME_LENGTH) {
      newErrors.name = `Name must be at least ${VALIDATION.MIN_NAME_LENGTH} characters`;
    }
    if (email && !VALIDATION.EMAIL_REGEX.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const onProfileSubmit = async () => {
    if (!validateProfile()) return;
    if (!verifiedOtpCode) {
      Toast.show({ type: 'error', text1: 'Verification expired. Please verify OTP again.' });
      setStep('phone');
      return;
    }

    try {
      await register(phone, verifiedOtpCode, name.trim(), email.trim() || undefined);
      Toast.show({ type: 'success', text1: 'Almost done — create your 4-digit PIN' });
      setPinStage('create');
      setPinValue('');
      setPinConfirm('');
      setStep('pin');
    } catch (err: any) {
      const msg = err.message || 'Registration failed';
      Toast.show({ type: 'error', text1: msg });
      if (msg.includes('expired') || msg.includes('not found')) {
        setStep('phone');
      }
    }
  };

  const handlePinFirst = (entered: string) => {
    setPinValue(entered);
    setPinConfirm('');
    setPinStage('confirm');
  };

  const handlePinConfirm = async (entered: string) => {
    if (entered !== pin) {
      Toast.show({ type: 'error', text1: 'PINs do not match. Please try again.' });
      setPinStage('create');
      setPinValue('');
      setPinConfirm('');
      return;
    }

    try {
      await setPin(entered);
      await setLastPhone(phone);
      Toast.show({ type: 'success', text1: 'PIN set! You can use it next time you log in.' });
      finishAuthRedirect(rootNavigation, redirect);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.message || 'Failed to save PIN' });
      setPinStage('create');
      setPinValue('');
      setPinConfirm('');
    }
  };

  const handleResend = (channel?: 'whatsapp' | 'sms') => {
    setTimer(60);
    setOtp(['', '', '', '', '', '']);
    sendRegisterOtp(phone, channel).catch(console.error);
  };

  const formatPhoneInput = (text: string) => text.replace(/[^0-9]/g, '').slice(0, 11);

  const goToLogin = () => {
    navigation.navigate('Login', { redirect, phone: phone || undefined });
  };

  return (
    <SafeAreaView style={styles.container}>
      <LoadingOverlay visible={isLoading} message="Please wait..." />
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
            title="Create Account"
            subtitle="Join Fresh Bazar for fresh groceries"
            footer={
              <>
                <View style={styles.dividerWrap}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>
                <Text style={styles.loginPrompt}>
                  Already have an account?{' '}
                  <Text style={styles.loginLink} onPress={goToLogin}>
                    Login
                  </Text>
                </Text>
                <Text style={styles.termsText}>
                  By creating an account, you agree to our Terms and Privacy Policy
                </Text>
                <View style={styles.securityNote}>
                  <MaterialIcons name="verified-user" size={14} color={COLORS.gray400} />
                  <Text style={styles.securityText}>Phone verified via OTP for your security</Text>
                </View>
              </>
            }
          >
            <AuthStepIndicator currentStep={step} />

            {step === 'phone' && (
              <View style={styles.form}>
                <Input
                  label="Phone Number"
                  placeholder="03XX-XXXXXXX"
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(formatPhoneInput(text));
                    setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  keyboardType="phone-pad"
                  maxLength={11}
                  error={errors.phone}
                  leftIcon={<MaterialIcons name="phone" size={20} color={COLORS.gray400} />}
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  autoFocus
                />
                <Button
                  title="Send Verification Code"
                  onPress={onPhoneSubmit}
                  disabled={phone.length < 11}
                  size="large"
                />
              </View>
            )}

            {step === 'otp' && (
              <View style={styles.form}>
                <Text style={styles.otpHint}>
                  {isOtpBypassEnabled() ? (
                    otpBypassHint()
                  ) : (
                    <>
                      Enter the OTP sent to{' '}
                      <Text style={styles.phoneBold}>{formatPhoneNumber(phone)}</Text> via{' '}
                      {otpChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                    </>
                  )}
                </Text>
                <View style={styles.otpRow}>
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => {
                        otpInputRefs.current[index] = ref;
                      }}
                      style={[styles.otpInput, digit ? styles.otpInputFilled : null]}
                      value={digit}
                      onChangeText={(value) => handleOtpChange(index, value)}
                      onKeyPress={({ nativeEvent }) => handleOtpKeyPress(index, nativeEvent.key)}
                      keyboardType="number-pad"
                      // >1 so keyboard autofill can insert the whole code —
                      // the handler distributes it across the boxes.
                      maxLength={index === 0 ? 6 : 1}
                      textContentType="oneTimeCode"
                      autoComplete={index === 0 ? 'sms-otp' : 'off'}
                      selectTextOnFocus
                    />
                  ))}
                </View>
                <Button
                  title="Verify Phone"
                  onPress={() => verifyOtp(otp.join(''))}
                  disabled={otp.some((d) => !d)}
                  size="large"
                />
                <View style={styles.resendWrap}>
                  {timer > 0 ? (
                    <Text style={styles.timerText}>
                      Resend in <Text style={styles.timerBold}>{timer}s</Text>
                    </Text>
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => handleResend()}>
                        <Text style={styles.resendText}>Resend OTP</Text>
                      </TouchableOpacity>
                      {otpChannel === 'whatsapp' && (
                        <TouchableOpacity onPress={() => handleResend('sms')} style={styles.smsFallbackBtn}>
                          <Text style={styles.smsFallbackText}>WhatsApp not received? Send via SMS</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.changeNumberBtn}
                  onPress={() => {
                    setStep('phone');
                    setOtp(['', '', '', '', '', '']);
                  }}
                >
                  <MaterialIcons name="arrow-back" size={16} color={COLORS.gray500} />
                  <Text style={styles.changeNumberText}>Change number</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'profile' && (
              <View style={styles.form}>
                <View style={styles.verifiedBanner}>
                  <MaterialIcons name="check-circle" size={18} color={COLORS.success} />
                  <Text style={styles.verifiedText}>
                    Phone verified! One more step before your PIN.
                  </Text>
                </View>
                <Input
                  label="Full Name"
                  placeholder="Enter your full name"
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  error={errors.name}
                  leftIcon={<MaterialIcons name="person" size={20} color={COLORS.gray400} />}
                  autoFocus
                />
                <Input
                  label="Email (Optional)"
                  placeholder="your@email.com"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  error={errors.email}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  leftIcon={<MaterialIcons name="email" size={20} color={COLORS.gray400} />}
                />
                <Button title="Continue to PIN" onPress={onProfileSubmit} disabled={!name.trim()} size="large" />
              </View>
            )}

            {step === 'pin' && (
              <View style={styles.form}>
                <Text style={styles.pinTitle}>
                  {pinStage === 'create' ? 'Choose your 4-digit PIN' : 'Confirm your PIN'}
                </Text>
                <Text style={styles.pinSubtitle}>
                  {pinStage === 'create'
                    ? 'You will use this PIN every time you login — quick and easy, no OTP needed.'
                    : 'Enter the same PIN again to confirm.'}
                </Text>
                <PinInput
                  value={pinStage === 'create' ? pin : pinConfirm}
                  onChange={pinStage === 'create' ? setPinValue : setPinConfirm}
                  onComplete={pinStage === 'create' ? handlePinFirst : handlePinConfirm}
                  disabled={isLoading}
                  autoFocus={pinStage === 'create'}
                />
                {pinStage === 'confirm' && !isLoading && (
                  <TouchableOpacity
                    style={styles.startOverBtn}
                    onPress={() => {
                      setPinStage('create');
                      setPinValue('');
                      setPinConfirm('');
                    }}
                  >
                    <Text style={styles.startOverText}>Start over</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
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
  form: { marginTop: SPACING.xs },
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.gray200 },
  dividerText: { paddingHorizontal: SPACING.sm, fontSize: 13, color: COLORS.gray500 },
  loginPrompt: { textAlign: 'center', fontSize: 14, color: COLORS.gray600 },
  loginLink: { color: COLORS.primary600, fontWeight: '700' },
  termsText: {
    marginTop: SPACING.md,
    fontSize: 11,
    color: COLORS.gray400,
    textAlign: 'center',
    lineHeight: 16,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  securityText: { fontSize: 11, color: COLORS.gray400 },
  otpHint: {
    fontSize: 14,
    color: COLORS.gray500,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  phoneBold: { fontWeight: '600', color: COLORS.gray700 },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  otpInput: {
    width: 44,
    height: 52,
    borderWidth: 2,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.md,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: COLORS.gray900,
    backgroundColor: COLORS.gray50,
  },
  otpInputFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
  },
  resendWrap: { alignItems: 'center', marginTop: SPACING.md },
  timerText: { fontSize: 14, color: COLORS.gray500 },
  timerBold: { fontWeight: '600', color: COLORS.gray700 },
  resendText: { fontSize: 14, fontWeight: '600', color: COLORS.primary600 },
  smsFallbackBtn: { marginTop: SPACING.md },
  smsFallbackText: { fontSize: 13, color: COLORS.gray500, textDecorationLine: 'underline' },
  changeNumberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: SPACING.lg,
  },
  changeNumberText: { fontSize: 14, color: COLORS.gray500 },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#ECFDF5',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
  },
  verifiedText: { flex: 1, fontSize: 13, color: '#047857' },
  pinTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.gray900,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  pinSubtitle: {
    fontSize: 13,
    color: COLORS.gray500,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 18,
  },
  startOverBtn: { alignItems: 'center', marginTop: SPACING.lg },
  startOverText: { fontSize: 14, color: COLORS.gray500 },
});

export default RegisterScreen;
