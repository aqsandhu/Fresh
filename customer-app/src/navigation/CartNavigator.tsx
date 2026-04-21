import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CartStackParamList } from '@types';
import {
  CartScreen,
  AddressSelectionScreen,
  AddAddressScreen,
  TimeSlotScreen,
  OrderConfirmationScreen,
} from '@screens';

const Stack = createNativeStackNavigator<CartStackParamList>();

export const CartNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="AddressSelection" component={AddressSelectionScreen} />
      <Stack.Screen name="AddAddress" component={AddAddressScreen} />
      <Stack.Screen name="TimeSlot" component={TimeSlotScreen} />
      <Stack.Screen
        name="OrderConfirmation"
        component={OrderConfirmationScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
};

export default CartNavigator;
