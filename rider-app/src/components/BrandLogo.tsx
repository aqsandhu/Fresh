import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, Text, ImageStyle } from 'react-native';
import { fetchBrandLogoUrl } from '../services/brand.service';
import { COLORS } from '../utils/constants';

interface BrandLogoProps {
  height?: number;
  imageStyle?: ImageStyle;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ height = 80, imageStyle }) => {
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
    return <View style={[styles.placeholder, { height, width: height * 2 }]} />;
  }

  if (!url) {
    return (
      <View style={styles.fallback}>
        <Text style={[styles.fallbackText, { fontSize: height * 0.3 }]}>FB</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={[styles.img, { height, width: height * 2.2 }, imageStyle]}
      resizeMode="contain"
      accessibilityLabel="Fresh Bazar logo"
    />
  );
};

const styles = StyleSheet.create({
  img: { alignSelf: 'center' },
  placeholder: {
    alignSelf: 'center',
    backgroundColor: COLORS.gray100,
    borderRadius: 8,
  },
  fallback: { alignSelf: 'center' },
  fallbackText: { fontWeight: '800', color: COLORS.primary },
});

export default BrandLogo;
