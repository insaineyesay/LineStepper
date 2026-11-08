import { describe, expect, it } from 'vitest';

import {
  bookmarksToRelease,
  buildReminderPushes,
  chunk,
  emptyOutcome,
  recordBatch,
  reminderBody,
  startsInText,
  type DueReminder,
} from './reminders';

const now = new Date('2026-11-20T12:00:00Z');
const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3_600_000);

const due = (over: Partial<DueReminder> = {}): DueReminder => ({
  profile_id: 'p1',
  event_id: 'e1',
  title: 'Queen City Slide Night',
  starts_at: hoursFromNow(23).toISOString(),
  venue_name: 'Uptown Social Hall',
  city: 'Charlotte',
  ...over,
});

describe('startsInText', () => {
  it('rounds to whole hours', () => {
    expect(startsInText(hoursFromNow(23.2), now)).toBe('Starts in about 23 hours');
    expect(startsInText(hoursFromNow(1.4), now)).toBe('Starts in about 1 hour');
  });
  it('says within the hour for an hour or less', () => {
    expect(startsInText(hoursFromNow(1), now)).toBe('Starts within the hour');
    expect(startsInText(hoursFromNow(0.2), now)).toBe('Starts within the hour');
  });
});

describe('reminderBody', () => {
  it('adds the venue and city when known', () => {
    expect(reminderBody(due(), now)).toBe('Starts in about 23 hours · Uptown Social Hall, Charlotte');
    expect(reminderBody(due({ venue_name: null }), now)).toBe('Starts in about 23 hours · Charlotte');
    expect(reminderBody(due({ venue_name: null, city: null }), now)).toBe('Starts in about 23 hours');
  });
});

describe('buildReminderPushes', () => {
  it('sends one message per device and links to the event', () => {
    const pushes = buildReminderPushes(
      [due(), due({ profile_id: 'p2', event_id: 'e2' })],
      [
        { profile_id: 'p1', token: 'ExponentPushToken[a]' },
        { profile_id: 'p1', token: 'ExponentPushToken[b]' },
        { profile_id: 'p3', token: 'ExponentPushToken[c]' },
      ],
      now
    );
    expect(pushes.map((p) => p.message.to)).toEqual(['ExponentPushToken[a]', 'ExponentPushToken[b]']);
    expect(pushes[0].message).toMatchObject({
      title: 'Queen City Slide Night',
      sound: 'default',
      channelId: 'reminders',
      data: { url: '/event/e1' },
    });
  });
});

describe('chunk', () => {
  it('splits into batches of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});

describe('recordBatch + bookmarksToRelease', () => {
  const reminders = [due(), due({ profile_id: 'p2', event_id: 'e2' }), due({ profile_id: 'p3', event_id: 'e3' })];
  const pushes = buildReminderPushes(
    reminders,
    [
      { profile_id: 'p1', token: 'ExponentPushToken[ok]' },
      { profile_id: 'p1', token: 'ExponentPushToken[gone]' },
      { profile_id: 'p2', token: 'ExponentPushToken[gone2]' },
      { profile_id: 'p3', token: 'ExponentPushToken[p3]' },
    ],
    now
  );

  it('keeps a bookmark sent if any of its devices got it, and drops dead tokens', () => {
    const outcome = emptyOutcome();
    recordBatch(outcome, pushes.slice(0, 3), [
      { status: 'ok', id: 't1' },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    ]);
    recordBatch(outcome, pushes.slice(3), null); // whole request failed

    expect([...outcome.deadTokens]).toEqual(['ExponentPushToken[gone]', 'ExponentPushToken[gone2]']);
    expect(outcome.failed).toBe(3);
    expect(bookmarksToRelease(reminders, outcome).map((r) => r.event_id)).toEqual(['e2', 'e3']);
  });
});
