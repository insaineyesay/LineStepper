import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Every telemetry event must come from the catalog
// (packages/shared/src/telemetry/catalog.ts). Call sites use LogEvents.x,
// which a shared-package test ties to the catalog; this check catches event
// names typed as strings, which would bypass it.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['apps/mobile/src', 'apps/api/src'];
const HAND_TYPED = /logger\.(debug|info|warn|error)\(\s*['"`]/;

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('telemetry call sites', () => {
  it('never type an event name by hand', () => {
    const offenders = DIRS.flatMap((d) => filesUnder(join(root, d)))
      .filter((file) => HAND_TYPED.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });
});
