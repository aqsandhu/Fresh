import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, VALIDATION, ERROR_MESSAGES } from '@utils/constants';
import { Button, Input, LoadingOverlay } from '@components';
import { useAuthStore } from '@store';

interface LoginScreenProps {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const { sendOtp, isLoading } = useAuthStore();

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

  const handleLogin = async () => {
    if (!validatePhone(phone)) return;

    try {
      const result = await sendOtp(phone);
      navigation.navigate('OTP', { phone, userExists: result.userExists, userName: result.userName });
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    }
  };

  const formatPhoneInput = (text: string): string => {
    // Remove non-numeric characters
    const numeric = text.replace(/[^0-9]/g, '');
    // Limit to 11 digits
    return numeric.slice(0, 11);
  };

  return (
    <SafeAreaView style={styles.container}>
      <LoadingOverlay visible={isLoading} message="Sending OTP..." />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo and Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <MaterialIcons name="local-grocery-store" size={64} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Welcome to PakGrocery</Text>
            <Text style={styles.subtitle}>Fresh groceries delivered to your door</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Enter your phone number</Text>
            <Input
              placeholder="03XXXXXXXXX"
              value={phone}
              onChangeText={(text) => {
                setPhone(formatPhoneInput(text));
                setError('');
              }}
              keyboardType="phone-pad"
              maxLength={11}
              error={error}
              leftIcon={<MaterialIcons name="phone" size={20} color={COLORS.gray400} />}
              autoFocus
            />

            <Button
              title="Continue"
              onPress={handleLogin}
              disabled={phone.length < 11}
              size="large"
            />

            <Text style={styles.hint}>
              We'll send you a verification code via SMS
            </Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By continuing, you agree to our{' '}
              <Text style={styles.footerLink}>Terms of Service</Text> and{' '}
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginTop: SPACING.xxl,
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: BORDER_RADIUS.xxl,
    backgroundColor: COLORS.primaryLighter,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.gray500,
  },
  form: {
    marginTop: SPACING.xl,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: SPACING.md,
  },
  hint: {
    fontSize: 12,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: SPACING.xl,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});

export default LoginScreen;
