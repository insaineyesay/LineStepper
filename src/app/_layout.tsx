import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { SessionProvider } from '@/lib/auth-context';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <SessionProvider>
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
            name="member/[id]"
            options={{ headerShown: true, title: 'Profile' }}
          />
        </Stack>
      </ThemeProvider>
    </SessionProvider>
  );
}
