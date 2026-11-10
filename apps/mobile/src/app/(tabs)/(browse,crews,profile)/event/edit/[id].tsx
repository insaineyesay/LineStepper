import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { EventForm } from '@/components/event-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { useSession } from '@/lib/auth-context';
import { getEvent } from '@/data/events';
import type { DanceEvent } from '@/lib/types';

export default function EditEventScreen() {
  const tabBarPadding = useTabBarPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, loading } = useSession();
  const [event, setEvent] = useState<DanceEvent | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    getEvent(id).then(({ data, error }) => {
      if (!cancelled) {
        if (error) {
          setNotFound(true);
        } else {
          setEvent(data);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const notOwner = event && session && event.organizer_id !== session.user.id;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <ThemedView style={styles.content}>
          {loading || (!event && !notFound) ? (
            <ActivityIndicator style={styles.loader} />
          ) : notFound || !session || notOwner ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">
                {notOwner ? 'Not your event' : 'Event unavailable'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {notOwner
                  ? 'Only the organizer who posted this event can edit it.'
                  : !session
                    ? 'Sign in on the Profile tab to edit your events.'
                    : "This event couldn't be loaded."}
              </ThemedText>
            </ThemedView>
          ) : (
            <EventForm
              userId={session.user.id}
              existing={event!}
              onSaved={(savedId) =>
                router.replace({ pathname: '/event/[id]', params: { id: savedId } })
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
