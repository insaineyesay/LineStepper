import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuthVerifier } from '@linestepper/shared';

import { loadConfig } from '../src/config';
import { FlagService } from '../src/flags/service';
import { MemoryFlagStore } from '../src/flags/store';
import { createServerLogging } from '../src/logging';
import { buildServer } from '../src/server';
import { memoryConnector } from './helpers';

// Tokens are just user ids in tests; 'admin' is the only admin.
const fakeAuth: AuthVerifier = { id: 'fake', verify: async (t) => (t.startsWith('u-') || t === 'admin' ? { id: t } : null) };

async function setup() {
  const config = loadConfig({ AUTH_PROVIDER: 'none', NODE_ENV: 'test', LOG_LEVEL: 'debug' } as NodeJS.ProcessEnv);
  const flags = new FlagService(new MemoryFlagStore(), undefined);
  const sink = memoryConnector('stdout', { alwaysOn: true });
  const { bus, logger } = createServerLogging(config, (k) => flags.isOn(k), [sink]);
  flags.attachLogger(logger);
  const app = await buildServer({
    config,
    logger,
    bus,
    flags,
    auth: fakeAuth,
    admins: { isAdmin: async (id) => id === 'admin' },
  });
  // A route behind a flag that is off by default, to prove server-side enforcement.
  app.get('/bookings', { preHandler: app.requireFlag('booking') }, async () => ({ ok: true }));
  await app.ready();
  const events = async () => {
    await bus.flush();
    return sink.received;
  };
  return { app, events };
}

describe('API', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  it('logs every request with request id and user id, and echoes x-request-id', async () => {
    const res = await ctx.app.inject({ url: '/flags', headers: { authorization: 'Bearer u-1', 'x-request-id': 'req-abc-123' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe('req-abc-123');
    const ev = (await ctx.events()).find((e) => e.event === 'api.request');
    expect(ev).toMatchObject({ requestId: 'req-abc-123', userId: 'u-1', data: { route: '/flags', status: 200 } });
  });

  it('GET /flags returns MVP1 defaults', async () => {
    const res = await ctx.app.inject({ url: '/flags' });
    expect(res.json().flags).toMatchObject({ 'events.core': true, booking: false });
  });

  it('flagged-off routes 404 even when called directly', async () => {
    const res = await ctx.app.inject({ url: '/bookings' });
    expect(res.statusCode).toBe(404);
    expect((await ctx.events()).some((e) => e.event === 'flags.denied')).toBe(true);
  });

  it('only admins can change flags; changes are logged with the actor and take effect', async () => {
    const put = (auth?: string) =>
      ctx.app.inject({
        method: 'PUT',
        url: '/admin/flags/booking',
        payload: { enabled: true },
        headers: auth ? { authorization: `Bearer ${auth}` } : {},
      });
    expect((await put()).statusCode).toBe(401);
    expect((await put('u-1')).statusCode).toBe(403);
    const ok = await put('admin');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ key: 'booking', effective: true });
    expect((await ctx.app.inject({ url: '/bookings' })).statusCode).toBe(200);
    const changed = (await ctx.events()).find((e) => e.event === 'flags.changed');
    expect(changed).toMatchObject({ userId: 'admin', data: { key: 'booking', enabled: true, actorId: 'admin' } });
  });

  it('PUT /admin/flags rejects unknown flags', async () => {
    const res = await ctx.app.inject({
      method: 'PUT',
      url: '/admin/flags/nope',
      payload: { enabled: true },
      headers: { authorization: 'Bearer admin' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /logs ingests client batches with server-set identity and no PII', async () => {
    const ts = new Date().toISOString();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/logs',
      headers: { authorization: 'Bearer u-7' },
      payload: {
        events: [
          { ts, level: 'info', event: 'screen.view', source: 'mobile', userId: 'spoofed', data: { screen: '/events', note: 'me@x.com' } },
          { ts, level: 'info', event: 'NOT VALID', source: 'mobile' },
        ],
      },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 1, rejected: 1 });
    const ev = (await ctx.events()).find((e) => e.event === 'screen.view')!;
    expect(ev.userId).toBe('u-7');
    expect(ev.source).toBe('mobile');
    expect(JSON.stringify(ev)).not.toContain('me@x.com');
  });

  it('POST /logs rejects a malformed body', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/logs', payload: { nope: 1 } });
    expect(res.statusCode).toBe(400);
  });
});
