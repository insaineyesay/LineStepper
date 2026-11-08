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
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="event/[id]"
            options={{ headerShown: true, title: 'Event' }}
          />
          <Stack.Screen
            name="event/new"
            options={{ headerShown: true, title: 'Post an event' }}
          />
          <Stack.Screen
            name="event/edit/[id]"
            options={{ headerShown: true, title: 'Edit event' }}
          />
          <Stack.Screen
            name="crew/[id]"
            options={{ headerShown: true, title: 'Crew' }}
          />
          <Stack.Screen
            name="crew/new"
            options={{ headerShown: true, title: 'Start a crew' }}
          />
          <Stack.Screen
            name="crew/edit/[id]"
            options={{ headerShown: true, title: 'Edit crew' }}
          />
          <Stack.Screen
            name="member/[id]"
            options={{ headerShown: true, title: 'Profile' }}
          />
        </Stack>
      </ThemeProvider>
      </FlagsProvider>
    </SessionProvider>
  );
}
