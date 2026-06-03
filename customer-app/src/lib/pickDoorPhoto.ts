import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Platform } from 'react-native';

export type PickedDoorPhoto = {
  uri: string;
  width: number;
  height: number;
};

/** Opens the gallery without the native crop UI (we use DoorPhotoCropModal instead). */
export async function pickDoorPhotoFromLibrary(): Promise<PickedDoorPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    if (!perm.canAskAgain) {
      Alert.alert(
        'Photo access required',
        'Allow photo access in settings to upload a door picture.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') Linking.openURL('app-settings:');
              else Linking.openSettings();
            },
          },
        ]
      );
    }
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
  };
}
