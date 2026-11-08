import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { CrewForm } from '@/components/crew-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth-context';

export default function NewCrewScreen() {
  const router = useRouter();
  const { session } = useSession();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedView style={styles.content}>
          {session ? (
            <CrewForm
              userId={session.user.id}
              onSaved={(id) =>
                router.replace({ pathname: '/crew/[id]', params: { id } })
              }
            />
          ) : (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Sign in to start a crew</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Head to the Profile tab to sign in first — then come back here to
                create your crew.
              </ThemedText>
            </ThemedView>
          )}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
