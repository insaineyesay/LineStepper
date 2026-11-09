import { DarkTheme, DefaultTheme, ThemeProvider, Stack, type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { Button } from '@/components/button';
import { PushSetup } from '@/components/push-setup';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { SessionProvider } from '@/lib/auth-context';
import { installGlobalErrorHandlers, reportScreenError } from '@/lib/error-reporting';
import { FlagsProvider } from '@/lib/flags';
import { useScreenLogging } from '@/lib/use-screen-logging';

installGlobalErrorHandlers();

/** Shown instead of a screen that crashed while drawing; the crash is logged. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportScreenError(error, typeof window !== 'undefined' && window.location ? window.location.pathname : 'app');
  }, [error]);
  return (
    <ThemedView style={styles.errorScreen}>
      <ThemedText type="subtitle">Something went wrong</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.errorText}>
        We&apos;ve been told about it. Try again, and if it keeps happening, restart the app.
      </ThemedText>
      <Button label="Try again" onPress={() => void retry()} />
    </ThemedView>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useScreenLogging();
  return (
    <SessionProvider>
      <FlagsProvider>
      <PushSetup />
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

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  errorText: {
    marginBottom: Spacing.two,
  },
});
