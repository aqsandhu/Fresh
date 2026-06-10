import React from 'react';

import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

import { Category } from '@app-types';

import { COLORS, SPACING } from '@utils/constants';

import { CategoryCard } from '@components';



interface CategoriesSectionProps {

  categories: Category[];

  loading: boolean;

  onCategoryPress: (category: Category) => void;

}



/** Mirrors website/components/sections/CategoriesSection.tsx — vertical grid on mobile */

export const CategoriesSection: React.FC<CategoriesSectionProps> = ({

  categories,

  loading,

  onCategoryPress,

}) => (

  <View style={styles.wrap}>

    <View style={styles.header}>

      <Text style={styles.title}>Shop by Category</Text>

      <Text style={styles.urdu}>کیٹیگری کے مطابق خریداری کریں</Text>

    </View>



    {loading ? (

      <ActivityIndicator color={COLORS.primary600} style={{ paddingVertical: SPACING.xl }} />

    ) : categories.length === 0 ? (

      <Text style={styles.empty}>No categories available at the moment.</Text>

    ) : (

      <View style={styles.grid}>

        {categories.map((item) => (

          <CategoryCard

            key={item.id}

            category={item}

            variant="row"

            onPress={onCategoryPress}

          />

        ))}

      </View>

    )}

  </View>

);



const styles = StyleSheet.create({

  wrap: { paddingVertical: SPACING.xl, backgroundColor: COLORS.white },

  header: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg, alignItems: 'center' },

  title: { fontSize: 26, fontWeight: '700', color: COLORS.gray900, textAlign: 'center' },

  urdu: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.gray700,
    marginTop: 4,
    textAlign: 'center',
  },

  empty: { textAlign: 'center', color: COLORS.gray500, paddingVertical: SPACING.xl },

  grid: { paddingHorizontal: SPACING.lg },

});



export default CategoriesSection;

