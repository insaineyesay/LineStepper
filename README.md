# LineStepper

The hub for the soul line dancing community — events, crews, DJs, instructors,
and vendors in one place. Launch region: Hampton Roads, Richmond, and North
Carolina.

## Repo layout (npm workspaces)

| Path | What it is |
| --- | --- |
| `apps/mobile` | Expo (SDK 58) + expo-router app for iOS, Android and web. |
| `apps/api` | Node API (Fastify) for Heroku: feature flags, client log ingest, and later the domain modules. |
| `apps/web` | Next.js creator dashboard and admin back office (placeholder for now). |
| `packages/shared` | Code every app imports: the flag registry, the logger contract and the auth contract. |
| `supabase/migrations` | Database schema, RLS policies and triggers. |

Backend data lives in [Supabase](https://supabase.com) (Postgres, auth, storage, row-level security).

## Getting started

Full local setup, including the database, env files, running on a phone and
troubleshooting: **[GETTING_STARTED.md](GETTING_STARTED.md)**. Short version:

```bash
npm install                  # once, at the repo root (installs every workspace)
cp apps/mobile/.env.example apps/mobile/.env
cp apps/api/.env.example apps/api/.env
npm run dev:api              # API on :4000
npm run dev:mobile           # Expo; press i / a / w
npm run dev:web              # dashboard on :3000
npm test                     # shared + api unit tests
npm run typecheck
```

The mobile app still runs with sample data and no API: flags fall back to
their defaults and logs go to the console.

To connect Supabase, run the migrations in `supabase/migrations` in order,
then fill in the env files. To make someone an admin (needed to change
flags), run this in the SQL editor:
`update profiles set is_admin = true where id = '<user id>';`

## Foundations (PRD Addendum B)

**Feature flags** (`packages/shared/src/flags/registry.ts`). Every flag from
B2 is declared once, with its MVP1 default and its dependencies (for example,
`tickets.qr` needs `booking`). The API resolves the effective value in this
order: registry default → `FLAGS` env var (set at deploy) → `feature_flags`
table (changed by admins at runtime). The API enforces flags: a route behind
`app.requireFlag('booking')` returns 404 while the flag is off. The app calls
`useFlag('booking')` only to hide UI.

- `GET /flags` returns the effective flags.
- `PUT /admin/flags/:key {enabled}` is admin-only. Each change is written to
  `flag_audit` and logged as `flags.changed`.

**Logging** (`packages/shared/src/logging`, `apps/api/src/logging`).

- App code only calls `logger.info(event, data)`. Vendors sit behind
  connectors.
- The mobile app batches events to `POST /logs`. The API sets the user ID from
  the bearer token and uses the request ID.
- The server log bus removes personal data, adds context, batches, and sends
  each batch to every enabled connector.
- Connectors:
  - **stdout** (Pino JSON, always on; shows in `heroku logs`)
  - **Papertrail** (HTTPS, `PAPERTRAIL_TOKEN`)
  - **Sentry** (warnings and errors, `SENTRY_DSN`)
- Each connector has its own `log.connector.*` flag. A connector that is
  failing retries, then drops the batch and counts it (see `GET /health`). It
  never blocks the app or the other connectors.
- To add a vendor, write a `LogConnector` (`init`, `send`, `flush`, `health`)
  and add it in `buildConnectors`.
- Every API request logs `api.request`. Screen views, app start and
  background, sign-in and sign-out, and taps on `Button` and `Chip` (or any
  `onPress` wrapped in `logTap`) are logged from the app.

**Auth** (`packages/shared/src/auth`).

- Screens use `useSession()`, which exposes an `AuthClient`. Only
  `apps/mobile/src/lib/auth/supabase-auth-client.ts` talks to Supabase Auth.
- On the server, an `AuthVerifier` turns a bearer token into a user.
  `AUTH_PROVIDER` selects it.
- To add Clerk, Auth0 or our own auth API, write one adapter for each side
  and change one line in each `index.ts`.

## Deploying

- **API (Heroku):** the root `Procfile` and the `heroku-postbuild` script
  build and start `apps/api`. Set the variables from `apps/api/.env.example`
  as config vars. If you use the Papertrail Heroku add-on (which drains
  stdout), leave `PAPERTRAIL_TOKEN` empty so logs aren't sent twice.
- **Mobile web (Vercel):** set the project's Root Directory to `apps/mobile`.
  `vercel.json` moved there with the app.

## Data model

`profiles` (1:1 with auth users, auto-created on signup) · `crews` +
`crew_members` (join requests gated by the crew's `is_joinable` paid flag) ·
`events` (organizer-owned, published/draft/cancelled) · `event_bookmarks`
(drives reminders) · `push_tokens` (one per device, for reminders) · `post_credit_ledger` (post credits bought and spent) · `follows` · `subscriptions` (Stripe mirror, written only
by webhooks) · `metros` (launch-region filter list).

## Roadmap

0. **Foundations** — monorepo, feature flags, pluggable logging, and the
   pluggable auth interface (done; see above).
1. **Auth** — Apple / Google / Facebook sign-in (`expo-apple-authentication`,
   `@react-native-google-signin`, Facebook via Supabase OAuth), profile setup
   flow (handle, home metro, role).
2. **Events v1** — event detail screen, metro + date filters, bookmarking.
3. **Reminders** — Expo push notifications; Supabase cron + edge function
   sends reminders for bookmarked events (built; setup in
   GETTING_STARTED.md, "Event reminders").
4. **Crews v1** — crew detail, join requests, member management.
5. **Paid side** — per the client's PRD (v0.2): $0.99 per event post. Post
   credits, the publish gate and Stripe checkout on the web are built (setup
   in GETTING_STARTED.md, "Paid posting"); Apple / Google in-app purchase
   needs the store accounts. The $0.99 app price is set in the stores.
6. **Polish & beta** — replace placeholder tab icons and app icon/splash,
   TestFlight + Play internal testing with a founding crew.

Later: merch pages (link out first, commerce much later), step-sheet /
dance tracking, in-app ticketing.
