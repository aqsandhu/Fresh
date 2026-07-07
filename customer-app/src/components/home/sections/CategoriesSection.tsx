import React, { useEffect, useRef, useState } from 'react';
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
import { useCityContext } from '@/context/CityContext';
import { productService } from '@services/product.service';

interface CategoriesSectionProps {
  onCategoryPress: (category: Category) => void;
}

/**
 * Image-tile "Shop by Category" wall — rebuilt to mirror the website's
 * CategoriesSection (bg-white, centred header, 2-col rounded tiles with a
 * bottom wash + name).
 *
 * Data: a plain, self-contained fetch (no react-query cache to go stale). It
 * re-fetches whenever the city changes and RETRIES a few times if the first
 * call lands before the selected-city id has finished hydrating (that race was
 * why the wall kept showing empty even though the left drawer had categories).
 */
export const CategoriesSection: React.FC<CategoriesSectionProps> = ({ onCategoryPress }) => {
  const { selectedCityId } = useCityContext();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!selectedCityId) {
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const run = async () => {
      try {
        const res = await productService.getCategories();
        if (cancelledRef.current) return;
        const list = res.success ? res.data : [];
        // De-dupe by id — the catalog can return the same category twice.
        const seen = new Set<string>();
        const unique = list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));

        if (unique.length > 0) {
          setCategories(unique);
          setLoading(false);
        } else if (attempt < 4) {
          // Empty (city id likely not hydrated yet) → back off and retry.
          attempt += 1;
          timer = setTimeout(run, 700);
        } else {
          setCategories([]);
          setLoading(false);
        }
      } catch {
        if (cancelledRef.current) return;
        if (attempt < 4) {
          attempt += 1;
          timer = setTimeout(run, 700);
        } else {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [selectedCityId]);

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
                  <Image
                    source={{ uri: imageUri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
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
    fontSize: 18,
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
  tileFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACING.sm },
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
