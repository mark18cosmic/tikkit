import { Platform, useWindowDimensions } from 'react-native';

import { maxGridWidth, space } from '@/theme/tokens';

// Phone: single column rows. Tablet: 2 columns. Desktop: 3 to 4 columns,
// top navigation instead of bottom tabs, and two-pane detail screens.
export function useLayout() {
  const { width } = useWindowDimensions();
  const columns = width >= 1360 ? 4 : width >= 1024 ? 3 : width >= 700 ? 2 : 1;
  const gutter = Math.max(width >= 1024 ? space.xl : space.md, (width - maxGridWidth) / 2);
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  return { width, columns, gutter, isWide: columns > 1, isDesktop };
}
