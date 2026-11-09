// Pure helpers for scripts/release.mjs (tested in release-lib.test.mjs).

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

export function parseVersion(version) {
  const m = SEMVER.exec(version);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null };
}

/** -1, 0 or 1. A pre-release (0.1.0-beta.1) sorts before its release (0.1.0). */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`);
  for (const k of ['major', 'minor', 'patch']) {
    if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** "major" | "minor" | "patch" | an explicit version → the next version. */
export function nextVersion(current, bump) {
  if (parseVersion(bump)) return bump;
  const v = parseVersion(current);
  if (!v) throw new Error(`current version is not semver: ${current}`);
  if (bump === 'major') return `${v.major + 1}.0.0`;
  if (bump === 'minor') return `${v.major}.${v.minor + 1}.0`;
  if (bump === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;
  throw new Error(`use major, minor, patch or a version like 0.1.0 (got "${bump}")`);
}

const UNRELEASED = /^## \[Unreleased\][^\n]*\n/m;

/**
 * Turns the changelog's "Unreleased" section into the release, and starts a
 * new empty "Unreleased" section above it.
 */
export function cutChangelog(changelog, version, date) {
  const match = UNRELEASED.exec(changelog);
  if (!match) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  const start = match.index + match[0].length;
  const nextHeading = changelog.slice(start).search(/^## \[/m);
  const body = nextHeading === -1 ? changelog.slice(start) : changelog.slice(start, start + nextHeading);
  if (!body.trim()) throw new Error('the Unreleased section is empty: add release notes first');
  return (
    changelog.slice(0, match.index) +
    `## [Unreleased]\n\n## [${version}] - ${date}\n` +
    changelog.slice(start)
  );
}

/** The notes for one version, for the GitHub release. */
export function notesFor(changelog, version) {
  const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\][^\\n]*\\n`, 'm');
  const match = heading.exec(changelog);
  if (!match) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const start = match.index + match[0].length;
  const next = changelog.slice(start).search(/^## \[/m);
  return (next === -1 ? changelog.slice(start) : changelog.slice(start, start + next)).trim();
}
