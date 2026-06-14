import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { GuidanceTips } from '@components';
import { SUPPORT_TIPS } from '@/content/guidanceTips';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'Support'>;

interface Entry {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
  bg: string;
  onPress: (nav: Nav) => void;
}

const ENTRIES: Entry[] = [
  {
    icon: 'add-circle-outline',
    title: 'نئی شکایت درج کریں',
    subtitle: 'کسی بھی مسئلے کی شکایت کریں',
    color: '#b91c1c',
    bg: '#fef2f2',
    onPress: (nav) => nav.navigate('NewComplaint'),
  },
  {
    icon: 'support-agent',
    title: 'میری شکایات',
    subtitle: 'اپنی شکایات اور ان کی پیش رفت دیکھیں',
    color: '#1d4ed8',
    bg: '#eff6ff',
    onPress: (nav) => nav.navigate('MyComplaints'),
  },
  {
    icon: 'star-outline',
    title: 'میرے ریویو',
    subtitle: 'دی گئی درجہ بندیاں اور رائے',
    color: '#b45309',
    bg: '#fffbeb',
    onPress: (nav) => nav.navigate('MyReviews'),
  },
];

export const SupportScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ریویو اور شکایات</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <GuidanceTips tips={SUPPORT_TIPS} />
        {ENTRIES.map((e) => (
          <TouchableOpacity
            key={e.title}
            style={styles.card}
            onPress={() => e.onPress(navigation)}
            activeOpacity={0.8}
          >
            <View style={[styles.iconWrap, { backgroundColor: e.bg }]}>
              <MaterialIcons name={e.icon} size={24} color={e.color} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{e.title}</Text>
              <Text style={styles.cardSubtitle}>{e.subtitle}</Text>
            </View>
            <MaterialIcons name="chevron-left" size={24} color={COLORS.gray400} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  content: { padding: SPACING.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  iconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray900, textAlign: 'right', writingDirection: 'rtl' },
  cardSubtitle: { fontSize: 12, color: COLORS.gray500, marginTop: 2, textAlign: 'right', writingDirection: 'rtl' },
});

export default SupportScreen;
