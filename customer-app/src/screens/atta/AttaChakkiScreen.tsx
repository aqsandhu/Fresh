import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { AttaStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, ATTA_CHAKKI } from '@utils/constants';
import { Button } from '@components';
import { formatCurrency } from '@utils/helpers';

export const AttaChakkiScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AttaStackParamList>>();

  const features = [
    {
      icon: 'cleaning-services',
      title: 'Hygienic Process',
      description: 'Your wheat is ground in a clean, sanitized environment',
    },
    {
      icon: 'schedule',
      title: 'Quick Service',
      description: 'Get your atta ready in just 2 hours',
    },
    {
      icon: 'local-shipping',
      title: 'Free Pickup & Delivery',
      description: 'We pick up your wheat and deliver fresh atta',
    },
    {
      icon: 'verified',
      title: 'Quality Guaranteed',
      description: '100% pure wheat flour with no additives',
    },
  ];

  const steps = [
    { number: '1', title: 'Place Request', description: 'Enter wheat weight and address' },
    { number: '2', title: 'We Pick Up', description: 'Our rider collects your wheat' },
    { number: '3', title: 'Grinding', description: 'Your wheat is ground fresh' },
    { number: '4', title: 'Delivery', description: 'Fresh atta delivered to your door' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Atta Chakki</Text>
          <Text style={styles.subtitle}>Fresh wheat grinding service</Text>
        </View>

        {/* Hero Image */}
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600' }}
            style={styles.heroImage}
          />
          <View style={styles.priceBadge}>
            <Text style={styles.priceText}>
              {formatCurrency(ATTA_CHAKKI.PRICE_PER_KG)}
            </Text>
            <Text style={styles.priceUnit}>/kg</Text>
          </View>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Why Choose Us?</Text>
          <View style={styles.featuresGrid}>
            {features.map((feature, index) => (
              <View key={index} style={styles.featureCard}>
                <View style={styles.featureIcon}>
                  <MaterialIcons
                    name={feature.icon as any}
                    size={24}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>
                  {feature.description}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* How It Works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.stepsContainer}>
            {steps.map((step, index) => (
              <View key={index} style={styles.stepItem}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{step.number}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </View>
                {index < steps.length - 1 && (
                  <View style={styles.stepConnector} />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* CTA Button */}
      <View style={styles.footer}>
        <Button
          title="Request Atta Grinding"
          onPress={() => navigation.navigate('AttaRequest')}
          size="large"
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.gray500,
    marginTop: 4,
  },
  heroContainer: {
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: 200,
  },
  priceBadge: {
    position: 'absolute',
    bottom: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  priceText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  priceUnit: {
    fontSize: 14,
    color: COLORS.white,
    marginLeft: 2,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: SPACING.md,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -SPACING.xs,
  },
  featureCard: {
    width: '50%',
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.md,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primaryLighter,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 12,
    color: COLORS.gray500,
    lineHeight: 16,
  },
  stepsContainer: {
    paddingLeft: SPACING.md,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
    position: 'relative',
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  stepContent: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  stepDescription: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 2,
  },
  stepConnector: {
    position: 'absolute',
    left: 18,
    top: 36,
    width: 2,
    height: SPACING.lg + 8,
    backgroundColor: COLORS.primary + '40',
  },
  bottomPadding: {
    height: 100,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
});

export default AttaChakkiScreen;
