import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import Button from '../../components/Button';
import LoadingSpinner from '../../components/LoadingSpinner';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../utils/constants';
import { getTranslation, isValidPhoneNumber, formatPhoneNumber } from '../../utils/helpers';

interface LoginScreenProps {
  navigation: any;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const { login, isLoading, error, clearError } = useAuthStore();
  const { language } = useSettingsStore();

  // Clear errors when inputs change
  useEffect(() => {
    if (phoneError) setPhoneError('');
    if (passwordError) setPasswordError('');
    if (error) clearError();
  }, [phone, password]);

  // Show error alert
  useEffect(() => {
    if (error) {
      Alert.alert(
        getTranslation('errorLogin', language),
        error,
        [{ text: 'OK', onPress: clearError }]
      );
    }
  }, [error]);

  const validateInputs = (): boolean => {
    let isValid = true;

    if (!phone.trim()) {
      setPhoneError(language === 'ur' ? 'فون نمبر درج کریں' : 'Enter phone number');
      isValid = false;
    } else if (!isValidPhoneNumber(phone)) {
      setPhoneError(language === 'ur' ? 'درست فون نمبر درج کریں' : 'Enter valid phone number');
      isValid = false;
    }

    if (!password.trim()) {
      setPasswordError(language === 'ur' ? 'پاس ورڈ درج کریں' : 'Enter password');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError(language === 'ur' ? 'پاس ورڈ کم از کم 6 حروف کا ہونا چاہیے' : 'Password must be at least 6 characters');
      isValid = false;
    }

    return isValid;
  };

  const handleLogin = async () => {
    if (!validateInputs()) return;

    try {
      // Format phone number before sending
      const formattedPhone = phone.replace(/\D/g, '');
      const cleanPhone = formattedPhone.startsWith('0') 
        ? formattedPhone.slice(1) 
        : formattedPhone;

      await login({
        phone: cleanPhone,
        password,
      });
    } catch (err) {
      // Error is handled by the store
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner
          message={language === 'ur' ? 'لاگ ان ہو رہا ہے...' : 'Logging in...'}
          fullScreen
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo Section */}
          <View style={styles.logoSection}>
            <View style={styles.logoContainer}>
              <MaterialCommunityIcons
                name="motorbike"
                size={80}
                color={COLORS.primary}
              />
            </View>
            <Text style={styles.appTitle}>
              {language === 'ur' ? 'رائیڈر ایپ' : 'Rider App'}
            </Text>
            <Text style={styles.appSubtitle}>
              {language === 'ur'
                ? 'گروسری ڈیلیوری پلیٹ فارم'
                : 'Grocery Delivery Platform'}
            </Text>
          </View>

          {/* Login Form */}
          <View style={styles.formContainer}>
            <Text style={styles.welcomeText}>
              {language === 'ur' ? 'خوش آمدید' : 'Welcome Back!'}
            </Text>
            <Text style={styles.instructionText}>
              {language === 'ur'
                ? 'اپنے اکاؤنٹ میں لاگ ان کریں'
                : 'Sign in to your account'}
            </Text>

            {/* Phone Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>
                {getTranslation('phoneNumber', language)}
              </Text>
              <View style={[styles.inputWrapper, phoneError && styles.inputError]}>
                <MaterialCommunityIcons
                  name="phone"
                  size={20}
                  color={COLORS.gray500}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={getTranslation('enterPhone', language)}
                  placeholderTextColor={COLORS.gray400}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={11}
                  autoCapitalize="none"
                />
              </View>
              {phoneError ? (
                <Text style={styles.errorText}>{phoneError}</Text>
              ) : null}
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>
                {getTranslation('password', language)}
              </Text>
              <View style={[styles.inputWrapper, passwordError && styles.inputError]}>
                <MaterialCommunityIcons
                  name="lock"
                  size={20}
                  color={COLORS.gray500}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={getTranslation('enterPassword', language)}
                  placeholderTextColor={COLORS.gray400}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <MaterialCommunityIcons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={COLORS.gray500}
                  />
                </TouchableOpacity>
              </View>
              {passwordError ? (
                <Text style={styles.errorText}>{passwordError}</Text>
              ) : null}
            </View>

            {/* Login Button */}
            <Button
              title={getTranslation('login', language)}
              onPress={handleLogin}
              variant="primary"
              size="large"
              fullWidth
              loading={isLoading}
              icon="login"
              style={styles.loginButton}
            />

            {/* Help Text */}
            <View style={styles.helpContainer}>
              <Text style={styles.helpText}>
                {language === 'ur'
                  ? 'مسئلہ ہے؟ ایڈمن سے رابطہ کریں'
                  : 'Having trouble? Contact admin'}
              </Text>
            </View>
          </View>

          {/* Version */}
          <Text style={styles.versionText}>v1.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: BORDER_RADIUS.xxl,
    backgroundColor: `${COLORS.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  appTitle: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  appSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  formContainer: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    shadowColor: COLORS.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  welcomeText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  inputContainer: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  inputError: {
    borderColor: COLORS.danger,
    backgroundColor: `${COLORS.danger}05`,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
  },
  eyeIcon: {
    padding: SPACING.xs,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.danger,
    marginTop: SPACING.xs,
  },
  loginButton: {
    marginTop: SPACING.md,
  },
  helpContainer: {
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  helpText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  versionText: {
    textAlign: 'center',
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.lg,
  },
});

export default LoginScreen;
