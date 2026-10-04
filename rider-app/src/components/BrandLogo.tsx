import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, Text, ImageStyle } from 'react-native';
import { fetchBrandLogoUrl } from '../services/brand.service';
import { colors, radius } from '../theme';

interface BrandLogoProps {
  height?: number;
  imageStyle?: ImageStyle;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ height = 64, imageStyle }) => {
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
    return <View style={[styles.placeholder, { height, width: height * 1.5 }]} />;
  }

  if (!url) {
    return (
      <View style={[styles.fallback, { height, width: height, borderRadius: height / 4 }]}>
        <Text style={[styles.fallbackText, { fontSize: height * 0.38 }]}>FB</Text>
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
  img: { alignSelf: 'center', width: undefined, maxWidth: '100%', aspectRatio: 2.5 },
  placeholder: { alignSelf: 'center', backgroundColor: colors.gray100, borderRadius: radius.md },
  fallback: { alignSelf: 'center', backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontWeight: '800', color: colors.white },
});

export default BrandLogo;
