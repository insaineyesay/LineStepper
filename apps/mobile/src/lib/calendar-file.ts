/**
 * Calendar files (.ics, the format Apple Calendar, Outlook and Google
 * Calendar all import) and Google Calendar links, for "Add to calendar".
 */

export interface CalendarEntry {
  id: string;
  title: string;
  start: Date;
  /** Events only store a start time, so callers pass a sensible length. */
  end: Date;
  location: string | null;
  description: string | null;
  url: string | null;
}

/** Events have no end time yet; assume this long. */
export const DEFAULT_EVENT_HOURS = 3;

export function endFor(start: Date, end?: string | null): Date {
  return end ? new Date(end) : new Date(start.getTime() + DEFAULT_EVENT_HOURS * 3600_000);
}

/** 20261205T190000Z */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Text values escape backslash, semicolon, comma and newlines (RFC 5545 3.3.11). */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 characters continue on the next line after a space. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function buildIcs(e: CalendarEntry, now = new Date()): string {
  const notes = [e.description, e.url].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LineUp2Step//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@lineup2step`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(e.start)}`,
    `DTEND:${utcStamp(e.end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(notes ? [`DESCRIPTION:${escapeText(notes)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(e: CalendarEntry): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utcStamp(e.start)}/${utcStamp(e.end)}`,
    details: [e.description, e.url].filter(Boolean).join('\n\n'),
    location: e.location ?? '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
