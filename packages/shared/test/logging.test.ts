import { describe, expect, it } from 'vitest';

import { createLogger, REDACTED, scrub, validateClientBatch, type LogEvent } from '../src/logging';

describe('scrub', () => {
  it('redacts sensitive keys at any depth', () => {
    const out = scrub({ email: 'a@b.co', nested: { phoneNumber: '1', ok: 'fine' }, card_last4: '4242' });
    expect(out).toEqual({ email: REDACTED, nested: { phoneNumber: REDACTED, ok: 'fine' }, card_last4: REDACTED });
  });

  it('redacts emails, phones, cards and JWTs inside free text', () => {
    const s = scrub('mail jo@x.com call (757) 555-0100 card 4242 4242 4242 4242 tok eyJa.eyJb.sig');
    expect(s).not.toMatch(/jo@x\.com|555-0100|4242 4242|eyJa/);
  });

  it('leaves ids and numbers alone', () => {
    expect(scrub({ userId: '7f9c1e2a-1111-4c3b-9d1e-0a2b3c4d5e6f', durationMs: 120 })).toEqual({
      userId: '7f9c1e2a-1111-4c3b-9d1e-0a2b3c4d5e6f',
      durationMs: 120,
    });
  });
});

describe('createLogger', () => {
  it('stamps context, scrubs and survives a throwing transport', () => {
    const seen: LogEvent[] = [];
    const log = createLogger({
      source: 'api',
      context: { requestId: 'r1' },
      transports: [
        { name: 'boom', write: () => { throw new Error('x'); } },
        { name: 'mem', write: (e) => seen.push(e) },
      ],
    });
    log.child({ userId: 'u1' }).info('ui.tap', { label: 'Save', email: 'x@y.z' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ event: 'ui.tap', requestId: 'r1', userId: 'u1', source: 'api' });
    expect(seen[0]!.data).toEqual({ label: 'Save', email: REDACTED });
  });

  it('respects minLevel', () => {
    const seen: LogEvent[] = [];
    const log = createLogger({ source: 'api', minLevel: 'warn', transports: [{ name: 'm', write: (e) => seen.push(e) }] });
    log.info('a.b');
    log.warn('a.c');
    expect(seen.map((e) => e.event)).toEqual(['a.c']);
  });
});

describe('validateClientBatch', () => {
  const good = { ts: new Date().toISOString(), level: 'info', event: 'screen.view', source: 'mobile' };

  it('keeps valid lines, drops bad ones, and ignores client-supplied identity', () => {
    const r = validateClientBatch({
      events: [{ ...good, userId: 'spoofed', requestId: 'spoofed' }, { ...good, event: 'Bad Name' }, { ...good, source: 'api' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events).toHaveLength(1);
    expect(r.rejected).toBe(2);
    expect(r.events[0]!.userId).toBeUndefined();
    expect(r.events[0]!.requestId).toBeUndefined();
  });

  it('rejects oversized or malformed bodies', () => {
    expect(validateClientBatch({}).ok).toBe(false);
    expect(validateClientBatch({ events: Array(101).fill(good) }).ok).toBe(false);
  });
});
