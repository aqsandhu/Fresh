import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@types';

/** Post-auth navigation — mirrors website `redirect` query param handling. */
export function finishAuthRedirect(
  rootNavigation: NativeStackNavigationProp<RootStackParamList> | undefined,
  redirect?: string
) {
  rootNavigation?.goBack();

  if (!redirect) return;

  switch (redirect) {
    case 'CartFlow':
      rootNavigation?.navigate('CartFlow', { screen: 'Checkout' });
      break;
    case 'Orders':
      rootNavigation?.navigate('Main', {
        screen: 'Orders',
        params: { screen: 'OrdersList' },
      });
      break;
    case 'Profile':
      rootNavigation?.navigate('Main', { screen: 'Profile' });
      break;
    case 'Cart':
      rootNavigation?.navigate('Main', { screen: 'Cart' });
      break;
    default:
      break;
  }
}
