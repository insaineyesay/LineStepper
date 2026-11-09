import { describe, expect, it } from 'vitest';

import type { LogEvent } from '@linestepper/shared';

import { posthogConnector, type PostHogClientLike } from '../src/logging/connectors/posthog';

function fakeClient() {
  const calls: { kind: string; args: unknown[] }[] = [];
  const client: PostHogClientLike = {
    capture: (...args) => calls.push({ kind: 'capture', args }),
    captureException: (...args) => calls.push({ kind: 'exception', args }),
    flush: async () => {},
  };
  return { client, calls };
}

const ev = (over: Partial<LogEvent>): LogEvent => ({
  ts: '2026-11-09T18:00:00.000Z',
  level: 'info',
  event: 'event.published',
  source: 'api',
  ...over,
});

describe('posthogConnector', () => {
  it('sends API analytics and errors, keyed to the user when known', async () => {
    const { client, calls } = fakeClient();
    const c = posthogConnector({ apiKey: 'phc_test', host: 'https://example', client });
    await c.init();
    await c.send([
      ev({ userId: 'u1', requestId: 'r1' }),
      ev({ event: 'error.unhandled', level: 'error', error: { name: 'Error', message: 'db down' } }),
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      kind: 'capture',
      args: [{ distinctId: 'u1', event: 'event.published', properties: { request_id: 'r1', source: 'api' } }],
    });
    const [, exception] = calls;
    expect(exception?.kind).toBe('exception');
    expect((exception?.args[0] as Error).message).toBe('db down');
    expect(exception?.args[1]).toBe('api-server');
  });

  it('skips routine logs and anything the apps uploaded (they send to PostHog themselves)', async () => {
    const { client, calls } = fakeClient();
    const c = posthogConnector({ apiKey: 'phc_test', host: 'https://example', client });
    await c.init();
    await c.send([
      ev({ event: 'api.request' }),
      ev({ event: 'ui.tap', source: 'mobile' }),
      ev({ event: 'error.unhandled', level: 'error', source: 'web' }),
    ]);
    expect(calls).toEqual([]);
  });
});
