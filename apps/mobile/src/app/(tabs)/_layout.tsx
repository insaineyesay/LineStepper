import AppTabs from '@/components/app-tabs';

// Open the app on the Events tab. Without this, native tabs start on whichever
// group the router lists first, which is Crews.
export const unstable_settings = {
  initialRouteName: '(browse)',
};

export default function TabLayout() {
  return <AppTabs />;
}
