import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, ViewStyle, ImageStyle } from 'react-native';
import { fetchBrandLogoSource, getDefaultBrandLogoSource } from '@services/brand.service';

interface BrandLogoProps {
  height?: number;
  style?: ViewStyle;
  imageStyle?: ImageStyle;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  height = 56,
  style,
  imageStyle,
}) => {
  const [source, setSource] = useState<string | number>(getDefaultBrandLogoSource());

  useEffect(() => {
    let cancelled = false;
    fetchBrandLogoSource().then((s) => {
      if (!cancelled) setSource(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Image
      source={typeof source === 'number' ? source : { uri: source }}
      style={[styles.img, { height, width: height * 2.2 }, imageStyle]}
      resizeMode="contain"
      accessibilityLabel="Fresh Bazar logo"
    />
  );
};

const styles = StyleSheet.create({
  img: {
    alignSelf: 'center',
  },
});

export default BrandLogo;
