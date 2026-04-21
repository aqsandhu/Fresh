import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { Category } from '@types';

interface CategoryCardProps {
  category: Category;
  onPress?: (category: Category) => void;
  size?: 'small' | 'medium' | 'large';
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  onPress,
  size = 'medium',
}) => {
  const [imageError, setImageError] = useState(false);
  const hasImage = !!category.image && !imageError;

  const sizeStyles = {
    small: { container: 70, icon: 28 },
    medium: { container: 90, icon: 36 },
    large: { container: 110, icon: 44 },
  };

  const { container, icon } = sizeStyles[size];

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { width: container, height: container + 30 },
      ]}
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
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray800,
    textAlign: 'center',
  },
  nameUrdu: {
    fontSize: 10,
    color: COLORS.gray500,
    textAlign: 'center',
  },
});

export default CategoryCard;
