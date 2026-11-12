# Changelog

Notable changes to LineUp2Step (the mobile app, the web app built from it,
the Supabase backend and the API). Each release has one version across the
whole repo. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions before 1.0.0 are previews: anything can change between them. The
plan is 0.1.0 once account deletion, report/block and the legal pages are in,
and 1.0.0 after polish and beta. How to cut a release: [RELEASING.md](RELEASING.md).

Add a line under "Unreleased" in the same pull request as the change.

## [Unreleased]

### Added
- Change notices for saved events. When a published, upcoming event gets a
  new date, time or place, is cancelled, or stops being listed (moved back to
  draft, deleted, or removed by a moderator), everyone who bookmarked it gets
  a push notice within about 5 minutes; if it comes back, they're told it's
  back on. Edits within 2 minutes merge into one notice. Not sent to the
  organizer, banned accounts, or across a block. Migration 0012; switched by
  the `events.change_alerts` flag. The bookmark note, Profile and the event
  form say so, and the privacy and terms text mention it.
- Notification outbox: one queue (`notification_outbox`, migration 0011) for
  notices other than reminders, and a `send-notifications` edge function that
  delivers them through Expo push. pg_cron checks the queue every minute and
  calls the function only when something is due. Sent rows are deleted;
  failures are retried 5 times. Android gets a separate "Event changes and new
  events" channel. Nothing writes to the queue yet (change notices and
  new-event alerts come next). Local database tests: `supabase/tests/run.sh`.
- Add to calendar on every event page. On phones it opens the system "New
  Event" screen, filled in, so no calendar permission is needed. On the web
  it downloads a calendar file (Apple Calendar, Outlook) and offers a Google
  Calendar link. Events without an end time are entered as 3 hours long.
- Event type (class, social, workshop, competition, festival) and skill level
  (all levels, beginner, intermediate, advanced). Chosen on the event form
  (type is required for new events), shown on event pages and list cards, and
  filterable on Events under "Type & level". An "All levels" event shows under
  every level filter.
- "How LineUp2Step works" card on Events: the $0.99 app purchase covers a
  profile, finding events and connecting; each post is $0.99 (noted as free
  while paid posting is off). Links to a new FAQ page (`/faq`), also linked
  from the bottom of Profile. "Got it" hides the card on that device.
- Event flyers and profile photos. Add, change or remove a flyer on the event
  form and a photo on Profile. Photos are shrunk on the phone before upload.
  Flyers show on the event page and as thumbnails in the Events list;
  profile photos show on people's pages. Uploads go through the API
  (`/images/uploads`, `/images/attach`, `DELETE /images`) into Supabase
  Storage, and only the API can set image links. Deleting an account deletes
  its images.
- Terms of Service and Privacy Policy pages (`/legal/terms`, `/legal/privacy`),
  readable without signing in, linked from the sign-in card and the bottom of
  Profile. Disclaimers at the foot of every event and crew page. Draft text
  with placeholders until the client fills in the details
  (`apps/mobile/src/content/legal.ts`).
- Report and block. Anyone signed in can report an event, crew or person
  (spam, harassment, inappropriate, fake, something else), and block a person
  from their profile. Blocking hides both people from each other (profiles,
  events, crews, member lists) and removes follows between them; unblock from
  Profile → Blocked people.
- Moderation screen for admins: open reports, oldest first, with Dismiss,
  Remove (event or crew) and Ban. A ban hides everything the person posted,
  stops them signing in and keeps their email from signing up again. Every
  action is logged with who did it.
- Delete account, at the bottom of Profile. It removes the profile, the
  events the person posted, their bookmarks, follows, crew memberships,
  reminders and unused posts. Crews they started pass to the next member (an
  admin first, then whoever joined earliest), or are deleted if no one else
  is in them. Served by the API (`DELETE /me`).
- Event and crew forms autosave on the device as you type. Leaving a form
  (say, by tapping a tab) and coming back picks up where you left off, with
  a "Start over" option. The saved copy is deleted once the form is saved.
- Events calendar with search and date filters, and an event page with
  venue, price, ticket link and host.
- Radius search: events within 5, 10, 25, 50 or 100 miles of a ZIP code or
  your current location, with the distance on each event. Starts at your
  profile ZIP. Location stays on the device apart from the search itself.
- Posting events, with drafts, editing and cancelling. New events need a ZIP.
- Paid posting: publishing an event uses one post credit. Posts are bought
  on the web with Stripe (1 for $0.99, 5 for $4.95, 10 for $9.90). Switched
  off until payments are set up.
- Bookmarks, and push reminders about a day before a bookmarked event.
  Tapping a reminder opens the event.
- Crews: crew pages, starting and editing a crew, join requests, and
  approving or removing members.
- Profiles: sign-in with an emailed 6-digit code, display name, handle,
  role, home area and ZIP, plus public member pages.
- Feature flags that admins can switch without a deploy.
- Logging of screen views, taps, sign-in and app events, behind one logger.
- Crash reporting: errors the app doesn't handle, and screens that fail to
  draw, are sent to the API with the app version and platform. A failed
  screen shows "Something went wrong" with a Try again button.
- Telemetry layer: one catalog of every event (analytics, logs, errors)
  shared by the apps and the API, with plug-in adapters. PostHog is the
  first: taps, screens and key actions as analytics, crashes as error
  tracking.
- "Share usage data" switch on the Profile tab. Crash reports are still
  sent when it's off.
- The API can run on Heroku (setup in GETTING_STARTED.md). Server logs and
  the apps' warnings, errors and key events go to Heroku's log.
- The app version is shown at the bottom of the Profile tab.

### Changed
- PROGRESS.md: the living handoff document (what's built and live, what's
  left, architecture rules, working rules). AGENTS.md now says to read it
  first and update it in every PR.
- The apps now send warnings, errors and key events to the API on Heroku,
  and read feature flags from it.
- Internal: screens and components get data only through one data layer
  (`apps/mobile/src/data`, one module per area), so each area can move from
  direct database access to the API without screen changes. A test blocks
  direct database calls anywhere else.
- The tab bar stays on every screen, and tapping a tab returns to its first
  screen.
- The app opens on the Events tab.

### Fixed
- Logs no longer mangle ids whose digits look like a phone or card number.
- The tab bar no longer covers the bottom of inner screens on phones, so
  the Post event, Save and other bottom buttons can be tapped.
- Blank page on the production web build.
- Filter chips cut off on the web.
