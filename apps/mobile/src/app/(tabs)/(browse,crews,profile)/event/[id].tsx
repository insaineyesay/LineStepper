import { Image } from 'expo-image';
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
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { useSession } from '@/lib/auth-context';
import { Disclaimer } from '@/components/legal-links';
import { ReportButton } from '@/components/report-button';
import { useFlag } from '@/lib/flags';
import { getPushStatusAsync, registerForPushAsync, type PushStatus } from '@/lib/push';
import { isBackendConfigured } from '@/data/backend';
import { addBookmark, isBookmarked, removeBookmark } from '@/data/bookmarks';
import { getEventDetail, type EventDetail } from '@/data/events';


function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function reminderNote(reminders: boolean, changeAlerts: boolean, pushStatus: PushStatus): string {
  if (!reminders && !changeAlerts) return 'Saved to your profile.';
  switch (pushStatus) {
    case 'granted':
      if (reminders && changeAlerts) {
        return "Saved to your profile. We'll remind you about a day before, and tell you if it changes or is cancelled.";
      }
      return reminders
        ? "Saved to your profile. We'll send you a reminder about a day before it starts."
        : "Saved to your profile. We'll tell you if it changes or is cancelled.";
    case 'denied':
      return 'Saved to your profile. Turn on notifications for LineStepper in Settings to hear about reminders and changes.';
    case 'unsupported':
      return 'Saved to your profile. Get the LineStepper app to be reminded before it starts and told if it changes.';
    default:
      return 'Saved to your profile.';
  }
}

export default function EventDetailScreen() {
  const tabBarPadding = useTabBarPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const remindersFlag = useFlag('events.reminders');
  const changeAlertsFlag = useFlag('events.change_alerts');
  const pushFlag = useFlag('notify.push');
  const remindersOn = remindersFlag && pushFlag;
  const changeAlertsOn = changeAlertsFlag && pushFlag;
  const [pushStatus, setPushStatus] = useState<PushStatus>('undetermined');

  useEffect(() => {
    getPushStatusAsync().then(setPushStatus);
  }, []);

  const load = useCallback(async () => {
    if (!isBackendConfigured || !id) {
      setNotFound(true);
      return;
    }
    const { data, error } = await getEventDetail(id);
    if (error) {
      setNotFound(true);
      return;
    }
    setEvent(data);
    if (session) {
      const { data: saved } = await isBookmarked(session.user.id, id);
      setBookmarked(Boolean(saved));
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
      const { error } = await removeBookmark(session.user.id, event.id);
      if (!error) {
        setBookmarked(false);
      }
    } else {
      const { error } = await addBookmark(session.user.id, event.id);
      if (!error) {
        setBookmarked(true);
        // Bookmarking is when reminders and change notices make sense, so ask for notifications here.
        if (remindersOn || changeAlertsOn) {
          const result = await registerForPushAsync({ prompt: true });
          setPushStatus(
            result === 'registered' ? 'granted' : result === 'denied' ? 'denied' : await getPushStatusAsync()
          );
        }
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
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <ThemedView style={styles.content}>
          {event.is_featured && (
            <ThemedText type="smallBold">★ Featured event</ThemedText>
          )}
          <ThemedText type="subtitle">{event.title}</ThemedText>
          {event.flyer_url && <Flyer uri={event.flyer_url} />}

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
            <Pressable
              disabled={!event.organizer}
              onPress={() =>
                event.organizer &&
                router.push({
                  pathname: '/member/[id]',
                  params: { id: event.organizer.id },
                })
              }>
              <ThemedText type="default">{organizerName}</ThemedText>
            </Pressable>
            {event.crew && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/crew/[id]',
                    params: { id: event.crew!.id },
                  })
                }>
                <ThemedText type="small" themeColor="textSecondary">
                  with <ThemedText type="smallBold">{event.crew.name}</ThemedText>
                </ThemedText>
              </Pressable>
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
              {reminderNote(remindersOn, changeAlertsOn, pushStatus)}
            </ThemedText>
          )}
          {session?.user.id === event.organizer_id && event.removed_at && (
            <ThemedView type="backgroundElement" style={styles.button}>
              <ThemedText type="smallBold">Removed by moderators</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Only you can see this event. Contact support if you think this was a mistake.
              </ThemedText>
            </ThemedView>
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
          {session && session.user.id !== event.organizer_id && (
            <ReportButton targetType="event" targetId={event.id} />
          )}
          <Disclaimer kind="event" />
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

/** The event's flyer, full width, at its own shape (flyers are usually portrait). */
function Flyer({ uri }: { uri: string }) {
  const [ratio, setRatio] = useState(4 / 5);
  return (
    <Image
      source={{ uri }}
      style={{ width: '100%', aspectRatio: ratio, borderRadius: Spacing.three }}
      contentFit="contain"
      accessibilityLabel="Event flyer"
      onLoad={(e) => {
        const { width, height } = e.source;
        if (width && height) setRatio(width / height);
      }}
    />
  );
}
