import { db } from './backend';
import { fromResponse, ok, type DataResult } from './result';

export interface BookmarkedEvent {
  event_id: string;
  events: {
    id: string;
    title: string;
    starts_at: string;
    venue_name: string | null;
    city: string | null;
  } | null;
}

export async function isBookmarked(userId: string, eventId: string): Promise<DataResult<boolean>> {
  const res = await db
    .from('event_bookmarks')
    .select('event_id')
    .eq('profile_id', userId)
    .eq('event_id', eventId)
    .maybeSingle();
  return res.error ? fromResponse(res) : ok(Boolean(res.data));
}

export async function addBookmark(userId: string, eventId: string): Promise<DataResult<true>> {
  const res = await db.from('event_bookmarks').insert({ profile_id: userId, event_id: eventId });
  return res.error ? fromResponse(res) : ok(true);
}

export async function removeBookmark(userId: string, eventId: string): Promise<DataResult<true>> {
  const res = await db.from('event_bookmarks').delete().eq('profile_id', userId).eq('event_id', eventId);
  return res.error ? fromResponse(res) : ok(true);
}

/** Someone's bookmarks with each event's basics, soonest first. */
export async function listBookmarks(userId: string): Promise<DataResult<BookmarkedEvent[]>> {
  const res = await db
    .from('event_bookmarks')
    .select('event_id, events(id, title, starts_at, venue_name, city)')
    .eq('profile_id', userId);
  if (res.error) return fromResponse(res);
  const rows = ((res.data ?? []) as unknown as BookmarkedEvent[])
    .filter((b) => b.events)
    .sort((a, b) => a.events!.starts_at.localeCompare(b.events!.starts_at));
  return ok(rows);
}
