import { describe, expect, it } from 'vitest';

import { compareVersions, cutChangelog, nextVersion, notesFor } from './release-lib.mjs';

const changelog = `# Changelog

Intro.

## [Unreleased]

### Added
- Radius search.

## [0.0.1] - 2026-01-01

### Fixed
- Old thing.
`;

describe('versions', () => {
  it('bumps by part or takes an explicit version', () => {
    expect(nextVersion('0.0.0', 'minor')).toBe('0.1.0');
    expect(nextVersion('0.1.3', 'patch')).toBe('0.1.4');
    expect(nextVersion('0.9.2', 'major')).toBe('1.0.0');
    expect(nextVersion('0.1.0', '1.0.0-beta.1')).toBe('1.0.0-beta.1');
    expect(() => nextVersion('0.1.0', 'huge')).toThrow();
  });
  it('orders versions, with pre-releases before their release', () => {
    expect(compareVersions('0.1.0', '0.0.9')).toBe(1);
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });
});

describe('changelog', () => {
  it('turns Unreleased into the release and opens a new Unreleased', () => {
    const cut = cutChangelog(changelog, '0.1.0', '2026-12-01');
    expect(cut).toContain('## [Unreleased]\n\n## [0.1.0] - 2026-12-01\n\n### Added\n- Radius search.');
    expect(cut).toContain('## [0.0.1] - 2026-01-01');
    expect(notesFor(cut, '0.1.0')).toBe('### Added\n- Radius search.');
  });
  it('refuses to release with no notes', () => {
    const empty = cutChangelog(changelog, '0.1.0', '2026-12-01');
    expect(() => cutChangelog(empty, '0.2.0', '2026-12-02')).toThrow(/empty/);
  });
  it('finds notes for older versions', () => {
    expect(notesFor(changelog, '0.0.1')).toBe('### Fixed\n- Old thing.');
    expect(() => notesFor(changelog, '9.9.9')).toThrow();
  });
});
