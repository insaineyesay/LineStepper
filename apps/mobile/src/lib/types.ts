// Hand-written row types matching supabase/migrations/0001_initial_schema.sql.
// Once the Supabase project exists, replace with generated types:
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts

export type ProfileRole =
  | 'dancer'
  | 'crew_leader'
  | 'dj'
  | 'instructor'
  | 'event_planner'
  | 'vendor';

export type AccountTier = 'free' | 'standard' | 'featured';

export type EventStatus = 'draft' | 'published' | 'cancelled';

export interface Metro {
  id: number;
  name: string;
  state: string;
  lat: number | null;
  lng: number | null;
}

export interface Profile {
  id: string;
  handle: string | null;
  display_name: string | null;
  role: ProfileRole;
  tier: AccountTier;
  bio: string | null;
  avatar_url: string | null;
  home_metro_id: number | null;
  zip: string | null;
  created_at: string;
  updated_at: string;
}

export interface Crew {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  home_metro_id: number | null;
  owner_id: string;
  is_joinable: boolean;
  tier: AccountTier;
  merch_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DanceEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  metro_id: number | null;
  flyer_url: string | null;
  organizer_id: string;
  crew_id: string | null;
  status: EventStatus;
  is_featured: boolean;
  price_text: string | null;
  ticket_url: string | null;
  zip: string | null;
  /** Set by the database from the ZIP (or the area); read-only. */
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
}
