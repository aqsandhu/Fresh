import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CartStackParamList } from '@app-types';
import PinReauthGate from '@components/auth/PinReauthGate';
import {
  CheckoutScreen,
  AddAddressScreen,
  OrderConfirmationScreen,
} from '@screens';

const Stack = createNativeStackNavigator<CartStackParamList>();

const CheckoutWithGate: React.FC = () => (
  <PinReauthGate>
    <CheckoutScreen />
  </PinReauthGate>
);

export const CartNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      id="CartStack"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Checkout" component={CheckoutWithGate} />
      <Stack.Screen name="AddAddress" component={AddAddressScreen} />
      <Stack.Screen
        name="OrderConfirmation"
        component={OrderConfirmationScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
};

export default CartNavigator;
