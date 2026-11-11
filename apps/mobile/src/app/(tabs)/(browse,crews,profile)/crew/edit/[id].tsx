import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { CrewForm } from '@/components/crew-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { useSession } from '@/lib/auth-context';
import { getCrew } from '@/data/crews';
import type { Crew } from '@/lib/types';

export default function EditCrewScreen() {
  const tabBarPadding = useTabBarPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, loading } = useSession();
  const [crew, setCrew] = useState<Crew | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    getCrew(id).then(({ data, error }) => {
      if (!cancelled) {
        if (error) {
          setNotFound(true);
        } else {
          setCrew(data);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const notOwner = crew && session && crew.owner_id !== session.user.id;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <ThemedView style={styles.content}>
          {loading || (!crew && !notFound) ? (
            <ActivityIndicator style={styles.loader} />
          ) : notFound || !session || notOwner ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">
                {notOwner ? 'Not your crew' : 'Crew unavailable'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {notOwner
                  ? 'Only the crew leader can edit this crew.'
                  : !session
                    ? 'Sign in on the Profile tab to edit your crew.'
                    : "This crew couldn't be loaded."}
              </ThemedText>
            </ThemedView>
          ) : (
            <CrewForm
              userId={session.user.id}
              existing={crew!}
              onSaved={(savedId) =>
                router.replace({ pathname: '/crew/[id]', params: { id: savedId } })
              }
            />
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
  loader: {
    paddingTop: Spacing.five,
  },
});
