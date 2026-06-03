import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ShopStackParamList } from '@types';
import {
  ProductsScreen,
  CategoriesListScreen,
  CategoryProductsScreen,
  ProductDetailScreen,
  SearchScreen,
} from '@screens';

const Stack = createNativeStackNavigator<ShopStackParamList>();

export const ShopNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="ProductsMain" component={ProductsScreen} />
      <Stack.Screen name="CategoriesList" component={CategoriesListScreen} />
      <Stack.Screen name="CategoryProducts" component={CategoryProductsScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
    </Stack.Navigator>
  );
};

export default ShopNavigator;
