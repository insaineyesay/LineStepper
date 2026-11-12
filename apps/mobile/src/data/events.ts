import type { DanceEvent, EventStatus, EventType, SkillLevel } from '@/lib/types';

import { db } from './backend';
import { fromResponse, type DataResult } from './result';

/** An event with its host, crew and area, for the event page. */
export interface EventDetail extends DanceEvent {
  organizer: { id: string; display_name: string | null; handle: string | null; role: string } | null;
  crew: { id: string; name: string; slug: string } | null;
  metro: { name: string; state: string } | null;
}

/** What the event form saves. */
export interface EventInput {
  title: string;
  description: string | null;
  starts_at: string;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  metro_id: number | null;
  price_text: string | null;
  ticket_url: string | null;
  status: EventStatus;
  event_type: EventType | null;
  skill_level: SkillLevel | null;
}

export interface EventSummary {
  id: string;
  title: string;
  starts_at: string;
  status: EventStatus;
}

export interface UpcomingEventSummary {
  id: string;
  title: string;
  starts_at: string;
  city: string | null;
}

const nowIso = () => new Date().toISOString();

/** Upcoming published events, soonest first. */
export async function listUpcomingEvents(limit = 100): Promise<DataResult<DanceEvent[]>> {
  return fromResponse(
    await db
      .from('events')
      .select('*')
      .eq('status', 'published')
      .gte('starts_at', nowIso())
      .order('starts_at', { ascending: true })
      .limit(limit)
  );
}

/** Upcoming published events within `miles` of a point. */
export async function listEventsNear(
  origin: { lat: number; lng: number },
  miles: number,
  limit = 100
): Promise<DataResult<DanceEvent[]>> {
  return fromResponse(
    await db.rpc('events_near', { p_lat: origin.lat, p_lng: origin.lng, p_miles: miles }).limit(limit)
  );
}

export async function getEventDetail(id: string): Promise<DataResult<EventDetail>> {
  return fromResponse(
    await db
      .from('events')
      .select(
        '*, organizer:profiles!events_organizer_id_fkey(id, display_name, handle, role), crew:crews(id, name, slug), metro:metros(name, state)'
      )
      .eq('id', id)
      .single()
  );
}

/** An event as stored (for editing). */
export async function getEvent(id: string): Promise<DataResult<DanceEvent>> {
  return fromResponse(await db.from('events').select('*').eq('id', id).single());
}

export async function createEvent(organizerId: string, input: EventInput): Promise<DataResult<{ id: string }>> {
  return fromResponse(
    await db
      .from('events')
      .insert({ ...input, organizer_id: organizerId })
      .select('id')
      .single()
  );
}

export async function updateEvent(id: string, input: EventInput): Promise<DataResult<{ id: string }>> {
  const res = await db.from('events').update(input).eq('id', id);
  return res.error ? fromResponse(res) : { data: { id }, error: null };
}

/** All of someone's own events, drafts included. */
export async function listMyEvents(userId: string): Promise<DataResult<EventSummary[]>> {
  return fromResponse(
    await db
      .from('events')
      .select('id, title, starts_at, status')
      .eq('organizer_id', userId)
      .order('starts_at', { ascending: true })
  );
}

/** A host's next published events, for their public page. */
export async function listUpcomingEventsByOrganizer(
  organizerId: string,
  limit = 10
): Promise<DataResult<UpcomingEventSummary[]>> {
  return fromResponse(
    await db
      .from('events')
      .select('id, title, starts_at, city')
      .eq('organizer_id', organizerId)
      .eq('status', 'published')
      .gte('starts_at', nowIso())
      .order('starts_at')
      .limit(limit)
  );
}
