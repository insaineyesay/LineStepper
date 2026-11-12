import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Screen readers (VoiceOver, TalkBack) only announce something as tappable
// when it has a role, and only name a text box when it has a label: a
// placeholder isn't a label. The PRD targets WCAG 2.1 AA, so every Pressable
// says what it is and every TextInput says what it's for.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'apps/mobile/src');

// Pressables whose role comes from elsewhere (expo-router's tab trigger
// passes its own link props through).
const ROLE_EXEMPT = new Set(['apps/mobile/src/components/app-tabs.web.tsx']);

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

/** The text of each opening tag `<Name ...>` in a file (props may span lines). */
function openingTags(src, name) {
  const tags = [];
  const re = new RegExp(`<${name}\\b`, 'g');
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 0;
    let i = m.index + name.length + 1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && src[i - 1] !== '=') break;
    }
    tags.push({ text: src.slice(m.index, i + 1), line: src.slice(0, m.index).split('\n').length });
  }
  return tags;
}

function offenders(name, required) {
  return sources(srcDir).flatMap((file) => {
    const rel = relative(root, file);
    if (name === 'Pressable' && ROLE_EXEMPT.has(rel)) return [];
    return openingTags(readFileSync(file, 'utf8'), name)
      .filter((tag) => !required.test(tag.text))
      .map((tag) => `${rel}:${tag.line}`);
  });
}

describe('accessibility', () => {
  it('every Pressable has a role', () => {
    expect(offenders('Pressable', /\baccessibilityRole=|\brole=/)).toEqual([]);
  });

  it('every TextInput has a label', () => {
    expect(offenders('TextInput', /\baccessibilityLabel=|\baria-label=/)).toEqual([]);
  });
});
