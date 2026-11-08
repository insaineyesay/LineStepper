import type { LogEvent } from '@linestepper/shared';

import type { LogConnector } from '../src/logging';

export function memoryConnector(name: string, opts: { fail?: boolean; delayMs?: number; alwaysOn?: boolean } = {}) {
  const received: LogEvent[] = [];
  let attempts = 0;
  const c: LogConnector & { received: LogEvent[]; attempts: () => number; fail: boolean } = {
    name,
    alwaysOn: opts.alwaysOn,
    fail: opts.fail ?? false,
    received,
    attempts: () => attempts,
    async init() {},
    async send(batch) {
      attempts++;
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (c.fail) throw new Error(`${name} down`);
      received.push(...batch);
    },
    async flush() {},
    health: () => ({ ok: !c.fail }),
  };
  return c;
}

export const line = (event = 'ui.tap', extra: Partial<LogEvent> = {}): LogEvent => ({
  ts: new Date().toISOString(),
  level: 'info',
  event,
  source: 'api',
  ...extra,
});
