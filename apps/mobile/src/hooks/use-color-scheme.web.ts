import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};

/**
 * True on the client after hydration, false during static (server) rendering.
 * useSyncExternalStore gives the server snapshot during hydration and the
 * client snapshot afterwards, without a setState-in-effect re-render.
 */
function useHasHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * To support static rendering, the scheme is 'light' until the client has
 * hydrated, then follows the system setting.
 */
export function useColorScheme() {
  const hasHydrated = useHasHydrated();
  const colorScheme = useRNColorScheme();
  return hasHydrated ? colorScheme : 'light';
}
