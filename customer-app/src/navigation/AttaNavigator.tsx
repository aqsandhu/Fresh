import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AttaStackParamList } from '@app-types';
import { AttaChakkiScreen, AttaRequestScreen, AttaTrackingScreen } from '@screens';

const Stack = createNativeStackNavigator<AttaStackParamList>();

export const AttaNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      id="AttaStack"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="AttaChakkiMain" component={AttaChakkiScreen} />
      <Stack.Screen name="AttaRequest" component={AttaRequestScreen} />
      <Stack.Screen name="AttaTracking" component={AttaTrackingScreen} />
    </Stack.Navigator>
  );
};

export default AttaNavigator;
