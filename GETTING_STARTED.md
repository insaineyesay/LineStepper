# Getting started locally

This guide gets the LineStepper apps running on your computer: the mobile
app (Expo), the API and the dashboard.

## 1. What you need

- **Node.js 26 (current LTS)** recommended; 22.18+ and 24.11+ also work (check with `node -v`). npm comes with it. With nvm, run `nvm install && nvm use` in the repo; the `.nvmrc` file picks the version.
- **Git**, and access to the GitHub repo.
- **Access to the team's Supabase project**: its URL, publishable key and
  secret key.
- To see the app on a phone or simulator, pick one or more:
  - **Expo Go** on your phone (App Store or Google Play). This is the easiest.
  - **iOS Simulator** (Mac only; install Xcode).
  - **Android emulator** (install Android Studio).
  - **A web browser.** This works with nothing extra installed.

## 2. Get the code and install

```bash
git clone https://github.com/insaineyesay/LineStepper.git
cd LineStepper
npm install
```

Always run `npm install` from the repo root. It installs every app in the
repo at once.

## 3. Set up the database (once per Supabase project)

Skip this if someone has already done it for the project you're using.

1. In Supabase, open the **SQL Editor**.
2. Run each file in `supabase/migrations`, one at a time, in this order:
   1. `0001_initial_schema.sql`
   2. `0002_crew_owner_membership.sql`
   3. `0003_feature_flags_and_admins.sql`
   4. `0004_event_reminders.sql`
3. Optional: run `supabase/seed_sample_data.sql` to add sample events and
   crews.
4. Make sign-in emails contain a code. The app signs you in with a 6-digit
   code, but Supabase's default email sends a link instead.
   - Go to **Authentication → Emails → Templates**. Edit both **Magic Link**
     (returning users) and **Confirm signup** (a user's first sign-in): replace
     `{{ .ConfirmationURL }}` with `{{ .Token }}`. For example:
     `Your LineStepper code is {{ .Token }}`.
   - Under **Authentication → Sign In / Providers → Email**, check that
     **Email OTP Length** is `6`.

### Event reminders (push notifications)

Every hour, Supabase sends a push notification for each bookmarked event
starting in the next 24 hours. These steps are done once per Supabase project.
`<ref>` is your project ref: the `xxxx` in `https://xxxx.supabase.co`.

1. Run `0004_event_reminders.sql` (step 2 above). It creates the hourly job.
2. Link the app to an Expo project. Without this, phones can't get a push
   token. From `apps/mobile`, run `npx eas-cli@latest init` and sign in with
   your Expo account. It adds `extra.eas.projectId` to `app.json`. Commit
   that change.
3. Make up a long random secret. It stops strangers from triggering the
   reminder job:
   ```bash
   openssl rand -hex 32
   ```
4. In the SQL Editor, store the secret and your project URL for the job:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<the secret>', 'reminders_cron_secret');
   ```
5. Deploy the function and give it the same secret (from the repo root):
   ```bash
   npx supabase login
   npx supabase functions deploy send-reminders --no-verify-jwt --project-ref <ref>
   npx supabase secrets set CRON_SECRET=<the secret> --project-ref <ref>
   ```
6. Check it runs:
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/send-reminders -H "x-cron-secret: <the secret>"
   ```
   You should get back something like `{"claimed":0,"sent":0}`.

To turn reminders off without deploying, an admin sets the
`events.reminders` or `notify.push` flag to off.

Push notifications need a **development build**, not Expo Go. Android Expo
Go can't receive them, and Expo Go can't get a token for your project. See
section 7.

## 4. Create your env files

Each app reads its own settings file. Copy the examples:

```bash
cp apps/mobile/.env.example apps/mobile/.env
cp apps/api/.env.example    apps/api/.env
cp apps/web/.env.example    apps/web/.env.local
```

Then fill them in. The keys are in Supabase under **Project Settings → API
Keys**.

**`apps/mobile/.env`**

| Setting | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL, e.g. `https://abcd1234.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The **publishable** key (`sb_publishable_…`) |
| `EXPO_PUBLIC_API_URL` | `http://localhost:4000`. On a real phone, see step 7. |
| `EXPO_PUBLIC_SENTRY_DSN` | Leave empty for now |

**`apps/api/.env`**

| Setting | Value |
| --- | --- |
| `SUPABASE_URL` | Same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | The **secret** key (`sb_secret_…`). Server only; never put it in the mobile or web app. |
| `AUTH_PROVIDER` | `supabase`. Use `none` to run the API without Supabase. |
| `CORS_ORIGINS` | `http://localhost:8082,http://localhost:3000` |
| `FLAGS` | Leave empty. To turn features on locally, use e.g. `booking=on`. |
| `PAPERTRAIL_TOKEN`, `SENTRY_DSN` | Leave empty locally. Logs still print in the terminal. |

**`apps/web/.env.local`**

| Setting | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` |

Never commit `.env` files. Git already ignores them.

## 5. Run everything

Open three terminals at the repo root:

```bash
npm run dev:api      # terminal 1 — API on http://localhost:4000
npm run dev:mobile   # terminal 2 — Expo (Metro) on port 8082
npm run dev:web      # terminal 3 — dashboard on http://localhost:3000
```

In the Expo terminal, press:

- `w` to open the app in your browser
- `i` to open it in the iOS Simulator
- `a` to open it in the Android emulator
- or scan the QR code with your phone's camera (iPhone) or the Expo Go app
  (Android)

Check that the API is up by opening http://localhost:4000/health.

You don't need all three running:

- **The mobile app works on its own.** Without the API, features use their
  default on/off settings and logs only print in the Expo terminal.
- **The dashboard needs the API** to show live flag settings.

## 6. Use the app

1. Open the **Profile** tab, enter your email and tap to get a code.
2. Enter the 6-digit code from the email. You're signed in.
3. Fill in your profile (handle, home metro, role) and save.
4. Browse **Events** and **Crews**, post an event, or start a crew.

**Make yourself an admin.** You need this to change feature flags.

1. Find your user ID under **Authentication → Users** in Supabase.
2. Run this in the SQL Editor:

```sql
update profiles set is_admin = true where id = '<your user id>';
```

**Change a feature flag.** Do this from the API while signed in as an admin:

```bash
curl -X PUT http://localhost:4000/admin/flags/booking \
  -H "Authorization: Bearer <your access token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

`GET http://localhost:4000/flags` shows the current value of every flag.
Flags that only matter locally are easier to set with `FLAGS=` in
`apps/api/.env`.

**See the logs.** API logs, and app logs sent to the API, print as JSON lines
in the API terminal. Every line has a `requestId` and, when you're signed in,
a `userId`.

## 7. Running on a real phone

Your phone can't reach `localhost` on your computer.

1. Find your computer's local network IP:
   - Mac: `ipconfig getifaddr en0`
   - Windows: `ipconfig`
2. Set `EXPO_PUBLIC_API_URL=http://<that IP>:4000` in `apps/mobile/.env`.
3. Restart Expo with `npm run dev:mobile`.

The phone and computer must be on the same Wi-Fi. If the QR code won't
connect, run `npx expo start --tunnel` from `apps/mobile` instead.

**To test event reminders on a phone**, you need a development build: your
own version of the app with push notifications turned on. From `apps/mobile`:

- iOS needs a paid Apple Developer account. Register your phone with
  `npx eas-cli device:create`, then run
  `npx eas-cli build --profile development --platform ios`. Say yes when it
  asks to set up push notifications.
- Android needs Firebase (FCM V1) credentials uploaded to Expo first. See
  https://docs.expo.dev/push-notifications/fcm-credentials/. Then run
  `npx eas-cli build --profile development --platform android`.

Install the build on your phone, run `npm run dev:mobile`, and open the
project from the build instead of Expo Go.

## 8. Everyday commands (from the repo root)

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (shared package and API) |
| `npm run typecheck` | Type-check every app |
| `npm run lint` | Lint the mobile app |
| `npm run build:api` | Build the API the way Heroku will |
| `npm install <pkg> -w @linestepper/api` | Add a package to one app. Use `@linestepper/mobile`, `/web` or `/shared` for the others. |
| `npx expo install <pkg>` (run in `apps/mobile`) | Add an Expo or React Native package at the version that matches the SDK |

## 9. Updating dependencies

The goal is the newest **stable** version of everything, checked against the
registry, with no known vulnerabilities (`npm audit` should report 0).

- **Expo and React Native packages** (`expo-*`, `react`, `react-native`,
  `react-native-*`, `@react-native-async-storage/*`) must match the Expo
  SDK, not npm's "latest". Upgrade them all together with
  `npx expo install expo@^<next SDK> --fix`, run in `apps/mobile`. Then
  compare against Expo's starter template for that SDK.
- **Everything else:** check `npm outdated` and upgrade to the latest stable
  version.
- **Never run `npm audit fix --force`.** It makes breaking downgrades (it
  once swapped Expo 57 for 53). If `npm audit` reports something, find which
  package pulls it in (`npm ls <pkg>`) and upgrade that package. If that
  isn't possible yet, add a scoped entry to `overrides` in the root
  `package.json` and note why.
- After any upgrade, run `npm test`, `npm run typecheck`, `npm run lint` and
  `npm run build:api` before committing.

Current deliberate holds, all because the packages that use them haven't
released support yet:

| Package | Held at | Why |
| --- | --- | --- |
| TypeScript | 6.0 (7.0 is out) | typescript-eslint supports TypeScript below 6.1 only, and Expo's SDK 58 template uses 6.0. |
| ESLint | 9.39 (10 is out) | eslint-plugin-import and eslint-plugin-react, which Expo's lint config uses, don't support ESLint 10 yet. |
| async-storage | 2.2.0 (3.x is out) | 2.2.0 is the version Expo SDK 58 is tested with and ships in Expo Go. |
| `overrides`: minimatch 11, glob 14 | — | Fix moderate advisories in versions pulled in by the Expo CLI and typescript-eslint. Remove once those packages update. |

## 10. Troubleshooting

| Problem | Fix |
| --- | --- |
| `relation "public.profiles" does not exist` | Migrations weren't run, or were run out of order. Run 0001 → 0002 → 0003. |
| Sign-in email has a link, not a code | Add `{{ .Token }}` to both the Magic Link and Confirm signup email templates (step 3). |
| `fetch failed: A server with the specified hostname could not be found` | The Supabase URL in `apps/mobile/.env` doesn't exist. The project is probably paused (restore it in the dashboard) or was replaced. Copy the current URL and key from the project's **Connect** button. |
| "Email rate limit exceeded" | Supabase's built-in email sender allows only a few emails an hour. Wait, or set up custom SMTP (we plan to use Resend). |
| App says "Backend not connected" | `apps/mobile/.env` is missing or empty. Fill it in and restart Expo. |
| Signed in, but the API returns 401 | Your Supabase project uses the legacy JWT secret. Copy it from **Project Settings → JWT Keys** into `SUPABASE_JWT_SECRET` in `apps/api/.env`. |
| Unable to resolve `@linestepper/shared`, or changes not showing | Run `npm install` at the repo root, then `npx expo start -c` in `apps/mobile` to clear the cache. |
| `npm warn install-scripts` for esbuild / fsevents | Run `npm install-scripts approve esbuild` and `npm install-scripts approve fsevents`. esbuild builds the API, and fsevents is the Mac file watcher. |
| Port already in use | Stop the other process, or change `PORT` in `apps/api/.env` (and `EXPO_PUBLIC_API_URL` to match). |
| Browser error about CORS | Add the page's address to `CORS_ORIGINS` in `apps/api/.env` and restart the API. |
| Flags never change in the app | Check that the API is running and `EXPO_PUBLIC_API_URL` is right. The app re-checks flags each time it comes to the foreground. |
