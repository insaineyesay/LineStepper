import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';

/**
 * Bottom padding for screens inside a tab (event, crew, member, forms,
 * credits). On phones the tab bar floats over the content, so without this
 * the last thing on the screen (often the Save or Post button) sits under it.
 * The tab roots get the same room from their SafeAreaView + BottomTabInset.
 */
export function useTabBarPadding(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + BottomTabInset;
}
