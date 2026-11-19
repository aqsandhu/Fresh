import type { ComponentProps } from 'react';
import type { MaterialIcons } from '@expo/vector-icons';

/** A MaterialIcons glyph name (lists of menu items keep them as plain strings). */
export type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];
