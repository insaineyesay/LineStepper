import { buildIcs, type CalendarEntry } from './calendar-file';

/**
 * Web: download a .ics file. Opening it adds the event to Apple Calendar or
 * Outlook; Google Calendar users get their own link next to the button.
 */
export async function addToCalendar(entry: CalendarEntry): Promise<'saved' | 'canceled'> {
  const blob = new Blob([buildIcs(entry)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${entry.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'event'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

export const SHOWS_GOOGLE_LINK = true;
