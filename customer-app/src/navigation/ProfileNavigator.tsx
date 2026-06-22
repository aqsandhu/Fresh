import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '@app-types';
import {
  ProfileScreen,
  EditProfileScreen,
  MyAddressesScreen,
  SettingsScreen,
  NotificationsScreen,
  WishlistScreen,
  AttaChakkiScreen,
  AttaRequestScreen,
  AttaTrackingScreen,
  ChangePinScreen,
  HelpScreen,
  AboutScreen,
  SupportScreen,
  MyReviewsScreen,
  MyComplaintsScreen,
  NewComplaintScreen,
  WorkAsRiderScreen,
} from '@screens';
import { SelectCityScreen } from '@screens/city';
import { StaticPageScreen } from '@screens/info/StaticPageScreen';
import { FranchiseScreen } from '@screens/info/FranchiseScreen';
import { AddAddressScreen } from '@screens/checkout/AddAddressScreen';
import {
  RestaurantLoginScreen,
  RestaurantRegisterScreen,
  RestaurantShopScreen,
  RestaurantCartScreen,
  RestaurantCheckoutScreen,
  RestaurantOrdersScreen,
  RestaurantProfileScreen,
} from '@screens/restaurant';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export const ProfileNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      id="ProfileStack"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="MyAddresses" component={MyAddressesScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Wishlist" component={WishlistScreen} />
      <Stack.Screen name="AttaChakkiMain" component={AttaChakkiScreen} />
      <Stack.Screen name="AttaRequest" component={AttaRequestScreen} />
      <Stack.Screen name="AttaTracking" component={AttaTrackingScreen} />
      <Stack.Screen name="SelectCity" component={SelectCityScreen} />
      <Stack.Screen name="ChangePin" component={ChangePinScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="MyReviews" component={MyReviewsScreen} />
      <Stack.Screen name="MyComplaints" component={MyComplaintsScreen} />
      <Stack.Screen name="NewComplaint" component={NewComplaintScreen} />
      <Stack.Screen name="WorkAsRider" component={WorkAsRiderScreen} />
      <Stack.Screen name="Franchise" component={FranchiseScreen} />
      <Stack.Screen name="RestaurantLogin" component={RestaurantLoginScreen} />
      <Stack.Screen name="RestaurantRegister" component={RestaurantRegisterScreen} />
      <Stack.Screen name="RestaurantShop" component={RestaurantShopScreen} />
      <Stack.Screen name="RestaurantCart" component={RestaurantCartScreen} />
      <Stack.Screen name="RestaurantCheckout" component={RestaurantCheckoutScreen} />
      <Stack.Screen name="RestaurantOrders" component={RestaurantOrdersScreen} />
      <Stack.Screen name="RestaurantProfile" component={RestaurantProfileScreen} />
      <Stack.Screen name="AddAddress" component={AddAddressScreen} />
      <Stack.Screen name="StaticPage" component={StaticPageScreen} />
    </Stack.Navigator>
  );
};

export default ProfileNavigator;
