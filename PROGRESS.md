# LineUp2Step: progress and shared context

**This is the living handoff document for everyone working on this repo,
people and AI agents alike.** It records what's built, what's live, what's
left, how things fit together, and the working rules. Read it before starting
any task.

**Keep it current.** Any change to the app, the backend, the infrastructure,
the plan or a decision updates this file **in the same PR**. Update the "Last
updated" line, move items between sections, add new decisions, and fix
anything that's become wrong. A stale line here costs the next person far more
than it costs you to fix it now.

Last updated: 2026-11-12, after #31 merged (only #32, this doc, open).

---

## 1. What the product is

LineUp2Step is a hub for the **soul line dancing** community: an events
calendar, dance crews, and profiles for dancers, instructors, DJs and
organizers. It's a client project. Launch region: Hampton Roads and Richmond
(VA) and North Carolina, with about 3,000 people ready at launch.

**Scope comes from the client's Google Drive documents, not the README:**

- "LineUp2Step — Product Requirements (Draft v0.2)", Google Doc
  `1R7TbaQUZ-fSwpf07HNqhaKvO5Tw9Ww7DqpBqIzHc6kQ`
- "Questions from Dev Team.docx" (the client's answers), Drive file
  `1Ds7vNFTmF7XaN9yxgIRBg9J2CWTOXFLL`
- "LineUp2Step — Dev Discussions", Google Doc
  `18fwjMAlluo39Zm3LXD9uuKGKrqigv5e_IKYBPTyp8ns`, where **every technical
  decision is recorded** (sections 1–13 so far). Add a section there for each
  new decision, and a line to its summary list.
- "LineUp2Step — Terms, Privacy and Disclaimers (draft for review)", Google Doc
  `1UXKVTmi6zdon1m-vflf6sL7s9QpNu_CmQPWN2oyn5EA`

All four are in the client's shared drive (`0AFEukbbjmOimUk9PVA`).

**Phase 1 (MVP1) money model, decided by the client:**

- $0.99 to buy the app (store listing).
- $0.99 per event post, any role. Bought by in-app purchase on phones and
  Stripe on the web. Credits work across platforms.
- **Not** in MVP1: ticketing, collecting money for events, payouts, waitlists,
  QR check-in, reviews (they need check-in), subscription tiers. Events are
  display-only; people pay organizers outside the app.
- Notifications: email first (texts cost money).

## 2. How it's built

| Part | Where | Notes |
|---|---|---|
| Mobile app + web app | `apps/mobile` | Expo SDK 58, expo-router. The same code runs on iPhone, Android and the web. |
| API | `apps/api` | Fastify (Node). The single backend in front of the database. |
| Shared code | `packages/shared` | Log events, telemetry catalog, feature flags. |
| Database, sign-in, storage | Supabase project `foyzajjlisqbwoofbleb` | Postgres, email-code sign-in, Storage bucket `images`. |
| Database changes | `supabase/migrations/00NN_*.sql` | Run by hand in the Supabase SQL editor, in order. |
| Edge functions | `supabase/functions` | `send-reminders` (hourly via pg_cron), `create-checkout`, `stripe-webhook`. |
| Old placeholder | `apps/web` | Placeholder Next.js app. Unused; the web app is `apps/mobile`. |

**Hosting and live addresses:**

| What | Where | Deploys |
|---|---|---|
| API | Heroku app `lineup2step`, `https://lineup2step-f5b25ea5f47b.herokuapp.com` (Basic dyno, $7/mo) | Automatically from `main` |
| Web app | Vercel, `https://line-stepper-five.vercel.app` | Automatically from `main` |
| Analytics and errors | PostHog (project key `phc_…` is in `apps/mobile/.env.production`, public by design) | n/a |
| Privacy policy URL for the stores | `https://line-stepper-five.vercel.app/legal/privacy` | n/a |

**Architecture rules (see Dev Discussions for the reasoning):**

- **Screens never talk to the database directly.** They call
  `apps/mobile/src/data/*` modules, which return `{ data, error }`. Only
  `data/backend.ts`, `lib/supabase.ts` and `lib/auth/*` may import the Supabase
  client; `scripts/data-layer.test.mjs` enforces it. Areas move from Supabase to
  the API one module at a time.
- **Already served by the API:** account deletion (`data/account.ts`), report,
  block and moderation (`data/moderation.ts`), images (`data/images.ts`), logs
  and flags. **Still direct to Supabase:** events, crews, profiles, bookmarks,
  follows, credits, push tokens, reference data. The migration plan (Dev
  Discussions §9) moves writes first, then reads.
- **Anything needing the admin key goes through the API**, which has
  `SUPABASE_SERVICE_ROLE_KEY` (a Supabase *secret key*, `sb_secret_…`). That key
  never ships in the app.
- **Database columns that only the server may set** are guarded by triggers:
  `profiles.is_admin` (0003), `profiles.banned_at`, `events/crews.removed_at`
  (0008), `profiles.avatar_url`, `events.flyer_url`, `events.flyer_thumb_url`
  (0009).
- **Telemetry:** every event name is in `packages/shared/src/telemetry/catalog.ts`
  and `packages/shared/src/logging/types.ts` (`LogEvents`). Never type an event
  name by hand; `scripts/telemetry-usage.test.mjs` fails if you do. Logs are
  scrubbed of emails, phones, cards and tokens (`logging/scrub.ts`); ids are
  kept intact.
- **No logs in the database.** It's billed on storage, and logs grow fast.
  Business records (purchases, posts, admin actions, bans) do stay there.
- **Every scrolling screen pads for the floating tab bar** (`useTabBarPadding()`
  or `BottomTabInset`); `scripts/tab-bar-padding.test.mjs` enforces it.

**Heroku config vars:** `NODE_ENV=production`, `AUTH_PROVIDER=supabase`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTHOG_API_KEY`,
`CORS_ORIGINS=https://line-stepper-five.vercel.app`, `LOG_LEVEL=info`.
**Never set `NPM_CONFIG_WORKSPACE`:** it breaks the Heroku build.

## 3. Migrations: what's in the repo and what's live

Run each one in the Supabase SQL editor, in order. "Live" means the user has
confirmed running it on the real project.

| # | File | What it does | Live? |
|---|---|---|---|
| 0001–0006 | initial schema, crews, flags/admins, reminders, post credits, ZIP radius search | Core tables and rules | Yes |
| 0007 | `account_deletion.sql` | Crew hand-off before deleting an account | Yes |
| 0008 | `moderation.sql` | Reports, blocks, bans, removals | Yes |
| 0009 | `images.sql` | `images` bucket, flyer/photo URL columns and guards | **Not confirmed.** #29 is merged; run before releasing to `main` |
| 0010 | `event_type_level.sql` | Event type and skill level (#30) | **Not confirmed.** #30 is merged; run before releasing to `main` |

The ZIP table is loaded from `supabase/data/zip_codes.csv` (instructions in
GETTING_STARTED.md). Sample events and crews come from
`supabase/seed_sample_data.sql` and are on the live database.

## 4. Feature status

### Live in production (`main`)

- Events: list, search, This week / This month, near me / ZIP with a radius
  (5–100 mi), event page, bookmarks, posting with drafts, editing and
  cancelling, autosaved forms, ZIP required for new events.
- Crews: list, crew page, start a crew, request to join, owner approves or
  removes members, leave.
- Profiles: display name, handle, role, bio, home area, ZIP; member pages;
  follow and unfollow.
- Sign-in with an emailed 6-digit code (Supabase email templates must use
  `{{ .Token }}`; Site URL is the Vercel address).
- Push reminders about a day before bookmarked events (needs a store or
  development build to test on a real phone; never tested on a device).
- Paid posting: credits, `publish_event()`, Stripe checkout on the web.
  **Switched off** (`events.paid_posting` flag) until payments are set up.
- Account deletion (tested end to end in production).
- Report, block, ban and the admin Moderation screen. PostHog alert on
  `report.created` is set up. Admins are set by SQL:
  `update profiles set is_admin = true where id in (select id from auth.users where email in ('…'));`
- Legal pages (draft, with `[placeholders]`), the sign-in consent line,
  disclaimers on event and crew pages.
- Telemetry to PostHog and Heroku logs; the Share usage data switch.

### Merged to `develop`, not yet released to `main`

- #28: "How LineUp2Step works" pricing card on Events and the `/faq` page.
- #29: event flyers and profile photos (needs 0009 run). **A real upload has
  not been tested yet.**
- #30: event type and skill level, with filters (needs 0010 run).
- #31: Add to calendar (system sheet on phones, `.ics` and Google link on the web).

### Open PRs

- #32: this document. Next up after it merges: the phase 1 work below, one PR
  at a time.

### Phase 1 work still to do (in order)

These were recommended by the dev team on 2026-11-12. The client is reviewing
the PRD gap list below and may change the picks.

1. **Notification outbox and sender.** One queue table plus a sender (an edge
   function on a short pg_cron schedule, or the API) that delivers push through
   Expo, using the existing `push_tokens` table and `send-reminders` patterns.
   Check running costs first (invocations per month).
2. **Change notices for saved events (PRD F3, F9).** When a published event's
   date, time or venue changes, or it's cancelled, notify everyone who
   bookmarked it, within about 5 minutes. The `events.change_alerts` flag
   already exists but nothing sends yet.
3. **New-event alerts for followers (PRD F9).** When someone you follow
   publishes an event, notify you. Use the same outbox.
4. **Accessibility pass.** The PRD targets WCAG 2.1 AA and text scaling up to
   200% (many line dancers are older). Check text scaling, screen-reader labels
   and contrast on the main screens, and fix what breaks.
5. **Record each decision** in the Dev Discussions doc, and update this file.

### Phase 1 blockers outside the code

- **Apple and Google developer accounts** (client): needed for store builds,
  in-app purchase, the $0.99 app price, and testing push on real phones.
- **In-app purchase** for posts: not built; needs those accounts.
- **Stripe test-mode setup**, then turning `events.paid_posting` on.
- **Legal details** from the client (company name, address, contact email,
  minimum age 13+ or 17+, refund days, governing state, effective date), then
  a lawyer's review. Fill in `LEGAL_DETAILS` in
  `apps/mobile/src/content/legal.ts` and set `draft: false`.
- **Supabase Pro ($25/month)** before launch: image bandwidth, and free projects
  pause after a week without visitors.
- **Email notifications:** the client said "email first". Only sign-in codes
  are emailed today. Needs an email service.

### Polish backlog (target 1.0.0)

See [BACKLOG.md](BACKLOG.md): native date and time pickers, MM-DD-YYYY and
12-hour display, address lookup, the flickering ZIP field, hiding scroll bars,
plus app icons. Items 7 and 9 are done.

### PRD gaps not yet scheduled (likely phase 2; client deciding)

Sign in with Apple/Google; required name and ZIP at sign-up; skill level and
interests on profiles; filters by instructor, venue, free/paid; map view;
day/week/month calendar views; recurring classes; searching people; instructors
and DJs on events; several photos per event; a "My calendar" view; choosing
reminder times (24h and 2h); role-specific profile details and role tabs; the
dance and song catalog (Q5 open); per-type notification settings; "see who's
going"; creator verification; a web admin dashboard.

## 5. Working rules

- **Branches start from an up-to-date `develop`.** PRs go into `develop`. A
  release is a `develop` → `main` PR, opened only when the user asks.
  Heroku and Vercel deploy from `main`.
- **Only one PR open at a time.** Don't push or open the next PR until the
  previous one has merged. Then pull `develop`, bring your branch up to date
  with it, run the checks, push and open the PR. You can keep working locally
  on the next piece meanwhile. (Rule from Michael, 2026-11-12, to stop
  constant merge conflicts.)
- **If more than one PR is ever open anyway, merge `develop` into the others
  right after each merge**, resolve conflicts, run the checks and push.
- **Check a PR is still open before pushing to its branch**
  (`gh pr view <n> --json state`). If it's merged, open a new PR.
- **Every PR updates CHANGELOG.md** (Keep a Changelog, under Unreleased) **and
  this file.** Releases: `npm run release -- x.y.z` (RELEASING.md). Plan: 0.1.0
  once the legal details are in, 1.0.0 after polish.
- **Don't run a formatter over whole files.** It once rewrote the Events screen
  in a different quote style and buried a real change under hundreds of lines.
  Match the existing style by hand.
- **Before writing Expo code, check the versioned docs or the installed
  package's types.** APIs change between SDKs (AGENTS.md). For example,
  `expo-calendar`'s new API doesn't work in Expo Go, so we use
  `expo-calendar/legacy`.
- **Speak up** when something doesn't add up: something not deployed, a code
  path that silently does nothing, a plan that conflicts with an earlier
  decision. Put it first.
- **When asked what's left, compare the PRD's feature list (and unused schema
  columns) against what's built.** The client once had to point out that image
  uploads were missing.
- **Think through running cost and volume before proposing infrastructure.**
- **Test before reporting, and say what wasn't tested.** Never enter passwords,
  API keys or other secrets yourself; the user pastes them into
  Heroku/Supabase. Public keys (`phc_…`, `sb_publishable_…`) are fine to commit.
- **Write for the user and the client in plain language.** Record decisions in
  the Dev Discussions doc.

## 6. Checks and test setup

- `npm run typecheck`, `npm run lint -w @linestepper/mobile`, `npm test` (all
  workspaces, then edge functions, then `scripts/*.test.mjs`).
- **Local Postgres for migration tests:** a scratch cluster on
  `127.0.0.1:54329` (user `postgres`, TCP only) with stub `auth` and `storage`
  schemas. pg_cron and pg_net aren't available locally, so 0004 errors partway;
  that's expected.
- **iOS simulator:** iPhone 15 Plus with Expo Go. To test against a local API,
  run `EXPO_PUBLIC_API_URL=http://localhost:4000 npx expo start --port 8083` in
  `apps/mobile` and the API with `SUPABASE_URL=… PORT=4000 node dist/index.js`.
  Port 8081 is used by another service on the dev Mac, and the user's own Expo
  runs on 8082. Simulator screenshots lag one action behind.
- **Browser preview:** `.claude/launch.json` `linestepper-web` runs
  `expo start --web --port 8090` in `apps/mobile`.
- **Test plan for the client:** `handouts/LineUp2Step-Test-Plan.pdf` (not
  committed; generated by a reportlab script). Regenerate it when features
  change.

## 7. Change log of this document

- 2026-11-12: Created from the build history (sessions up to #31). Same day:
  #30 and #31 merged; one-PR-at-a-time rule added.
