import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

interface ComingSoonProps {
  titleEn?: string;
  titleUr?: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  messageUr?: string;
}

/**
 * Friendly "feature paused / coming soon" screen. Used to temporarily pause a
 * feature's UI (e.g. Atta Chakki) without removing functionality — flipping the
 * related super-admin flag restores the real screen.
 */
export const ComingSoon: React.FC<ComingSoonProps> = ({
  titleEn = 'Coming Soon',
  titleUr,
  icon = 'schedule',
  messageUr = 'یہ سہولت بہت جلد آپ کے علاقے میں دستیاب ہوگی، انشاء اللّٰہ',
}) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialIcons name={icon} size={40} color={COLORS.primary700} />
        </View>
        <Text style={styles.titleEn}>{titleEn}</Text>
        {titleUr ? <Text style={styles.titleUr}>{titleUr}</Text> : null}
        <Text style={styles.messageUr}>{messageUr}</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary50,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primary100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  titleEn: { fontSize: 24, fontWeight: 'bold', color: COLORS.gray900, textAlign: 'center' },
  titleUr: { fontSize: 18, color: COLORS.primary700, marginTop: 4, textAlign: 'center' },
  messageUr: {
    fontSize: 20,
    lineHeight: 32,
    color: COLORS.gray800,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
});

export default ComingSoon;
