import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CategoryStackParamList } from '@types';
import { CategoriesListScreen, CategoryProductsScreen, ProductDetailScreen } from '@screens';

const Stack = createNativeStackNavigator<CategoryStackParamList>();

export const CategoryNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="CategoriesList" component={CategoriesListScreen} />
      <Stack.Screen name="CategoryProducts" component={CategoryProductsScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
    </Stack.Navigator>
  );
};

export default CategoryNavigator;
