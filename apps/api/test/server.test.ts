import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuthVerifier } from '@linestepper/shared';

import { AccountsUnavailableError, type AccountStore } from '../src/accounts';
import { loadConfig } from '../src/config';
import { noImageStore } from '../src/images';
import { noModerationStore } from '../src/moderation';
import { FlagService } from '../src/flags/service';
import { MemoryFlagStore } from '../src/flags/store';
import { createServerLogging } from '../src/logging';
import { buildServer } from '../src/server';
import { memoryConnector } from './helpers';

// Records who was deleted; deleting 'u-fail' throws.
function fakeAccounts() {
  const deleted: string[] = [];
  const store: AccountStore & { deleted: string[] } = {
    deleted,
    async deleteAccount(id) {
      if (id === 'u-fail') throw new Error('db down');
      deleted.push(id);
      return { crewsHandedOff: 1, crewsDeleted: 0, imagesRemoved: true };
    },
  };
  return store;
}

// Tokens are just user ids in tests; 'admin' is the only admin.
const fakeAuth: AuthVerifier = { id: 'fake', verify: async (t) => (t.startsWith('u-') || t === 'admin' ? { id: t } : null) };

async function setup(accounts: AccountStore = fakeAccounts()) {
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
    accounts,
    moderation: noModerationStore,
    images: noImageStore,
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

  it('DELETE /me deletes only the signed-in account and logs it', async () => {
    await ctx.app.close();
    const accounts = fakeAccounts();
    ctx = await setup(accounts);
    expect((await ctx.app.inject({ method: 'DELETE', url: '/me' })).statusCode).toBe(401);
    const res = await ctx.app.inject({ method: 'DELETE', url: '/me', headers: { authorization: 'Bearer u-7' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ deleted: true, crewsHandedOff: 1, crewsDeleted: 0 });
    expect(accounts.deleted).toEqual(['u-7']);
    expect((await ctx.events()).find((e) => e.event === 'account.deleted')).toMatchObject({ userId: 'u-7' });
  });

  it('DELETE /me reports failure without claiming success', async () => {
    const res = await ctx.app.inject({ method: 'DELETE', url: '/me', headers: { authorization: 'Bearer u-fail' } });
    expect(res.statusCode).toBe(500);
    expect((await ctx.events()).some((e) => e.event === 'account.delete_failed')).toBe(true);
  });

  it('DELETE /me is 503 when the API has no service-role key', async () => {
    await ctx.app.close();
    ctx = await setup({ deleteAccount: async () => { throw new AccountsUnavailableError(); } });
    const res = await ctx.app.inject({ method: 'DELETE', url: '/me', headers: { authorization: 'Bearer u-1' } });
    expect(res.statusCode).toBe(503);
  });

  it('browsers may send DELETE from allowed origins', async () => {
    await ctx.app.close();
    const config = loadConfig({ AUTH_PROVIDER: 'none', NODE_ENV: 'test', CORS_ORIGINS: 'https://web.example' } as NodeJS.ProcessEnv);
    const flags = new FlagService(new MemoryFlagStore(), undefined);
    const { bus, logger } = createServerLogging(config, (k) => flags.isOn(k), [memoryConnector('stdout', { alwaysOn: true })]);
    const app = await buildServer({ config, logger, bus, flags, auth: fakeAuth, admins: { isAdmin: async () => false }, accounts: fakeAccounts(), moderation: noModerationStore, images: noImageStore });
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/me',
      headers: { origin: 'https://web.example', 'access-control-request-method': 'DELETE', 'access-control-request-headers': 'authorization' },
    });
    expect(res.headers['access-control-allow-methods']).toContain('DELETE');
    await app.close();
    ctx = await setup();
  });
});
