import { describe, expect, it } from 'vitest';

import { REDACTED } from '@linestepper/shared';

import { LogBus } from '../src/logging';
import { line, memoryConnector } from './helpers';

const enrich = { env: 'test', appVersion: 't1' };

describe('LogBus', () => {
  it('broadcasts each batch to every enabled connector, scrubbed and enriched', async () => {
    const a = memoryConnector('a');
    const b = memoryConnector('b');
    const bus = new LogBus({ connectors: [a, b], isConnectorEnabled: () => true, enrich });
    bus.write(line('ui.tap', { data: { phone: '757-555-0100' } }));
    await bus.flush();
    expect(a.received).toHaveLength(1);
    expect(b.received).toHaveLength(1);
    expect(a.received[0]).toMatchObject({ env: 'test', appVersion: 't1', data: { phone: REDACTED } });
  });

  it('a failing connector retries, then drops and counts, without affecting the others', async () => {
    const bad = memoryConnector('bad', { fail: true });
    const good = memoryConnector('good');
    const base = memoryConnector('stdout', { alwaysOn: true });
    const bus = new LogBus({ connectors: [bad, good, base], isConnectorEnabled: () => true, enrich, retries: 2, retryDelayMs: 1 });
    bus.write(line());
    bus.write(line());
    await bus.flush();
    expect(good.received).toHaveLength(2);
    expect(bad.attempts()).toBe(3);
    const stats = bus.health().find((s) => s.name === 'bad')!;
    expect(stats.dropped).toBe(2);
    expect(stats.healthy).toBe(false);
    // the drop is reported on the always-on baseline, not through the bus
    await new Promise((r) => setTimeout(r, 5));
    expect(base.received.some((e) => e.event === 'logs.dropped')).toBe(true);
  });

  it('a slow connector does not delay the others', async () => {
    const slow = memoryConnector('slow', { delayMs: 200 });
    const fast = memoryConnector('fast');
    const bus = new LogBus({ connectors: [slow, fast], isConnectorEnabled: () => true, enrich });
    bus.write(line());
    void bus.flush();
    await new Promise((r) => setTimeout(r, 20));
    expect(fast.received).toHaveLength(1);
    expect(slow.received).toHaveLength(0);
    await bus.flush();
    expect(slow.received).toHaveLength(1);
  });

  it('respects the connector flag live, but never turns off always-on connectors', async () => {
    let on = false;
    const pt = memoryConnector('papertrail');
    const base = memoryConnector('stdout', { alwaysOn: true });
    const bus = new LogBus({ connectors: [pt, base], isConnectorEnabled: () => on, enrich });
    bus.write(line());
    await bus.flush();
    expect(pt.received).toHaveLength(0);
    expect(base.received).toHaveLength(1);
    on = true;
    bus.write(line());
    await bus.flush();
    expect(pt.received).toHaveLength(1);
  });
});
