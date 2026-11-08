import { Stack } from 'expo-router';

/**
 * One stack per tab, so the tab bar stays visible on every inner screen
 * (event, crew, member, forms). The array group duplicates these routes into
 * each tab: opening a crew from the Events tab stays in the Events tab.
 * Tapping the active tab pops its stack back to the tab's first screen.
 *
 * The Events tab's group is named (browse), not (events), on purpose: a cold
 * link (page reload, shared URL, deep link) opens in the alphabetically first
 * group, and links to events should land in the Events tab, not Crews.
 */
export const unstable_settings = {
  anchor: 'index',
  browse: { anchor: 'index' },
  crews: { anchor: 'crews' },
  profile: { anchor: 'profile' },
};

// Each group gets only its own anchor as a root screen (the Crews group has
// `crews` but not `index` or `profile`), so declare just that one.
// The title is what the back button on the next screen says.
const TAB_ROOT: Record<string, { name: string; title: string }> = {
  '(browse)': { name: 'index', title: 'Events' },
  '(crews)': { name: 'crews', title: 'Crews' },
  '(profile)': { name: 'profile', title: 'Profile' },
};

export default function TabStackLayout({ segment }: { segment: string }) {
  const root = TAB_ROOT[segment] ?? TAB_ROOT['(browse)'];
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name={root.name} options={{ headerShown: false, title: root.title }} />
      <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
      <Stack.Screen name="event/new" options={{ title: 'Post an event' }} />
      <Stack.Screen name="event/edit/[id]" options={{ title: 'Edit event' }} />
      <Stack.Screen name="crew/[id]" options={{ title: 'Crew' }} />
      <Stack.Screen name="crew/new" options={{ title: 'Start a crew' }} />
      <Stack.Screen name="crew/edit/[id]" options={{ title: 'Edit crew' }} />
      <Stack.Screen name="member/[id]" options={{ title: 'Profile' }} />
    </Stack>
  );
}
