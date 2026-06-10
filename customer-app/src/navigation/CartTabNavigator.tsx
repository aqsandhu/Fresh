import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CartTabStackParamList } from '@app-types';
import { CartScreen } from '@screens';

const Stack = createNativeStackNavigator<CartTabStackParamList>();

/** Cart tab stack — mirrors website /cart as a bottom-nav destination. */
export const CartTabNavigator: React.FC = () => {
  return (
    <Stack.Navigator id="CartTabStack" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CartMain" component={CartScreen} />
    </Stack.Navigator>
  );
};

export default CartTabNavigator;
