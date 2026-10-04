import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import Button from '../../components/Button';
import { BrandLogo } from '../../components/BrandLogo';
import { Banner } from '../../components/ui';
import { colors, radius, spacing, typography, shadow, TOUCH_TARGET } from '../../theme';
import { isValidPhoneNumber } from '../../utils/helpers';
import { APP_VERSION } from '../../utils/constants';

const LoginScreen: React.FC = () => {
  const { t } = useT();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const passwordRef = useRef<TextInput>(null);

  const { login, isLoading, error, clearError, sessionEndReason, clearSessionEndReason } = useAuthStore();

  // Clear field errors as the rider types.
  useEffect(() => {
    setPhoneError('');
  }, [phone]);
  useEffect(() => {
    setPasswordError('');
  }, [password]);
  useEffect(() => {
    if (error) clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, password]);

  const validate = (): boolean => {
    let ok = true;
    if (!phone.trim()) {
      setPhoneError(t('auth.phoneRequired'));
      ok = false;
    } else if (!isValidPhoneNumber(phone)) {
      setPhoneError(t('auth.phoneInvalid'));
      ok = false;
    }
    if (!password) {
      setPasswordError(t('auth.passwordRequired'));
      ok = false;
    } else if (password.length < 6) {
      setPasswordError(t('auth.passwordShort'));
      ok = false;
    }
    return ok;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    try {
      // Backend normalises 03xx… / 92xx… itself — send digits only.
      await login({ phone: phone.replace(/\D/g, ''), password });
    } catch {
      // Error is surfaced from the store below.
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={styles.hero}>
            <BrandLogo height={72} />
            <Text style={styles.heroTitle}>{t('auth.title')}</Text>
            <Text style={styles.heroSubtitle}>{t('auth.subtitle')}</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.welcome}>{t('auth.welcome')}</Text>
            <Text style={styles.instruction}>{t('auth.instruction')}</Text>

            {sessionEndReason ? (
              <Banner
                tone="warning"
                icon="account-alert-outline"
                message={sessionEndReason}
                onDismiss={clearSessionEndReason}
                style={styles.banner}
              />
            ) : null}
            {error ? <Banner tone="danger" icon="alert-circle-outline" title={t('auth.errorTitle')} message={error} style={styles.banner} /> : null}

            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.phone')}</Text>
              <View style={[styles.inputWrap, phoneError ? styles.inputError : null]}>
                <MaterialCommunityIcons name="phone-outline" size={22} color={colors.gray500} />
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.phonePlaceholder')}
                  placeholderTextColor={colors.gray400}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={14}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!isLoading}
                  accessibilityLabel={t('auth.phone')}
                  testID="login-phone"
                />
              </View>
              {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.password')}</Text>
              <View style={[styles.inputWrap, passwordError ? styles.inputError : null]}>
                <MaterialCommunityIcons name="lock-outline" size={22} color={colors.gray500} />
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  placeholder={t('auth.passwordPlaceholder')}
                  placeholderTextColor={colors.gray400}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  autoComplete="password"
                  autoCapitalize="none"
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  editable={!isLoading}
                  accessibilityLabel={t('auth.password')}
                  testID="login-password"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eye}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.gray500} />
                </TouchableOpacity>
              </View>
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            </View>

            <Button
              title={isLoading ? t('auth.loggingIn') : t('auth.login')}
              onPress={handleLogin}
              size="large"
              fullWidth
              loading={isLoading}
              icon="login"
              style={styles.submit}
              testID="login-submit"
            />

            <Text style={styles.help}>{t('auth.help')}</Text>
          </View>

          <Text style={styles.version}>{t('common.version', { version: APP_VERSION })}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray900 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  heroTitle: { fontSize: typography.size.xxl, fontWeight: typography.weight.heavy, color: colors.white, marginTop: spacing.md },
  heroSubtitle: { fontSize: typography.size.md, color: colors.gray400, marginTop: spacing.xs },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.raised,
  },
  welcome: { fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: colors.text },
  instruction: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: typography.size.sm * 1.5 },
  banner: { marginBottom: spacing.lg },
  field: { marginBottom: spacing.lg },
  label: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text, marginBottom: spacing.xs },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH_TARGET + 4,
    gap: spacing.sm,
  },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  input: { flex: 1, fontSize: typography.size.lg, color: colors.text, paddingVertical: spacing.sm },
  eye: { padding: spacing.xs },
  errorText: { fontSize: typography.size.sm, color: colors.danger, marginTop: spacing.xs },
  submit: { marginTop: spacing.sm },
  help: { fontSize: typography.size.sm, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  version: { textAlign: 'center', fontSize: typography.size.xs, color: colors.gray500, marginTop: spacing.xl },
});

export default LoginScreen;
