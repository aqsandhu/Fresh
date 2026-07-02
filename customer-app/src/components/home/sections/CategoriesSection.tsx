import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Category } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

interface CategoriesSectionProps {
  categories: Category[];
  loading: boolean;
  onCategoryPress: (category: Category) => void;
}

/** Mirrors website CategoriesSection — image-tile wall with a dark wash. */
export const CategoriesSection: React.FC<CategoriesSectionProps> = ({
  categories,
  loading,
  onCategoryPress,
}) => {
  if (!loading && categories.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Shop by Category</Text>
        <Text style={styles.urdu}>کیٹیگری کے مطابق خریداری کریں</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary600} style={{ paddingVertical: SPACING.xl }} />
      ) : (
        <View style={styles.grid}>
          {categories.map((category) => {
            const imageUri = category.image || category.imageUrl;
            return (
              <TouchableOpacity
                key={category.id}
                style={styles.tile}
                activeOpacity={0.85}
                onPress={() => onCategoryPress(category)}
              >
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.tileFallback]}>
                    <Text style={styles.tileFallbackText}>{category.name.charAt(0)}</Text>
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.8)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.tileFooter}>
                  <Text style={styles.tileName} numberOfLines={1}>
                    {category.name}
                  </Text>
                  <View style={styles.tileBottomRow}>
                    {!!category.nameUrdu && (
                      <Text style={styles.tileUrdu} numberOfLines={1}>
                        {category.nameUrdu}
                      </Text>
                    )}
                    <MaterialIcons name="arrow-forward" size={14} color="rgba(255,255,255,0.75)" />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingVertical: SPACING.xl, backgroundColor: COLORS.white },
  header: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.gray900, textAlign: 'center' },
  urdu: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gray500,
    marginTop: 4,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    rowGap: SPACING.sm,
  },
  tile: {
    width: '48.5%',
    aspectRatio: 4 / 3,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.gray100,
  },
  tileFallback: {
    backgroundColor: COLORS.primary500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileFallbackText: { fontSize: 36, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  tileFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.sm,
  },
  tileName: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  tileBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  tileUrdu: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)', flexShrink: 1 },
});

export default CategoriesSection;
