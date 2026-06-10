import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

const FAQ_SECTIONS = [
  {
    title: 'Orders',
    faqs: [
      {
        q: 'How do I place an order?',
        a: 'Browse products, add items to your cart, and proceed to checkout. Pay via Cash on Delivery.',
      },
      {
        q: 'Can I modify my order after placing it?',
        a: 'Orders can be modified within 30 minutes. Contact customer support for help.',
      },
      {
        q: 'How do I track my order?',
        a: 'Go to My Orders and tap your order to see status and tracking details.',
      },
    ],
  },
  {
    title: 'Delivery',
    faqs: [
      {
        q: 'What are the delivery charges?',
        a: 'Delivery is FREE when vegetables + fruits subtotal is Rs. 500 or more, or when you choose a free-delivery slot. Otherwise Rs. 100 applies.',
      },
      {
        q: 'What are the delivery time slots?',
        a: '10AM-2PM (FREE if ordered before 10AM), 2PM-6PM, and 6PM-9PM.',
      },
    ],
  },
  {
    title: 'Payment',
    faqs: [
      {
        q: 'What payment methods do you accept?',
        a: 'We accept Cash on Delivery (COD) and online payment methods where available.',
      },
      {
        q: 'Can I get a refund?',
        a: 'Refunds are available for damaged or incorrect items reported within 24 hours of delivery.',
      },
    ],
  },
];

export const HelpScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Need more help?</Text>
          <TouchableOpacity
            style={styles.contactRow}
            onPress={() => Linking.openURL('tel:03001234567')}
          >
            <MaterialIcons name="phone" size={20} color={COLORS.primary600} />
            <Text style={styles.contactText}>0300-1234567</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.contactRow}
            onPress={() => Linking.openURL('mailto:support@freshbazar.pk')}
          >
            <MaterialIcons name="email" size={20} color={COLORS.primary600} />
            <Text style={styles.contactText}>support@freshbazar.pk</Text>
          </TouchableOpacity>
        </View>

        {FAQ_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.faqs.map((faq) => {
              const key = `${section.title}-${faq.q}`;
              const isOpen = expanded === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.faqItem}
                  onPress={() => setExpanded(isOpen ? null : key)}
                  activeOpacity={0.8}
                >
                  <View style={styles.faqHeader}>
                    <Text style={styles.faqQuestion}>{faq.q}</Text>
                    <MaterialIcons
                      name={isOpen ? 'expand-less' : 'expand-more'}
                      size={22}
                      color={COLORS.gray500}
                    />
                  </View>
                  {isOpen && <Text style={styles.faqAnswer}>{faq.a}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
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
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.gray900 },
  content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  contactCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: SPACING.md,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  contactText: { fontSize: 15, color: COLORS.primary600, fontWeight: '500' },
  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gray500,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  faqItem: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  faqQuestion: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.gray900 },
  faqAnswer: {
    marginTop: SPACING.sm,
    fontSize: 14,
    color: COLORS.gray600,
    lineHeight: 20,
  },
});

export default HelpScreen;
