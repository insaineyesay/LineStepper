import { createEventInCalendarAsync } from 'expo-calendar/legacy';

import type { CalendarEntry } from './calendar-file';

/**
 * Phones: open the system "New Event" screen, filled in. The person saves it
 * in whichever calendar they like, so the app never needs calendar
 * permission. (expo-calendar's newer API isn't available in Expo Go yet, so
 * this uses the legacy entry point.) Returns whether it was saved.
 */
export async function addToCalendar(entry: CalendarEntry): Promise<'saved' | 'canceled'> {
  const result = await createEventInCalendarAsync({
    title: entry.title,
    startDate: entry.start,
    endDate: entry.end,
    location: entry.location ?? undefined,
    notes: [entry.description, entry.url].filter(Boolean).join('\n\n') || undefined,
  });
  return result.action === 'saved' ? 'saved' : 'canceled';
}

/** On phones the system screen covers every calendar, so there's no separate Google link. */
export const SHOWS_GOOGLE_LINK = false;
