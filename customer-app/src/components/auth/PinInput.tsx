import React, { useEffect, useRef } from 'react';
import { View, TextInput, StyleSheet, InteractionManager } from 'react-native';

// Reusable 4-digit PIN input. Mirrors the website component's behaviour
// (paste / autofill / backspace / focus chaining) so register / login /
// change-PIN / checkout-reauth all feel the same.

interface PinInputProps {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  mask?: boolean;
}

const LENGTH = 4;

export default function PinInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus = true,
  mask = true,
}: PinInputProps) {
  const refs = useRef<Array<TextInput | null>>([]);
  const cells = (value + '____').slice(0, LENGTH).split('');

  useEffect(() => {
    if (!autoFocus) return;
    const task = InteractionManager.runAfterInteractions(() => {
      refs.current[0]?.focus();
    });
    return () => task.cancel();
  }, [autoFocus]);

  const setCharAt = (index: number, char: string) => {
    const arr = (value + '____')
      .slice(0, LENGTH)
      .split('')
      .map((c) => (c === '_' ? '' : c));
    arr[index] = char;
    const next = arr.join('').replace(/_/g, '');
    onChange(next);
    if (next.length === LENGTH) onComplete?.(next);
  };

  const handleInput = (i: number, raw: string) => {
    if (disabled) return;
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      setCharAt(i, '');
      return;
    }
    if (digits.length > 1) {
      // Paste / autofill — spread digits across cells.
      const arr = (value + '____')
        .slice(0, LENGTH)
        .split('')
        .map((c) => (c === '_' ? '' : c));
      for (let k = 0; k < digits.length && i + k < LENGTH; k++) arr[i + k] = digits[k];
      const next = arr.join('').replace(/_/g, '');
      onChange(next);
      const nextIdx = Math.min(i + digits.length, LENGTH - 1);
      refs.current[nextIdx]?.focus();
      if (next.length === LENGTH) onComplete?.(next);
      return;
    }
    setCharAt(i, digits[0]);
    if (i < LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, key: string) => {
    if (key === 'Backspace' && !cells[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {cells.map((c, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={c === '_' ? '' : c}
          onChangeText={(t) => handleInput(i, t)}
          onKeyPress={({ nativeEvent }) => handleKey(i, nativeEvent.key)}
          editable={!disabled}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={1}
          secureTextEntry={mask}
          style={styles.cell}
          textAlign="center"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  cell: {
    width: 56,
    height: 64,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '700',
    backgroundColor: '#f9fafb',
    color: '#111827',
  },
});
