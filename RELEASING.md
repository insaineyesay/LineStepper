# Releasing

One version covers the whole repo: the mobile app, the web app built from it,
the API and the shared package. It follows [Semantic Versioning](https://semver.org):

| Change | Before 1.0.0 | From 1.0.0 |
|---|---|---|
| Breaking change (data, API, or something users rely on) | minor (0.1.0 → 0.2.0) | major (1.x → 2.0.0) |
| New feature | minor | minor (1.1.0 → 1.2.0) |
| Bug fix only | patch (0.1.0 → 0.1.1) | patch |

Milestones: **0.1.0** when account deletion, report/block and the legal
pages are in; **1.0.0** after polish and the beta.

## Release notes as you go

Every pull request that changes what people see or what the backend does
adds a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), in
plain words, under Added, Changed, Fixed or Removed.

## Cutting a release

1. From an up-to-date `develop`, on a new branch:
   ```bash
   git switch develop && git pull && git switch -c release/v0.1.0
   ```
2. Set the version everywhere and turn "Unreleased" into this release:
   ```bash
   npm run release -- 0.1.0
   ```
   You can also pass `patch`, `minor` or `major`. This updates every
   `package.json`, `apps/mobile/app.json` and `CHANGELOG.md`, and refuses if
   the version isn't newer or there are no notes.
3. Run `npm install` (updates `package-lock.json`), check the diff, commit,
   and open a PR into `develop`.
4. After it merges, open the `develop` → `main` PR. Vercel deploys `main`.
5. After that merges, tag it and publish the release notes on GitHub:
   ```bash
   git switch main && git pull
   gh release create v0.1.0 --target main --title "v0.1.0" --notes "$(npm run -s release:notes -- 0.1.0)"
   ```
6. If the release includes database changes, run the new
   `supabase/migrations` files on Supabase **before** step 4.

## Phone app builds

The version above is what people see in the stores (`expo.version`). The
stores also need a build number that goes up on every upload (iOS
`buildNumber`, Android `versionCode`). Let EAS manage those: when `eas.json`
is created, set `"cli": { "appVersionSource": "remote" }` and
`"autoIncrement": true` on the production build profile.
