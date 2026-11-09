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
- The API can run on Heroku (setup in GETTING_STARTED.md). The app uploads
  warnings, errors and a few key events there; taps and screen views stay
  on the device.

### Changed
- The tab bar stays on every screen, and tapping a tab returns to its first
  screen.
- The app opens on the Events tab.

### Fixed
- Blank page on the production web build.
- Filter chips cut off on the web.
