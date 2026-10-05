import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useT, TranslationKey } from '../../i18n';
import { ScreenHeader, Card } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme';

const STEPS: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: TranslationKey; body: TranslationKey }[] = [
  { icon: 'power', title: 'help.step1Title', body: 'help.step1Body' },
  { icon: 'clipboard-check-outline', title: 'help.step2Title', body: 'help.step2Body' },
  { icon: 'cash-check', title: 'help.step3Title', body: 'help.step3Body' },
  { icon: 'alert-circle-outline', title: 'help.step4Title', body: 'help.step4Body' },
  { icon: 'wallet-outline', title: 'help.step5Title', body: 'help.step5Body' },
];

const HelpScreen: React.FC = () => {
  const { t } = useT();
  const navigation = useNavigation();
  return (
    <View style={styles.container}>
      <ScreenHeader title={t('help.title')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {STEPS.map((step) => (
          <Card key={step.title} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.icon}>
                <MaterialCommunityIcons name={step.icon} size={24} color={colors.primaryDark} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.title}>{t(step.title)}</Text>
                <Text style={styles.body}>{t(step.body)}</Text>
              </View>
            </View>
          </Card>
        ))}
        <Text style={styles.footer}>{t('auth.help')}</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.text },
  body: { fontSize: typography.size.md, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: typography.size.md * 1.5 },
  footer: { textAlign: 'center', fontSize: typography.size.sm, color: colors.textMuted, marginTop: spacing.lg },
});

export default HelpScreen;
