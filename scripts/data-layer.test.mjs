import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The app's screens and components get data only through apps/mobile/src/data
// (one module per area). That's what lets each area move from Supabase to
// our API without touching screens. Only these files may reach the backend
// SDK directly:
const ALLOWED = new Set([
  'apps/mobile/src/lib/supabase.ts', // creates the client
  'apps/mobile/src/data/backend.ts', // hands it to the data modules
  'apps/mobile/src/lib/auth/index.ts', // sign-in adapter (behind the AuthClient interface)
  'apps/mobile/src/lib/auth/supabase-auth-client.ts',
]);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = join(root, 'apps/mobile/src');
const IMPORTS_BACKEND = /from\s+['"](@\/lib\/supabase|(\.\.?\/)+(lib\/)?supabase|@supabase\/supabase-js)['"]/;

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('data layer', () => {
  it('is the only way screens and components reach the backend', () => {
    const offenders = filesUnder(appSrc)
      .map((file) => relative(root, file))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => IMPORTS_BACKEND.test(readFileSync(join(root, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('data modules other than backend.ts never import the SDK themselves', () => {
    const dataDir = join(appSrc, 'data');
    const offenders = filesUnder(dataDir)
      .map((file) => relative(root, file))
      .filter((file) => file !== 'apps/mobile/src/data/backend.ts')
      .filter((file) => IMPORTS_BACKEND.test(readFileSync(join(root, file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
