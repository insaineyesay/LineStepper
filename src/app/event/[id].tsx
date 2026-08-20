import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth-context';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { DanceEvent } from '@/lib/types';

interface EventDetail extends DanceEvent {
  organizer: { display_name: string | null; handle: string | null; role: string } | null;
  crew: { name: string; slug: string } | null;
  metro: { name: string; state: string } | null;
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !id) {
      setNotFound(true);
      return;
    }
    const { data, error } = await supabase
      .from('events')
      .select(
        '*, organizer:profiles!events_organizer_id_fkey(display_name, handle, role), crew:crews(name, slug), metro:metros(name, state)'
      )
      .eq('id', id)
      .single();
    if (error || !data) {
      setNotFound(true);
      return;
    }
    setEvent(data as EventDetail);
    if (session) {
      const { data: bookmark } = await supabase
        .from('event_bookmarks')
        .select('event_id')
        .eq('profile_id', session.user.id)
        .eq('event_id', id)
        .maybeSingle();
      setBookmarked(Boolean(bookmark));
    }
  }, [id, session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only sets state after awaited fetches resolve
    load();
  }, [load]);

  const toggleBookmark = async () => {
    if (!session || !event) {
      return;
    }
    setBookmarkBusy(true);
    if (bookmarked) {
      const { error } = await supabase
        .from('event_bookmarks')
        .delete()
        .eq('profile_id', session.user.id)
        .eq('event_id', event.id);
      if (!error) {
        setBookmarked(false);
      }
    } else {
      const { error } = await supabase
        .from('event_bookmarks')
        .insert({ profile_id: session.user.id, event_id: event.id });
      if (!error) {
        setBookmarked(true);
      }
    }
    setBookmarkBusy(false);
  };

  if (notFound) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          This event isn&apos;t available.
        </ThemedText>
      </ThemedView>
    );
  }

  if (!event) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.centered} />
      </ThemedView>
    );
  }

  const organizerName =
    event.organizer?.display_name ?? event.organizer?.handle ?? 'Unknown organizer';
  const location = [event.venue_name, event.address, event.city]
    .filter(Boolean)
    .join(' · ');

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedView style={styles.content}>
          {event.is_featured && (
            <ThemedText type="smallBold">★ Featured event</ThemedText>
          )}
          <ThemedText type="subtitle">{event.title}</ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" style={styles.uppercase}>
              {formatFullDate(event.starts_at)}
            </ThemedText>
            {location ? (
              <ThemedText type="small" themeColor="textSecondary">
                {location}
              </ThemedText>
            ) : null}
            {event.metro && (
              <ThemedText type="small" themeColor="textSecondary">
                {event.metro.name}, {event.metro.state}
              </ThemedText>
            )}
            {event.price_text && (
              <ThemedText type="small">{event.price_text}</ThemedText>
            )}
          </ThemedView>

          {event.description && (
            <ThemedText type="default">{event.description}</ThemedText>
          )}

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              Hosted by
            </ThemedText>
            <ThemedText type="default">{organizerName}</ThemedText>
            {event.crew && (
              <ThemedText type="small" themeColor="textSecondary">
                with {event.crew.name}
              </ThemedText>
            )}
          </ThemedView>

          {event.ticket_url && (
            <Pressable onPress={() => Linking.openURL(event.ticket_url!)}>
              <ThemedView type="backgroundSelected" style={styles.button}>
                <ThemedText type="smallBold">Get tickets</ThemedText>
              </ThemedView>
            </Pressable>
          )}

          {session ? (
            <Pressable onPress={toggleBookmark} disabled={bookmarkBusy}>
              <ThemedView
                type={bookmarked ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.button}>
                {bookmarkBusy ? (
                  <ActivityIndicator />
                ) : (
                  <ThemedText type="smallBold">
                    {bookmarked ? '✓ Bookmarked' : 'Bookmark this event'}
                  </ThemedText>
                )}
              </ThemedView>
            </Pressable>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Sign in on the Profile tab to bookmark events and get reminders.
            </ThemedText>
          )}
          {session && bookmarked && (
            <ThemedText type="small" themeColor="textSecondary">
              Saved to your profile. Event reminders are coming soon.
            </ThemedText>
          )}
          {session?.user.id === event.organizer_id && (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/event/edit/[id]', params: { id: event.id } })
              }>
              <ThemedView type="backgroundElement" style={styles.button}>
                <ThemedText type="smallBold">Edit event</ThemedText>
              </ThemedView>
            </Pressable>
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
  centered: {
    textAlign: 'center',
    paddingTop: Spacing.six,
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
  uppercase: {
    textTransform: 'uppercase',
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
});
