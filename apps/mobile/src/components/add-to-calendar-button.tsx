import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet } from 'react-native';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { SHOWS_GOOGLE_LINK, addToCalendar } from '@/lib/add-to-calendar';
import { endFor, googleCalendarUrl, type CalendarEntry } from '@/lib/calendar-file';
import { logTap } from '@/lib/log-tap';
import type { DanceEvent } from '@/lib/types';

/** The event's web address, so the calendar entry links back to it. */
function eventUrl(id: string): string | null {
  const base =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : process.env.EXPO_PUBLIC_WEB_URL || null;
  return base ? `${base}/event/${id}` : null;
}

/** "Add to calendar" on the event page (PRD F6: export to Apple / Google calendar). */
export function AddToCalendarButton({ event }: { event: DanceEvent }) {
  const [message, setMessage] = useState<string | null>(null);
  const start = new Date(event.starts_at);
  const entry: CalendarEntry = {
    id: event.id,
    title: event.title,
    start,
    end: endFor(start, event.ends_at),
    location: [event.venue_name, event.address, event.city].filter(Boolean).join(', ') || null,
    description: event.description,
    url: eventUrl(event.id),
  };

  const add = async () => {
    setMessage(null);
    try {
      const result = await addToCalendar(entry);
      if (result === 'saved' && Platform.OS !== 'web') setMessage('Added to your calendar.');
    } catch {
      setMessage("Couldn't open your calendar. Try again.");
    }
  };

  return (
    <ThemedView style={styles.wrap}>
      <Button label="Add to calendar" logName="add_to_calendar" onPress={() => void add()} />
      {SHOWS_GOOGLE_LINK && (
        <Pressable
          accessibilityRole="link"
          onPress={() => logTap('add_to_google_calendar', () => void Linking.openURL(googleCalendarUrl(entry)))}
          hitSlop={Spacing.two}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.link}>
            Using Google Calendar? Add it there instead
          </ThemedText>
        </Pressable>
      )}
      {message && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {message}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  link: {
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  center: {
    textAlign: 'center',
  },
});
