import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  SafeAreaView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

type Props = {
  visible: boolean;
  imageUri: string | null;
  imageWidth?: number;
  imageHeight?: number;
  onCancel: () => void;
  onConfirm: (uri: string) => void;
};

/** Center square crop — avoids the dim native iOS/Android crop sheet. */
async function cropCenterSquare(
  uri: string,
  width: number,
  height: number
): Promise<string> {
  const size = Math.min(width || 0, height || 0);
  if (size < 1) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  }

  const originX = Math.max(0, Math.floor((width - size) / 2));
  const originY = Math.max(0, Math.floor((height - size) / 2));

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: size, height: size } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

export const DoorPhotoCropModal: React.FC<Props> = ({
  visible,
  imageUri,
  imageWidth = 0,
  imageHeight = 0,
  onCancel,
  onConfirm,
}) => {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const previewHeight = Math.min(screenH * 0.55, 420);
  const [busy, setBusy] = useState(false);

  const finish = useCallback(
    async (doCrop: boolean) => {
      if (!imageUri) return;
      setBusy(true);
      try {
        const out = doCrop
          ? await cropCenterSquare(imageUri, imageWidth, imageHeight)
          : (
              await ImageManipulator.manipulateAsync(imageUri, [], {
                compress: 0.85,
                format: ImageManipulator.SaveFormat.JPEG,
              })
            ).uri;
        onConfirm(out);
      } finally {
        setBusy(false);
      }
    },
    [imageUri, imageWidth, imageHeight, onConfirm]
  );

  if (!imageUri) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onCancel}
            disabled={busy}
            style={styles.headerBtn}
            accessibilityLabel="Cancel"
          >
            <MaterialIcons name="close" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Door photo</Text>
          <View style={styles.headerBtn} />
        </View>

        <View style={[styles.previewWrap, { height: previewHeight, width: screenW }]}>
          <Image
            source={{ uri: imageUri }}
            style={styles.previewImage}
            resizeMode="contain"
          />
          <View style={styles.frameOverlay} pointerEvents="none">
            <View style={[styles.cropFrame, { width: screenW * 0.78, height: screenW * 0.78 }]} />
          </View>
        </View>

        <Text style={styles.hint}>
          Crop to the square frame with "Crop & use", or keep the whole image with "Use full photo".
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.secondaryBtn, busy && styles.btnDisabled]}
            onPress={() => void finish(false)}
            disabled={busy}
          >
            <MaterialIcons name="photo" size={20} color={COLORS.primary700} />
            <Text style={styles.secondaryBtnText}>Use full photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={() => void finish(true)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <MaterialIcons name="crop" size={22} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>Crop & use</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.white,
  },
  previewWrap: {
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropFrame: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  hint: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    lineHeight: 20,
  },
  actions: {
    marginTop: 'auto',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary600,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.lg,
    minHeight: 52,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.primary200,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary700,
  },
  btnDisabled: {
    opacity: 0.65,
  },
});

export default DoorPhotoCropModal;
