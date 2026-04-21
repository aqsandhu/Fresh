import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CategoryStackParamList, Category } from '@types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { ErrorView, SkeletonList } from '@components';
import { productService } from '@services/product.service';

export const CategoriesListScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CategoryStackParamList>>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      setError(null);
      const response = await productService.getCategories();
      if (response.success) {
        setCategories(response.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCategories();
  };

  const handleCategoryPress = (category: Category) => {
    navigation.navigate('CategoryProducts', {
      categoryId: category.id,
      categoryName: category.name,
    });
  };

  const renderCategory = ({ item }: { item: Category }) => (
    <TouchableOpacity
      style={styles.categoryCard}
      onPress={() => handleCategoryPress(item)}
      activeOpacity={0.9}
    >
      <Image source={{ uri: item.image }} style={styles.categoryImage} />
      <View style={[styles.overlay, { backgroundColor: item.color + 'CC' }]} />
      <View style={styles.categoryContent}>
        <MaterialCommunityIcons
          name={item.icon as any}
          size={40}
          color={COLORS.white}
        />
        <View style={styles.textContainer}>
          <Text style={styles.categoryName}>{item.name}</Text>
          <Text style={styles.categoryNameUrdu}>{item.nameUrdu}</Text>
          <Text style={styles.productCount}>{item.productCount} products</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadCategories} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Categories</Text>
        <Text style={styles.subtitle}>Browse all categories</Text>
      </View>

      {loading ? (
        <SkeletonList count={5} />
      ) : (
        <FlatList
          data={categories}
          renderItem={renderCategory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
};

import { Text } from 'react-native';

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
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray900,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 4,
  },
  list: {
    padding: SPACING.lg,
  },
  categoryCard: {
    height: 120,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  categoryImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  categoryContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  textContainer: {
    marginLeft: SPACING.md,
  },
  categoryName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  categoryNameUrdu: {
    fontSize: 14,
    color: COLORS.white + 'CC',
    marginTop: 2,
  },
  productCount: {
    fontSize: 12,
    color: COLORS.white + 'AA',
    marginTop: 4,
  },
});

export default CategoriesListScreen;
