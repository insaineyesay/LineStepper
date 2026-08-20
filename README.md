# LineStepper

The hub for the soul line dancing community — events, crews, DJs, instructors,
and vendors in one place. Launch region: Hampton Roads, Richmond, and North
Carolina.

## Stack

- **App**: [Expo](https://expo.dev) (SDK 57) + expo-router, TypeScript. One
  codebase for iOS, Android, and web.
- **Backend**: [Supabase](https://supabase.com) — Postgres, auth (Apple /
  Google / Facebook sign-in), storage, row-level security.
- **Billing** (planned): Stripe subscriptions managed through a separate web
  dashboard, not in-app purchases.

## Getting started

```bash
npm install
npm start          # then press i (iOS), a (Android), or w (web)
```

The app runs with sample data out of the box. To connect the real backend:

1. Create a project at [database.new](https://database.new).
2. Run `supabase/migrations/0001_initial_schema.sql` in the SQL editor
   (or `supabase db push` with the Supabase CLI).
3. `cp .env.example .env` and fill in the project URL and anon key.
4. Restart the dev server.

## Project layout

- `src/app/` — screens (expo-router file-based routing): Events (`index`),
  Crews, Profile.
- `src/lib/supabase.ts` — Supabase client; `src/lib/types.ts` — row types
  (replace with generated types once the project exists).
- `supabase/migrations/` — database schema, RLS policies, and signup trigger.

## Data model

`profiles` (1:1 with auth users, auto-created on signup) · `crews` +
`crew_members` (join requests gated by the crew's `is_joinable` paid flag) ·
`events` (organizer-owned, published/draft/cancelled) · `event_bookmarks`
(drives reminders) · `follows` · `subscriptions` (Stripe mirror, written only
by webhooks) · `metros` (launch-region filter list).

## Roadmap

1. **Auth** — Apple / Google / Facebook sign-in (`expo-apple-authentication`,
   `@react-native-google-signin`, Facebook via Supabase OAuth), profile setup
   flow (handle, home metro, role).
2. **Events v1** — event detail screen, metro + date filters, bookmarking.
3. **Reminders** — Expo push notifications; Supabase cron + edge function
   sends reminders for bookmarked events.
4. **Crews v1** — crew detail, join requests, member management.
5. **Paid side** — web dashboard (Next.js on Vercel) for organizer/DJ/crew
   billing via Stripe; event posting gated on active subscription tier.
6. **Polish & beta** — replace placeholder tab icons and app icon/splash,
   TestFlight + Play internal testing with a founding crew.

Later: merch pages (link out first, commerce much later), step-sheet /
dance tracking, in-app ticketing.
