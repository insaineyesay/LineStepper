import { describe, expect, it } from 'vitest';

import { defaultFlags, parseFlagEnv, resolveFlags } from '../src/flags';

describe('flags', () => {
  it('uses the MVP1 defaults from PRD B2', () => {
    const f = defaultFlags();
    expect(f['events.core']).toBe(true);
    expect(f.booking).toBe(false);
    expect(f['payments.tickets']).toBe(false);
    expect(f['notify.sms']).toBe(false);
    expect(f['notify.email']).toBe(true);
  });

  it('later layers win', () => {
    expect(resolveFlags({ booking: true }, { booking: false }).booking).toBe(false);
  });

  it('switches off flags whose dependencies are off, through chains', () => {
    const f = resolveFlags({ 'payments.refunds': true, 'payments.tickets': true });
    // booking is still off, so tickets and then refunds fall off
    expect(f['payments.tickets']).toBe(false);
    expect(f['payments.refunds']).toBe(false);

    const g = resolveFlags({ booking: true, 'payments.tickets': true, 'payments.refunds': true });
    expect(g['payments.refunds']).toBe(true);
  });

  it('ignores unknown keys', () => {
    expect(() => resolveFlags({ nope: true } as never)).not.toThrow();
  });

  it('parses the FLAGS env var and reports typos', () => {
    const { overrides, unknown } = parseFlagEnv('booking=on, notify.sms=off ,bookng=on');
    expect(overrides).toEqual({ booking: true, 'notify.sms': false });
    expect(unknown).toEqual(['bookng']);
  });
});
