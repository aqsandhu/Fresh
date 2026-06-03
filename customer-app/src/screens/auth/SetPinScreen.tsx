import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Toast from 'react-native-toast-message';
import { AuthStackParamList, RootStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { finishAuthRedirect } from '@utils/authRedirect';
import PinInput from '@components/auth/PinInput';
import { useAuthStore } from '@store';
import { setLastPhone } from '@/lib/phoneStorage';

type SetPinScreenProps = NativeStackScreenProps<AuthStackParamList, 'SetPin'>;
type Stage = 'create' | 'confirm';

export const SetPinScreen: React.FC<SetPinScreenProps> = ({ route }) => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { phone, redirect } = route.params ?? {};
  const { setPin, isLoading } = useAuthStore();
  const [stage, setStage] = useState<Stage>('create');
  const [pin, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  const handleFirst = (entered: string) => {
    setPinValue(entered);
    setPinConfirm('');
    setStage('confirm');
  };

  const handleConfirm = async (entered: string) => {
    if (entered !== pin) {
      Toast.show({ type: 'error', text1: 'PINs do not match. Try again.' });
      setStage('create');
      setPinValue('');
      setPinConfirm('');
      return;
    }
    try {
      await setPin(entered);
      if (phone) await setLastPhone(phone);
      Toast.show({ type: 'success', text1: 'PIN set! You can use it next time you log in.' });
      finishAuthRedirect(rootNavigation, redirect);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.message || 'Failed to save PIN' });
      setStage('create');
      setPinValue('');
      setPinConfirm('');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
      </TouchableOpacity>

      <View style={styles.card}>
        <View style={styles.iconBox}>
          <MaterialIcons name="lock" size={32} color={COLORS.primary700} />
        </View>
        <Text style={styles.title}>
          {stage === 'create' ? 'Choose your 4-digit PIN' : 'Confirm your PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {stage === 'create'
            ? 'You will use this PIN every time you login — quick and easy, no OTP needed.'
            : 'Enter the same PIN again to confirm.'}
        </Text>
        <PinInput
          key={stage}
          value={stage === 'create' ? pin : pinConfirm}
          onChange={stage === 'create' ? setPinValue : setPinConfirm}
          onComplete={stage === 'create' ? handleFirst : handleConfirm}
          disabled={isLoading}
        />
        {isLoading && (
          <ActivityIndicator color={COLORS.primary600} style={{ marginTop: SPACING.md }} />
        )}
        {stage === 'confirm' && !isLoading && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              setStage('create');
              setPinValue('');
              setPinConfirm('');
            }}
          >
            <Text style={styles.resetText}>Start over</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary50,
    padding: SPACING.lg,
  },
  backButton: {
    marginBottom: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.gray900,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.gray500,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  resetBtn: {
    marginTop: SPACING.lg,
  },
  resetText: {
    fontSize: 14,
    color: COLORS.gray500,
  },
});

export default SetPinScreen;
