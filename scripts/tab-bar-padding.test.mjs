import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// On phones the tab bar floats over the screen, so every screen that scrolls
// must pad its bottom by the tab bar's height. Without it the last thing on
// the screen (often the Save or Post button) sits under the bar and can't be
// tapped. Inner screens use useTabBarPadding(); the tab roots use
// BottomTabInset inside their SafeAreaView.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'apps/mobile/src/app');

function screens(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return screens(path);
    return /\.tsx$/.test(name) && !name.startsWith('_layout') ? [path] : [];
  });
}

describe('tab bar padding', () => {
  it('every scrolling screen leaves room for the tab bar', () => {
    const missing = screens(appDir)
      .filter((file) => {
        const src = readFileSync(file, 'utf8');
        return /<(ScrollView|FlatList|SectionList)\b/.test(src) && !/useTabBarPadding\(|BottomTabInset/.test(src);
      })
      .map((file) => relative(root, file));
    expect(missing).toEqual([]);
  });
});
