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

Last updated: 2026-11-12, v0.1.0 live; Drive copy of this file posted.

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

- "LineUp2Step — Progress and shared context", Google Doc
  `1aEoo20DdfU_yZy2nI8T7Gp6ZlMH1yYtl0XBvW8uBRIs`: a copy of this file for the
  client. **This file is the source of truth**; refresh the Drive copy at each
  release (see Working rules).

All five are in the client's shared drive (`0AFEukbbjmOimUk9PVA`).

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
| Edge functions | `supabase/functions` | `send-reminders` (hourly via pg_cron), `send-notifications` (the outbox; pg_cron checks every minute, calls it only when something is due), `create-checkout`, `stripe-webhook`. |
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
  (0009), `events.followers_notified_at` (0013).
- **Telemetry:** every event name is in `packages/shared/src/telemetry/catalog.ts`
  and `packages/shared/src/logging/types.ts` (`LogEvents`). Never type an event
  name by hand; `scripts/telemetry-usage.test.mjs` fails if you do. Logs are
  scrubbed of emails, phones, cards and tokens (`logging/scrub.ts`); ids are
  kept intact.
- **No logs in the database.** It's billed on storage, and logs grow fast.
  Business records (purchases, posts, admin actions, bans) do stay there.
- **Every scrolling screen pads for the floating tab bar** (`useTabBarPadding()`
  or `BottomTabInset`); `scripts/tab-bar-padding.test.mjs` enforces it.
- **Accessibility:** every `Pressable` has `accessibilityRole` and every
  `TextInput` an `accessibilityLabel` (`scripts/accessibility.test.mjs`
  enforces both). Use the `aria-*` props (`aria-selected`, `aria-expanded`)
  for state: react-native-web ignores `accessibilityState`. Long screens
  scroll as a whole, so nothing is out of reach with large text.

**Heroku config vars:** `NODE_ENV=production`, `AUTH_PROVIDER=supabase`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTHOG_API_KEY`,
`CORS_ORIGINS=https://line-stepper-five.vercel.app`, `LOG_LEVEL=info`.
**Never set `NPM_CONFIG_WORKSPACE`:** it breaks the Heroku build.

## 3. Migrations: what's in the repo and what's live

Run each one in the Supabase SQL editor, in order. "Live" means it's confirmed
on the real project (by the user, or checked from outside after v0.1.0).

| # | File | What it does | Live? |
|---|---|---|---|
| 0001–0006 | initial schema, crews, flags/admins, reminders, post credits, ZIP radius search | Core tables and rules | Yes |
| 0007 | `account_deletion.sql` | Crew hand-off before deleting an account | Yes |
| 0008 | `moderation.sql` | Reports, blocks, bans, removals | Yes |
| 0009 | `images.sql` | `images` bucket, flyer/photo URL columns and guards | Yes |
| 0010 | `event_type_level.sql` | Event type and skill level (#30) | Yes |
| 0011 | `notification_outbox.sql` | Queue for change notices and new-event alerts, plus the minute job (#33) | Yes. `send-notifications` is deployed and passed the secret check (2026-11-12) |
| 0012 | `event_change_notices.sql` | Triggers that queue change notices for people who saved an event (#34) | Yes (triggers can't be seen from outside; 0013, which follows it, is live) |
| 0013 | `follower_event_alerts.sql` | `events.followers_notified_at` and triggers that queue new-event alerts for followers (#35) | Yes |

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
- **v0.1.0 (2026-11-12) added:** the pricing card and `/faq` (#28); event
  flyers and profile photos (#29; **a real upload hasn't been tested yet**);
  event type and skill level with filters (#30); Add to calendar (#31);
  the notification outbox (#33), change notices for saved events (#34) and
  new-event alerts for followers (#35), which need store builds to test on
  a real phone; the accessibility pass (#36).
  [Release notes](https://github.com/insaineyesay/LineStepper/releases/tag/v0.1.0).

### Merged to `develop`, not yet released

- Nothing yet (v0.1.0 shipped everything).

### Open PRs

- This one (links the Drive copy of this file).

### Phase 1 work still to do (in order)

These were recommended by the dev team on 2026-11-12. The client is reviewing
the PRD gap list below and may change the picks.

1. **Notification outbox and sender.** Done, #33. `notification_outbox`
   holds ready-worded notices (one waiting notice per person per topic, so
   repeated edits merge); `send-notifications` delivers them via Expo and
   deletes them. Chosen over the API because the database can call it only
   when there's work (Dev Discussions §14); cost is effectively zero.
2. **Change notices for saved events (PRD F3, F9).** Done, #34. Database
   triggers on `events` queue the notice (new time, new place, cancelled, no
   longer listed, back on) for bookmarkers with a phone, skipping the
   organizer, banned accounts and blocks. Waits 2 minutes for more edits,
   at most 4. Times are written in Eastern time (the whole launch region);
   revisit if the app expands west.
3. **New-event alerts for followers (PRD F9).** Done, #35. On an event's
   first publish, followers with a phone get "New event from …" after 2
   minutes (edits update it, unpublishing drops it). `followers_notified_at`
   stops re-publishing from alerting again. Respects blocks and bans.
4. **Accessibility pass.** Done, #36 (live in v0.1.0). Every tappable thing has a role
   (and selected/expanded state where it applies), every text box a label,
   page titles are headings, event cards read title first. Fixed at large
   text: the Events screen couldn't scroll (the header filled the screen),
   "★ Featured" was pushed off cards, the ZIP box was fixed-width. Big titles
   grow at most 1.5×; body text has no cap. Contrast of the theme colours
   passes AA (lowest: grey text on the "selected" grey, 4.55:1, just over
   the 4.5 needed; don't make either lighter). Checked in the iOS
   simulator at the AX3 and AX5 text sizes and in the browser; the signed-in
   screens (post form, own profile) were only checked in code. Still open:
   chips are about 28 points tall with a larger tap area, the native tab bar
   labels don't grow (iOS shows its own large-text view on long press), and
   nobody has used it with VoiceOver or TalkBack end to end.
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

Longer-term ideas (from the original README roadmap): merch pages (link out
first, commerce much later), step-sheet and dance tracking, in-app ticketing.

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
- **Releases:** merge every PR with **"Create a merge commit"**, never
  "Rebase and merge" or "Squash and merge" (they duplicate history and make
  every later release conflict). **Don't use GitHub's stacked-PR "Rebase
  stack" button** or stack the release PRs: during v0.1.0 the stack retargeted
  the version PR to `main` and the `develop` branch was deleted on GitHub (it
  was recreated from `main`; nothing was lost). After each release, check
  `develop` still exists and that `git log origin/develop..origin/main` is
  empty; if not, fast-forward `develop` to `main`. Then replace the Drive copy
  of this file (Google Doc `1aEoo20DdfU_yZy2nI8T7Gp6ZlMH1yYtl0XBvW8uBRIs`) with
  the released version.
- **Check a PR is still open before pushing to its branch**
  (`gh pr view <n> --json state`). If it's merged, open a new PR.
- **Every PR updates CHANGELOG.md** (Keep a Changelog, under Unreleased) **and
  this file.** Releases: `npm run release -- x.y.z` (RELEASING.md). v0.1.0
  was cut on 2026-11-12 (account deletion, report/block and the legal pages
  are in; the legal text is still a draft). Next: 1.0.0 after polish and the
  beta; minor versions (0.2.0, …) for feature releases before then.
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
- **Database tests:** `supabase/tests/run.sh` runs every migration on a
  throwaway local database and then `supabase/tests/*.test.sql`. Add a test
  file there for each migration with rules worth checking.
- **Edge function type check:** `npx deno check supabase/functions/<name>/index.ts`
  (not part of `npm test`).
- **Local Postgres for migration tests:** a scratch cluster on
  `127.0.0.1:54329` (user `postgres`, TCP only) with stub `auth`, `storage`, `cron`, `net` and `vault` schemas
  (`supabase/tests/stubs.sql`). Only 0004's two `create extension` lines fail;
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
  #30–#36 merged; one-PR-at-a-time rule added; v0.1.0 cut, released and
  verified live; `develop` recreated from `main` after GitHub deleted it;
  first copy posted to Google Drive.
