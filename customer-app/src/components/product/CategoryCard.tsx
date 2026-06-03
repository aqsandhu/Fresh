import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Category } from '@types';

interface CategoryCardProps {
  category: Category;
  onPress?: (category: Category) => void;
  size?: 'small' | 'medium' | 'large';
  /** row = website default CategoryCard; grid = compact icon tile */
  variant?: 'grid' | 'row';
}

/** Mirrors website/components/ui/CategoryCard.tsx default row layout */
export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  onPress,
  size = 'medium',
  variant = 'grid',
}) => {
  const [imageError, setImageError] = useState(false);
  const hasImage = !!category.image && !imageError;

  if (variant === 'row') {
    return (
      <TouchableOpacity
        style={styles.rowCard}
        onPress={() => onPress?.(category)}
        activeOpacity={0.85}
      >
        <View style={styles.rowImageWrap}>
          {hasImage ? (
            <Image
              source={{ uri: category.image }}
              style={styles.rowImage}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={[styles.rowFallback, { backgroundColor: category.color + '33' }]}>
              <Text style={[styles.rowFallbackText, { color: category.color }]}>
                {category.name.charAt(0)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>
            {category.name}
          </Text>
          {category.nameUrdu ? (
            <Text style={styles.rowUrdu} numberOfLines={1}>
              {category.nameUrdu}
            </Text>
          ) : null}
          <Text style={styles.rowCount}>{category.productCount} items</Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={COLORS.gray400} />
      </TouchableOpacity>
    );
  }

  const sizeStyles = {
    small: { container: 70, icon: 28 },
    medium: { container: 90, icon: 36 },
    large: { container: 110, icon: 44 },
  };

  const { container, icon } = sizeStyles[size];

  return (
    <TouchableOpacity
      style={[styles.container, { width: container, height: container + 30 }]}
      onPress={() => onPress?.(category)}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.iconContainer,
          { width: container, height: container, backgroundColor: category.color + '20' },
        ]}
      >
        {hasImage ? (
          <Image
            source={{ uri: category.image }}
            style={{ width: container - 16, height: container - 16, borderRadius: BORDER_RADIUS.lg }}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <MaterialCommunityIcons
            name={category.icon as any}
            size={icon}
            color={category.color}
          />
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {category.name}
      </Text>
      <Text style={styles.nameUrdu} numberOfLines={1}>
        {category.nameUrdu}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  iconContainer: {
    borderRadius: BORDER_RADIUS.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray800,
    textAlign: 'center',
  },
  nameUrdu: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray700,
    textAlign: 'center',
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  rowImageWrap: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  rowImage: { width: '100%', height: '100%' },
  rowFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowFallbackText: { fontSize: 24, fontWeight: '700' },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 17, fontWeight: '600', color: COLORS.gray900 },
  rowUrdu: { fontSize: 15, fontWeight: '700', color: COLORS.gray700, marginTop: 2, textAlign: 'right' },
  rowCount: { fontSize: 11, color: COLORS.gray400, marginTop: 4 },
});

export default CategoryCard;
