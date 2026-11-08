import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { SessionProvider } from '@/lib/auth-context';
import { FlagsProvider } from '@/lib/flags';
import { useScreenLogging } from '@/lib/use-screen-logging';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useScreenLogging();
  return (
    <SessionProvider>
      <FlagsProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          {/* Every screen lives inside a tab's stack (see (tabs)/(browse,crews,profile)/_layout.tsx) so the tab bar never disappears. */}
          <Stack.Screen name="(tabs)" />
        </Stack>
      </ThemeProvider>
      </FlagsProvider>
    </SessionProvider>
  );
}
