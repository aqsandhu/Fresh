import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { AuthStackParamList, RootStackParamList } from '@app-types';
import { COLORS, SPACING, VALIDATION, ERROR_MESSAGES } from '@utils/constants';
import { isOtpBypassEnabled, otpBypassHint } from '@utils/otpBypass';
import { finishAuthRedirect } from '@utils/authRedirect';
import { Button, Input, LoadingOverlay } from '@components';
import AuthShell from '@components/auth/AuthShell';
import PinInput from '@components/auth/PinInput';
import { useAuthStore } from '@store';
import { authService } from '@services/auth.service';
import { clearLastPhone, getLastPhone, maskPhone, setLastPhone } from '@/lib/phoneStorage';
import { getDevicePhoneNumber } from '@/lib/phoneAutoFill';
import Toast from 'react-native-toast-message';

type Step = 'phone' | 'pin' | 'newPin';

type LoginRoute = RouteProp<AuthStackParamList, 'Login'>;

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<LoginRoute>();
  const redirect = route.params?.redirect;

  const [step, setStep] = useState<Step>(route.params?.initialStep === 'newPin' ? 'newPin' : 'phone');
  const [phone, setPhone] = useState(route.params?.phone ?? '');
  const [userName, setUserName] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [resetCode, setResetCode] = useState(route.params?.resetCode ?? '');
  const [bootstrapping, setBootstrapping] = useState(true);
  const phoneHintShown = useRef(false);

  const { sendOtp, verifyWithPin, resetPinAndLogin, isLoading } = useAuthStore();

  useEffect(() => {
    if (route.params?.initialStep === 'newPin' && route.params.resetCode) {
      setStep('newPin');
      setResetCode(route.params.resetCode);
      if (route.params.phone) setPhone(route.params.phone);
      setBootstrapping(false);
      return;
    }

    if (route.params?.another) {
      clearLastPhone();
      setStep('phone');
      setBootstrapping(false);
      return;
    }

    if (route.params?.phone) {
      setPhone(route.params.phone);
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const saved = await getLastPhone();
      if (!saved) {
        setBootstrapping(false);
        return;
      }
      try {
        const status = await authService.pinStatus(saved);
        if (cancelled) return;
        if (status.success && status.data?.exists && status.data?.hasPin) {
          setPhone(saved);
          setUserName(status.data.fullName || null);
          setStep('pin');
        }
      } catch {
        /* fall through */
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route.params?.another, route.params?.initialStep, route.params?.phone, route.params?.resetCode]);

  // Android: offer the SIM number via Google's Phone Number Hint sheet the
  // first time the empty phone step shows — one tap fills the field. No-op on
  // iOS/Expo Go (helper returns null) where the keyboard suggestion covers it.
  useEffect(() => {
    if (bootstrapping || step !== 'phone' || phone || phoneHintShown.current) return;
    phoneHintShown.current = true;
    getDevicePhoneNumber().then((detected) => {
      if (detected) {
        setPhone(detected);
        setError('');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapping, step]);

  const finishLogin = useCallback(() => {
    finishAuthRedirect(rootNavigation, redirect);
  }, [redirect, rootNavigation]);

  const validatePhone = (value: string): boolean => {
    if (!value) {
      setError('Phone number is required');
      return false;
    }
    if (!VALIDATION.PHONE_REGEX.test(value)) {
      setError(ERROR_MESSAGES.PHONE_INVALID);
      return false;
    }
    setError('');
    return true;
  };

  const onPhoneSubmit = async () => {
    if (!validatePhone(phone)) return;

    try {
      const status = await authService.pinStatus(phone);
      if (!status.success || !status.data?.exists) {
        navigation.navigate('Register', { phone, autoOtp: true, redirect });
        return;
      }

      setUserName(status.data.fullName || null);

      if (status.data.hasPin) {
        setPin('');
        setStep('pin');
      } else {
        const result = await sendOtp(phone);
        navigation.navigate('OTP', {
          phone,
          userExists: result.userExists,
          userName: result.userName,
          channel: result.channel,
          redirect,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start sign-in');
    }
  };

  const verifyPinHandler = async (entered: string) => {
    if (entered.length !== 4) return;
    try {
      await verifyWithPin(phone, entered);
      await setLastPhone(phone);
      Toast.show({ type: 'success', text1: 'Login successful!' });
      finishLogin();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.message || 'Invalid PIN' });
      setPin('');
    }
  };

  const handleUseAnotherNumber = async () => {
    await clearLastPhone();
    setStep('phone');
    setPhone('');
    setPin('');
    setUserName(null);
  };

  const handleForgotPin = async () => {
    try {
      const result = await sendOtp(phone);
      navigation.navigate('OTP', {
        phone,
        userExists: true,
        userName,
        purpose: 'resetPin',
        channel: result.channel,
        redirect,
      });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.message || 'Failed to send OTP' });
    }
  };

  const handleNewPinSubmit = async () => {
    if (newPin.length !== 4 || newPinConfirm.length !== 4) {
      Toast.show({ type: 'error', text1: 'Please enter and confirm your 4-digit PIN.' });
      return;
    }
    if (newPin !== newPinConfirm) {
      Toast.show({ type: 'error', text1: 'PINs do not match. Please try again.' });
      setNewPin('');
      setNewPinConfirm('');
      return;
    }
    if (!resetCode) {
      Toast.show({ type: 'error', text1: 'Verification expired. Please request OTP again.' });
      setStep('pin');
      return;
    }

    try {
      await resetPinAndLogin(phone, resetCode, newPin);
      await setLastPhone(phone);
      Toast.show({ type: 'success', text1: 'PIN updated. You are now logged in.' });
      setNewPin('');
      setNewPinConfirm('');
      setResetCode('');
      finishLogin();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.message || 'Failed to reset PIN. Please try again.' });
      setNewPin('');
      setNewPinConfirm('');
    }
  };

  const formatPhoneInput = (text: string): string => {
    return text.replace(/[^0-9]/g, '').slice(0, 11);
  };

  const goToRegister = () => {
    navigation.navigate('Register', { redirect });
  };

  const shellTitle =
    step === 'newPin'
      ? 'Set New PIN'
      : step === 'pin'
        ? `Welcome${userName ? `, ${userName}` : ' back'}`
        : 'Welcome Back';

  const shellSubtitle =
    step === 'newPin'
      ? 'Enter and confirm your new 4-digit PIN'
      : step === 'pin'
        ? `Enter your 4-digit PIN for ${maskPhone(phone)}`
        : 'Login to your Fresh Bazar account';

  if (bootstrapping) {
    return <LoadingOverlay visible message="Loading..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <LoadingOverlay visible={isLoading} message="Please wait..." />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.body}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <AuthShell
              title={shellTitle}
              subtitle={shellSubtitle}
              footer={
                step !== 'newPin' ? (
                  <>
                    <View style={styles.dividerWrap}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>or</Text>
                      <View style={styles.dividerLine} />
                    </View>
                    <Text style={styles.registerPrompt}>
                      Don&apos;t have an account?{' '}
                      <Text style={styles.registerLink} onPress={goToRegister}>
                        Register
                      </Text>
                    </Text>
                    <View style={styles.securityNote}>
                      <MaterialIcons name="verified-user" size={14} color={COLORS.gray400} />
                      <Text style={styles.securityText}>OTP verification keeps your account secure</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.footerSpacer} />
                )
              }
            >
            {step === 'phone' && (
              <View style={styles.form}>
                <Input
                  label="Phone Number"
                  placeholder="03XX-XXXXXXX"
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(formatPhoneInput(text));
                    setError('');
                  }}
                  keyboardType="phone-pad"
                  maxLength={11}
                  error={error}
                  leftIcon={<MaterialIcons name="phone" size={20} color={COLORS.gray400} />}
                  // iOS QuickType suggests the user's own number; Android
                  // autofill can offer it too (plus our Phone Number Hint sheet).
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  autoFocus
                />
                <Button
                  title="Continue"
                  onPress={onPhoneSubmit}
                  disabled={phone.length < 11}
                  size="large"
                />
                <Text style={styles.hint}>
                  {isOtpBypassEnabled()
                    ? otpBypassHint()
                    : "New customer? Enter your number — we'll verify with OTP on the next screen."}
                </Text>
              </View>
            )}

            {step === 'pin' && (
              <View style={styles.form}>
                <PinInput value={pin} onChange={setPin} onComplete={verifyPinHandler} autoFocus />
                <TouchableOpacity onPress={handleForgotPin} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Forgot PIN? Sign in with OTP</Text>
                </TouchableOpacity>
                <Button
                  title="Login with another number"
                  onPress={handleUseAnotherNumber}
                  variant="outline"
                  size="large"
                  style={styles.outlineBtn}
                />
              </View>
            )}

            {step === 'newPin' && (
              <View style={styles.form}>
                <Text style={styles.pinLabel}>New PIN</Text>
                <PinInput value={newPin} onChange={setNewPin} disabled={isLoading} autoFocus />
                <Text style={[styles.pinLabel, styles.pinLabelSpaced]}>Confirm PIN</Text>
                <PinInput value={newPinConfirm} onChange={setNewPinConfirm} disabled={isLoading} />
                <Button
                  title="Save PIN & Continue"
                  onPress={handleNewPinSubmit}
                  disabled={newPin.length !== 4 || newPinConfirm.length !== 4}
                  size="large"
                  style={styles.savePinBtn}
                />
              </View>
            )}
          </AuthShell>
          </ScrollView>

          <View style={styles.termsFooter}>
            <Text style={styles.footerText}>
              By continuing, you agree to our Terms of Service and Privacy Policy
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary50,
  },
  keyboardView: { flex: 1 },
  body: { flex: 1 },
  scrollContent: {
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  form: { marginTop: SPACING.sm },
  hint: {
    fontSize: 12,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: SPACING.md,
    lineHeight: 18,
  },
  linkBtn: { alignItems: 'center', marginTop: SPACING.md },
  linkText: { fontSize: 14, color: COLORS.primary600, fontWeight: '600' },
  outlineBtn: { marginTop: SPACING.md },
  pinLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray700,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  pinLabelSpaced: { marginTop: SPACING.lg },
  savePinBtn: { marginTop: SPACING.lg },
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.gray200 },
  dividerText: {
    paddingHorizontal: SPACING.sm,
    fontSize: 13,
    color: COLORS.gray500,
  },
  registerPrompt: {
    textAlign: 'center',
    fontSize: 14,
    color: COLORS.gray600,
  },
  registerLink: {
    color: COLORS.primary600,
    fontWeight: '700',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.lg,
  },
  securityText: { fontSize: 11, color: COLORS.gray400 },
  footerSpacer: { minHeight: 72 },
  termsFooter: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.xs,
  },
  footerText: { fontSize: 11, color: COLORS.gray500, textAlign: 'center', lineHeight: 16 },
});

export default LoginScreen;
