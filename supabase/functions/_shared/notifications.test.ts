import { describe, expect, it } from 'vitest';

import {
  buildNotificationPushes,
  emptyNotificationOutcome,
  recordNotificationBatch,
  settleNotifications,
  type ClaimedNotification,
} from './notifications';

const row = (over: Partial<ClaimedNotification> = {}): ClaimedNotification => ({
  id: 1,
  profile_id: 'p1',
  kind: 'event_update',
  title: 'Queen City Slide Night: new time',
  body: 'Now Sat, Nov 21 at 7:00 PM',
  url: '/event/e1',
  claim_token: 'tok',
  ...over,
});

const tokens = [
  { profile_id: 'p1', token: 'ExponentPushToken[a]' },
  { profile_id: 'p1', token: 'ExponentPushToken[b]' },
  { profile_id: 'p2', token: 'ExponentPushToken[c]' },
];

describe('buildNotificationPushes', () => {
  it('sends one message per device on the updates channel', () => {
    const pushes = buildNotificationPushes([row(), row({ id: 2, profile_id: 'p3' })], tokens);
    expect(pushes.map((p) => [p.rowId, p.message.to])).toEqual([
      [1, 'ExponentPushToken[a]'],
      [1, 'ExponentPushToken[b]'],
    ]);
    expect(pushes[0].message).toEqual({
      to: 'ExponentPushToken[a]',
      title: 'Queen City Slide Night: new time',
      body: 'Now Sat, Nov 21 at 7:00 PM',
      sound: 'default',
      channelId: 'updates',
      data: { url: '/event/e1', kind: 'event_update' },
    });
  });

  it('leaves out the link when the row has none', () => {
    const [push] = buildNotificationPushes([row({ url: null })], tokens);
    expect(push.message.data).toEqual({ kind: 'event_update' });
  });
});

describe('settleNotifications', () => {
  const rows = [row(), row({ id: 2, profile_id: 'p2' }), row({ id: 3, profile_id: 'p3' })];
  const pushes = buildNotificationPushes(rows, tokens);

  it('finishes delivered rows and rows with no device, retries the rest', () => {
    const outcome = emptyNotificationOutcome();
    // p1: one device ok, one gone. p2: request failed.
    recordNotificationBatch(outcome, pushes.slice(0, 2), [
      { status: 'ok', id: 't1' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);
    recordNotificationBatch(outcome, pushes.slice(2), null);

    expect([...outcome.deadTokens]).toEqual(['ExponentPushToken[b]']);
    expect(outcome.failed).toBe(2);
    expect(settleNotifications(rows, pushes, outcome)).toEqual({ done: [1, 3], retry: [2] });
  });

  it('finishes a row whose only devices are gone', () => {
    const outcome = emptyNotificationOutcome();
    const p2 = pushes.filter((p) => p.rowId === 2);
    recordNotificationBatch(outcome, p2, [{ status: 'error', details: { error: 'DeviceNotRegistered' } }]);
    expect(settleNotifications([rows[1]], p2, outcome)).toEqual({ done: [2], retry: [] });
  });

  it('retries a row when Expo had a temporary error', () => {
    const outcome = emptyNotificationOutcome();
    const p2 = pushes.filter((p) => p.rowId === 2);
    recordNotificationBatch(outcome, p2, [{ status: 'error', details: { error: 'MessageRateExceeded' } }]);
    expect(settleNotifications([rows[1]], p2, outcome)).toEqual({ done: [], retry: [2] });
  });
});
