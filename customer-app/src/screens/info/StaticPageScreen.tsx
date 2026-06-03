import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { STATIC_PAGES, StaticPageId } from '@/content/staticPages';

type StaticPageRoute = RouteProp<ProfileStackParamList, 'StaticPage'>;

export const StaticPageScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const route = useRoute<StaticPageRoute>();
  const pageId = route.params.pageId as StaticPageId;
  const content = STATIC_PAGES[pageId];

  if (!content) {
    return null;
  }

  const handleSectionPress = (body: string) => {
    const phoneMatch = body.match(/03\d{2}[-\s]?\d{7}/);
    const emailMatch = body.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (phoneMatch) Linking.openURL(`tel:${phoneMatch[0].replace(/\D/g, '')}`);
    else if (emailMatch) Linking.openURL(`mailto:${emailMatch[0]}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {content.title}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{content.title}</Text>
          {content.subtitle ? (
            <Text style={styles.heroSubtitle}>{content.subtitle}</Text>
          ) : null}
        </View>

        {content.sections.map((section) => (
          <TouchableOpacity
            key={section.title}
            style={styles.sectionCard}
            activeOpacity={pageId === 'contact' ? 0.7 : 1}
            onPress={() => pageId === 'contact' && handleSectionPress(section.body)}
          >
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
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
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: COLORS.gray900 },
  content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  hero: {
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    alignItems: 'center',
  },
  heroTitle: { fontSize: 22, fontWeight: '700', color: COLORS.white, textAlign: 'center' },
  heroSubtitle: { fontSize: 14, color: COLORS.primary100, marginTop: SPACING.sm, textAlign: 'center' },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray900, marginBottom: SPACING.sm },
  sectionBody: { fontSize: 14, color: COLORS.gray600, lineHeight: 22 },
});

export default StaticPageScreen;
