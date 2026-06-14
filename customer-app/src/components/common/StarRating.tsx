import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface StarRatingProps {
  /** Current rating 0–5. */
  value: number;
  /** When provided the stars become tappable (input mode). */
  onChange?: (rating: number) => void;
  size?: number;
  /** Allows partial fill in display mode (e.g. 4.3 → 4 full + 1 half). */
  allowHalf?: boolean;
  color?: string;
  emptyColor?: string;
}

/**
 * Star rating used both as an input (pass onChange) and a read-only display
 * (omit onChange). In display mode supports half stars for average ratings.
 */
export const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  size = 28,
  allowHalf = false,
  color = '#f59e0b',
  emptyColor = '#d1d5db',
}) => {
  const interactive = typeof onChange === 'function';

  const iconFor = (position: number): keyof typeof MaterialIcons.glyphMap => {
    if (value >= position) return 'star';
    if (allowHalf && value >= position - 0.5) return 'star-half';
    return 'star-border';
  };

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((position) => {
        const name = iconFor(position);
        const filled = name !== 'star-border';
        const star = (
          <MaterialIcons name={name} size={size} color={filled ? color : emptyColor} />
        );
        if (!interactive) {
          return (
            <View key={position} style={styles.star}>
              {star}
            </View>
          );
        }
        return (
          <TouchableOpacity
            key={position}
            style={styles.star}
            onPress={() => onChange!(position)}
            activeOpacity={0.6}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            {star}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  star: { paddingHorizontal: 2 },
});

export default StarRating;
