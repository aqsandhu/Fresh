import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { ProfileStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import PinInput from '@components/auth/PinInput';
import { useAuthStore } from '@store';
import { authService } from '@services/auth.service';

type Stage = 'create' | 'confirm';

export const ChangePinScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { markPinVerified } = useAuthStore();
  const [stage, setStage] = useState<Stage>('create');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFirst = (entered: string) => {
    setPin(entered);
    setPinConfirm('');
    setStage('confirm');
  };

  const handleConfirm = async (entered: string) => {
    if (entered !== pin) {
      Toast.show({ type: 'error', text1: 'PINs do not match. Try again.' });
      setStage('create');
      setPin('');
      setPinConfirm('');
      return;
    }
    setSaving(true);
    try {
      await authService.setPin(entered);
      markPinVerified();
      Toast.show({ type: 'success', text1: 'PIN updated' });
      navigation.goBack();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.message || 'Could not update PIN' });
      setStage('create');
      setPin('');
      setPinConfirm('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change PIN</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.card}>
        <View style={styles.iconBox}>
          <MaterialIcons name="verified-user" size={28} color={COLORS.primary700} />
        </View>
        <Text style={styles.title}>
          {stage === 'create' ? 'Enter your new 4-digit PIN' : 'Re-enter to confirm'}
        </Text>
        <PinInput
          key={stage}
          value={stage === 'create' ? pin : pinConfirm}
          onChange={stage === 'create' ? setPin : setPinConfirm}
          onComplete={stage === 'create' ? handleFirst : handleConfirm}
          disabled={saving}
        />
        {saving && <ActivityIndicator color={COLORS.primary600} style={{ marginTop: SPACING.md }} />}
        {stage === 'confirm' && !saving && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              setStage('create');
              setPin('');
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
  container: { flex: 1, backgroundColor: COLORS.primary50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.gray900 },
  card: {
    margin: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    alignItems: 'center',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primary100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: { fontSize: 16, fontWeight: '600', color: COLORS.gray800, marginBottom: SPACING.lg, textAlign: 'center' },
  resetBtn: { marginTop: SPACING.lg },
  resetText: { color: COLORS.primary600, fontWeight: '600' },
});

export default ChangePinScreen;
