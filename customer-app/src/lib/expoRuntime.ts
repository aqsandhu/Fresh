import Constants from 'expo-constants';

/** True when running inside the Expo Go client (not a dev/production build). */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

/** SDK 53+ removed remote push from Expo Go — skip notification APIs there. */
export function supportsRemotePush(): boolean {
  return !isExpoGo();
}
