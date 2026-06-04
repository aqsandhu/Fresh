import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, Text, ViewStyle, ImageStyle } from 'react-native';
import { fetchBrandLogoUrl } from '@services/brand.service';
import { COLORS } from '@utils/constants';

interface BrandLogoProps {
  /** Logo height in px; width follows image aspect ratio */
  height?: number;
  style?: ViewStyle;
  imageStyle?: ImageStyle;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  height = 40,
  style,
  imageStyle,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchBrandLogoUrl().then((u) => {
      if (!cancelled) {
        setUrl(u);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <View style={[styles.placeholder, { height, width: height * 1.5 }, style]} />
    );
  }

  if (!url) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={[styles.fallbackText, { fontSize: height * 0.35 }]}>FB</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={[styles.img, { height }, imageStyle]}
      resizeMode="contain"
      accessibilityLabel="Fresh Bazar logo"
    />
  );
};

const styles = StyleSheet.create({
  img: {
    alignSelf: 'center',
    width: undefined,
    maxWidth: '100%',
  },
  placeholder: {
    alignSelf: 'center',
    backgroundColor: COLORS.gray100,
    borderRadius: 8,
  },
  fallback: { alignSelf: 'center', alignItems: 'center' },
  fallbackText: { fontWeight: '800', color: COLORS.primary700 },
});

export default BrandLogo;
