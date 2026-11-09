#!/usr/bin/env node
// Sets one version across the repo and cuts the changelog. See RELEASING.md.
//
//   npm run release -- 0.1.0        (or: major | minor | patch)
//   npm run release:notes -- 0.1.0  (prints that version's notes)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareVersions, cutChangelog, nextVersion, notesFor } from './release-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every file that carries the version. The app's store build numbers (iOS
// buildNumber, Android versionCode) are separate and handled by EAS.
const PACKAGE_FILES = [
  'package.json',
  'apps/mobile/package.json',
  'apps/web/package.json',
  'apps/api/package.json',
  'packages/shared/package.json',
];
const APP_JSON = 'apps/mobile/app.json';
const CHANGELOG = 'CHANGELOG.md';

const read = (file) => readFileSync(join(root, file), 'utf8');
const write = (file, text) => writeFileSync(join(root, file), text);
const readJson = (file) => JSON.parse(read(file));
const writeJson = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');

function main([command, arg]) {
  if (command === 'notes') {
    if (!arg) throw new Error('usage: npm run release:notes -- <version>');
    process.stdout.write(notesFor(read(CHANGELOG), arg) + '\n');
    return;
  }

  if (!arg) throw new Error('usage: npm run release -- <major|minor|patch|x.y.z>');
  const current = readJson('package.json').version;
  const version = nextVersion(current, arg);
  if (compareVersions(version, current) <= 0) {
    throw new Error(`${version} is not newer than the current ${current}`);
  }

  const date = new Date().toISOString().slice(0, 10);
  write(CHANGELOG, cutChangelog(read(CHANGELOG), version, date));
  for (const file of PACKAGE_FILES) {
    const pkg = readJson(file);
    pkg.version = version;
    writeJson(file, pkg);
  }
  const app = readJson(APP_JSON);
  app.expo.version = version;
  writeJson(APP_JSON, app);

  console.log(`Version ${current} → ${version}. Next (RELEASING.md):
  1. npm install            (updates package-lock.json)
  2. commit on a release/v${version} branch, PR into develop, then develop → main
  3. after it merges to main:
     gh release create v${version} --target main --title "v${version}" --notes "$(npm run -s release:notes -- ${version})"`);
}

try {
  main(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
