import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import type { ServiceAreaMessage } from '@/lib/serviceArea';

interface ServiceAreaModalProps {
  visible: boolean;
  onClose: () => void;
  message: ServiceAreaMessage;
}

/** Build a WhatsApp deep link from a number or full URL (mirrors website). */
function buildWhatsAppUrl(raw: string): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const intl = digits.startsWith('92')
    ? digits
    : digits.startsWith('0')
      ? `92${digits.slice(1)}`
      : `92${digits}`;
  return `https://wa.me/${intl}`;
}

/** Shown when a customer's delivery pin is outside the city's active boundary. */
export const ServiceAreaModal: React.FC<ServiceAreaModalProps> = ({
  visible,
  onClose,
  message,
}) => {
  const waUrl = buildWhatsAppUrl(message?.whatsapp || '');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.close} onPress={onClose}>
            <MaterialIcons name="close" size={22} color={COLORS.gray400} />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <MaterialIcons name="location-off" size={36} color="#d97706" />
          </View>

          <Text style={styles.title}>{message?.title || "We're not in your area yet"}</Text>
          {!!message?.message_en && <Text style={styles.msgEn}>{message.message_en}</Text>}
          {!!message?.message_ur && <Text style={styles.msgUr}>{message.message_ur}</Text>}

          {waUrl && (
            <TouchableOpacity
              style={styles.waBtn}
              onPress={() => Linking.openURL(waUrl)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="chat" size={20} color={COLORS.white} />
              <Text style={styles.waBtnText}>Send feedback on WhatsApp</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
            <Text style={styles.secondaryBtnText}>Choose a different location</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  close: { position: 'absolute', top: SPACING.md, right: SPACING.md, padding: 4 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.gray900, textAlign: 'center' },
  msgEn: { fontSize: 14, color: COLORS.gray600, textAlign: 'center', marginTop: SPACING.sm },
  msgUr: {
    fontSize: 18,
    lineHeight: 28,
    color: COLORS.gray800,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: '#16a34a',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    width: '100%',
    marginTop: SPACING.lg,
  },
  waBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  secondaryBtnText: { color: COLORS.gray600, fontWeight: '600' },
});

export default ServiceAreaModal;
