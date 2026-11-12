import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuthVerifier } from '@linestepper/shared';

import { noAccountStore } from '../src/accounts';
import { loadConfig } from '../src/config';
import { noImageStore } from '../src/images';
import { FlagService } from '../src/flags/service';
import { MemoryFlagStore } from '../src/flags/store';
import { createServerLogging } from '../src/logging';
import type { ModerationStore, OpenReport, TargetType } from '../src/moderation';
import { buildServer } from '../src/server';
import { memoryConnector } from './helpers';

// People and things, by id. Tokens are profile ids.
const A = '00000000-0000-4000-8000-00000000000a'; // admin
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const EVENT_C = '20000000-0000-4000-8000-00000000000c';
const CREW_C = '30000000-0000-4000-8000-00000000000c';
const MISSING = '99999999-0000-4000-8000-000000000000';

/** Mirrors 0008's rules closely enough to test the routes' decisions. */
function memoryStore() {
  const owners: Record<string, string> = {
    [`profile:${A}`]: A,
    [`profile:${B}`]: B,
    [`profile:${C}`]: C,
    [`event:${EVENT_C}`]: C,
    [`crew:${CREW_C}`]: C,
  };
  const s = {
    banned: new Set<string>(),
    admins: new Set([A]),
    removed: new Set<string>(),
    blocks: new Set<string>(),
    follows: new Set<string>([`${B}>${C}`, `${C}>${B}`]),
    reports: [] as (OpenReport & { reporterId: string; status: string })[],
    actions: [] as { actorId: string; action: string }[],
  };
  const store: ModerationStore = {
    isBanned: async (id) => s.banned.has(id),
    isAdmin: async (id) => s.admins.has(id),
    ownerOf: async (type: TargetType, id) => owners[`${type}:${id}`] ?? null,
    async createReport({ reporterId, targetType, targetId, reason, details }) {
      if (s.reports.some((r) => r.status === 'open' && r.reporterId === reporterId && r.targetId === targetId)) return 'duplicate';
      s.reports.push({
        id: `40000000-0000-4000-8000-00000000000${s.reports.length}`,
        reporterId,
        status: 'open',
        targetType,
        targetId,
        targetLabel: 'x',
        ownerId: owners[`${targetType}:${targetId}`] ?? null,
        reason,
        details,
        reporter: { id: reporterId, displayName: null, handle: null },
        createdAt: new Date().toISOString(),
        openOnTarget: 1,
      });
      return 'created';
    },
    async block(blocker, blocked) {
      s.blocks.add(`${blocker}>${blocked}`);
      s.follows.delete(`${blocker}>${blocked}`);
      s.follows.delete(`${blocked}>${blocker}`);
    },
    unblock: async (blocker, blocked) => void s.blocks.delete(`${blocker}>${blocked}`),
    listBlocked: async (blocker) =>
      [...s.blocks].filter((k) => k.startsWith(`${blocker}>`)).map((k) => ({ id: k.split('>')[1]!, displayName: null, handle: null })),
    listOpenReports: async () => s.reports.filter((r) => r.status === 'open'),
    getOpenReport: async (id) => {
      const r = s.reports.find((x) => x.id === id && x.status === 'open');
      return r ? { targetType: r.targetType, targetId: r.targetId } : null;
    },
    removeContent: async (type, id) => void s.removed.add(`${type}:${id}`),
    ban: async (id) => void s.banned.add(id),
    async closeReports({ targetId, status, actorId, action }) {
      const open = s.reports.filter((r) => r.status === 'open' && r.targetId === targetId);
      open.forEach((r) => (r.status = status));
      s.actions.push({ actorId, action });
      return open.length;
    },
  };
  return { store, s };
}

const fakeAuth: AuthVerifier = { id: 'fake', verify: async (t) => (t.length === 36 ? { id: t } : null) };

async function setup() {
  const config = loadConfig({ AUTH_PROVIDER: 'none', NODE_ENV: 'test', LOG_LEVEL: 'debug' } as NodeJS.ProcessEnv);
  const flags = new FlagService(new MemoryFlagStore(), undefined);
  const sink = memoryConnector('stdout', { alwaysOn: true });
  const { bus, logger } = createServerLogging(config, (k) => flags.isOn(k), [sink]);
  const { store, s } = memoryStore();
  const app = await buildServer({
    config,
    logger,
    bus,
    flags,
    auth: fakeAuth,
    admins: { isAdmin: async (id) => s.admins.has(id) },
    accounts: noAccountStore,
    moderation: store,
    images: noImageStore,
  });
  await app.ready();
  const as = (user: string) => ({ authorization: `Bearer ${user}` });
  const events = async () => {
    await bus.flush();
    return sink.received;
  };
  return { app, s, as, events };
}

describe('report, block, moderate', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  const report = (user: string | null, body: Record<string, unknown>) =>
    ctx.app.inject({ method: 'POST', url: '/reports', payload: body, headers: user ? ctx.as(user) : {} });

  it('reports need a signed-in person and a valid, existing target that is not their own', async () => {
    expect((await report(null, { targetType: 'event', targetId: EVENT_C, reason: 'spam' })).statusCode).toBe(401);
    expect((await report(B, { targetType: 'song', targetId: EVENT_C, reason: 'spam' })).statusCode).toBe(400);
    expect((await report(B, { targetType: 'event', targetId: 'nope', reason: 'spam' })).statusCode).toBe(400);
    expect((await report(B, { targetType: 'event', targetId: EVENT_C, reason: 'meh' })).statusCode).toBe(400);
    expect((await report(B, { targetType: 'event', targetId: EVENT_C, reason: 'other', details: 'x'.repeat(1001) })).statusCode).toBe(400);
    expect((await report(B, { targetType: 'event', targetId: MISSING, reason: 'spam' })).statusCode).toBe(404);
    expect((await report(C, { targetType: 'event', targetId: EVENT_C, reason: 'spam' })).statusCode).toBe(400);
  });

  it('a report is stored once and logged without its details', async () => {
    const first = await report(B, { targetType: 'event', targetId: EVENT_C, reason: 'harassment', details: 'private words' });
    expect(first.statusCode).toBe(201);
    expect((await report(B, { targetType: 'event', targetId: EVENT_C, reason: 'harassment' })).statusCode).toBe(200);
    expect(ctx.s.reports).toHaveLength(1);
    const logged = (await ctx.events()).filter((e) => e.event === 'report.created');
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged[0])).not.toContain('private words');
  });

  it('blocking removes follows both ways, can be listed and undone; not yourself', async () => {
    expect((await ctx.app.inject({ method: 'PUT', url: `/blocks/${B}`, headers: ctx.as(B) })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'PUT', url: `/blocks/${MISSING}`, headers: ctx.as(B) })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'PUT', url: `/blocks/${C}`, headers: ctx.as(B) })).statusCode).toBe(200);
    expect(ctx.s.follows.size).toBe(0);
    const list = await ctx.app.inject({ url: '/me/blocks', headers: ctx.as(B) });
    expect(list.json().blocked.map((p: { id: string }) => p.id)).toEqual([C]);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/blocks/${C}`, headers: ctx.as(B) })).statusCode).toBe(200);
    expect(ctx.s.blocks.size).toBe(0);
  });

  it('banned people cannot report or block', async () => {
    ctx.s.banned.add(B);
    expect((await report(B, { targetType: 'event', targetId: EVENT_C, reason: 'spam' })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'PUT', url: `/blocks/${C}`, headers: ctx.as(B) })).statusCode).toBe(403);
  });

  it('only admins see and resolve reports', async () => {
    await report(B, { targetType: 'event', targetId: EVENT_C, reason: 'spam' });
    expect((await ctx.app.inject({ url: '/admin/reports', headers: ctx.as(B) })).statusCode).toBe(403);
    const list = await ctx.app.inject({ url: '/admin/reports', headers: ctx.as(A) });
    expect(list.json().reports).toHaveLength(1);
    const id = list.json().reports[0].id;
    const asB = await ctx.app.inject({ method: 'POST', url: `/admin/reports/${id}/resolve`, payload: { action: 'ban' }, headers: ctx.as(B) });
    expect(asB.statusCode).toBe(403);
    expect(ctx.s.banned.size).toBe(0);
  });

  it('remove hides the event and closes every open report on it, logged with the admin', async () => {
    await report(B, { targetType: 'event', targetId: EVENT_C, reason: 'spam' });
    await report(A, { targetType: 'event', targetId: EVENT_C, reason: 'fake' });
    const id = ctx.s.reports[0]!.id;
    const res = await ctx.app.inject({ method: 'POST', url: `/admin/reports/${id}/resolve`, payload: { action: 'remove' }, headers: ctx.as(A) });
    expect(res.json()).toMatchObject({ resolved: true, action: 'remove_event', reportsClosed: 2 });
    expect(ctx.s.removed.has(`event:${EVENT_C}`)).toBe(true);
    expect(ctx.s.actions).toEqual([{ actorId: A, action: 'remove_event' }]);
    expect((await ctx.events()).find((e) => e.event === 'moderation.action')).toMatchObject({ userId: A });
    // Already closed.
    expect((await ctx.app.inject({ method: 'POST', url: `/admin/reports/${id}/resolve`, payload: { action: 'dismiss' }, headers: ctx.as(A) })).statusCode).toBe(404);
  });

  it('ban on a crew report bans its owner; profiles are banned, not removed; admins cannot be banned', async () => {
    await report(B, { targetType: 'crew', targetId: CREW_C, reason: 'inappropriate' });
    const crewReport = ctx.s.reports[0]!.id;
    await ctx.app.inject({ method: 'POST', url: `/admin/reports/${crewReport}/resolve`, payload: { action: 'ban' }, headers: ctx.as(A) });
    expect([...ctx.s.banned]).toEqual([C]);

    await report(B, { targetType: 'profile', targetId: A, reason: 'fake' });
    const adminReport = ctx.s.reports[1]!.id;
    const remove = await ctx.app.inject({ method: 'POST', url: `/admin/reports/${adminReport}/resolve`, payload: { action: 'remove' }, headers: ctx.as(A) });
    expect(remove.statusCode).toBe(400);
    ctx.s.admins.add(B); // a second admin tries to ban the first
    const ban = await ctx.app.inject({ method: 'POST', url: `/admin/reports/${adminReport}/resolve`, payload: { action: 'ban' }, headers: ctx.as(B) });
    expect(ban.statusCode).toBe(400);
    expect(ctx.s.banned.has(A)).toBe(false);
  });

  it('dismiss closes the report and changes nothing else', async () => {
    await report(B, { targetType: 'profile', targetId: C, reason: 'other' });
    const id = ctx.s.reports[0]!.id;
    const res = await ctx.app.inject({ method: 'POST', url: `/admin/reports/${id}/resolve`, payload: { action: 'dismiss', note: 'fine' }, headers: ctx.as(A) });
    expect(res.json()).toMatchObject({ action: 'dismiss', reportsClosed: 1 });
    expect(ctx.s.banned.size + ctx.s.removed.size).toBe(0);
  });
});
