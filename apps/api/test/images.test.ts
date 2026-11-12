import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuthVerifier } from '@linestepper/shared';

import { noAccountStore } from '../src/accounts';
import { loadConfig } from '../src/config';
import { FlagService } from '../src/flags/service';
import { MemoryFlagStore } from '../src/flags/store';
import type { ImageStore } from '../src/images';
import { createServerLogging } from '../src/logging';
import type { ModerationStore } from '../src/moderation';
import { buildServer } from '../src/server';
import { memoryConnector } from './helpers';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const EVENT_A = '20000000-0000-4000-8000-00000000000a';
const MISSING = '99999999-0000-4000-8000-000000000000';
const URL = 'https://x.supabase.co/storage/v1/object/public/images/';

function fakes() {
  const s = {
    banned: new Set<string>(),
    uploaded: new Set<string>(),
    issued: [] as string[],
    removed: [] as string[],
    eventImage: { flyer: null as string | null, thumb: null as string | null },
    profileImage: new Map<string, string | null>(),
  };
  const images: ImageStore = {
    createUploads: async (paths) => {
      s.issued.push(...paths);
      return paths.map((path) => ({ path, token: `tok-${path}` }));
    },
    allExist: async (paths) => paths.every((p) => s.uploaded.has(p)),
    publicUrl: (path) => URL + path,
    async setEventImage(_id, flyer, thumb) {
      const before = [s.eventImage.flyer, s.eventImage.thumb].filter((u): u is string => Boolean(u));
      s.eventImage = { flyer, thumb };
      return before;
    },
    async setProfileImage(id, url) {
      const before = s.profileImage.get(id);
      s.profileImage.set(id, url);
      return before ? [before] : [];
    },
    removeByUrls: async (urls) => void s.removed.push(...urls),
    removeAllFor: async () => {},
  };
  const moderation = {
    isBanned: async (id: string) => s.banned.has(id),
    ownerOf: async (type: string, id: string) => (type === 'event' && id === EVENT_A ? A : null),
  } as unknown as ModerationStore;
  return { s, images, moderation };
}

const fakeAuth: AuthVerifier = { id: 'fake', verify: async (t) => (t.length === 36 ? { id: t } : null) };

async function setup() {
  const config = loadConfig({ AUTH_PROVIDER: 'none', NODE_ENV: 'test', LOG_LEVEL: 'debug' } as NodeJS.ProcessEnv);
  const flags = new FlagService(new MemoryFlagStore(), undefined);
  const { bus, logger } = createServerLogging(config, (k) => flags.isOn(k), [memoryConnector('stdout', { alwaysOn: true })]);
  const { s, images, moderation } = fakes();
  const app = await buildServer({
    config,
    logger,
    bus,
    flags,
    auth: fakeAuth,
    admins: { isAdmin: async () => false },
    accounts: noAccountStore,
    moderation,
    images,
  });
  await app.ready();
  const call = (method: 'POST' | 'DELETE', url: string, user: string | null, payload: object) =>
    app.inject({ method, url, payload, headers: user ? { authorization: `Bearer ${user}` } : {} });
  return { app, s, call };
}

describe('images', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  it('needs a signed-in, unbanned person, and only the organizer can add an event flyer', async () => {
    expect((await ctx.call('POST', '/images/uploads', null, { target: 'profile' })).statusCode).toBe(401);
    expect((await ctx.call('POST', '/images/uploads', A, { target: 'banner' })).statusCode).toBe(400);
    expect((await ctx.call('POST', '/images/uploads', A, { target: 'event', eventId: 'x' })).statusCode).toBe(400);
    expect((await ctx.call('POST', '/images/uploads', A, { target: 'event', eventId: MISSING })).statusCode).toBe(404);
    expect((await ctx.call('POST', '/images/uploads', B, { target: 'event', eventId: EVENT_A })).statusCode).toBe(403);
    ctx.s.banned.add(A);
    expect((await ctx.call('POST', '/images/uploads', A, { target: 'profile' })).statusCode).toBe(403);
    expect(ctx.s.issued).toEqual([]);
  });

  it('an event flyer gets a full image and a thumbnail, at paths the server chose', async () => {
    const res = await ctx.call('POST', '/images/uploads', A, { target: 'event', eventId: EVENT_A, path: 'profiles/hack.jpg' });
    expect(res.statusCode).toBe(200);
    const { imageId, uploads } = res.json();
    expect(uploads.map((u: { variant: string; path: string }) => [u.variant, u.path])).toEqual([
      ['full', `events/${EVENT_A}/${imageId}.jpg`],
      ['thumb', `events/${EVENT_A}/${imageId}-thumb.jpg`],
    ]);
  });

  it('attach refuses until the files are uploaded, then records them and deletes the old flyer', async () => {
    ctx.s.eventImage = { flyer: `${URL}events/old.jpg`, thumb: `${URL}events/old-thumb.jpg` };
    const { imageId } = (await ctx.call('POST', '/images/uploads', A, { target: 'event', eventId: EVENT_A })).json();
    const attach = () => ctx.call('POST', '/images/attach', A, { target: 'event', eventId: EVENT_A, imageId });

    expect((await attach()).statusCode).toBe(409);
    ctx.s.issued.forEach((p) => ctx.s.uploaded.add(p));
    const ok = await attach();
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({
      url: `${URL}events/${EVENT_A}/${imageId}.jpg`,
      thumbUrl: `${URL}events/${EVENT_A}/${imageId}-thumb.jpg`,
    });
    expect(ctx.s.removed).toEqual([`${URL}events/old.jpg`, `${URL}events/old-thumb.jpg`]);
  });

  it("another person can't attach to your event or reuse your image id", async () => {
    const { imageId } = (await ctx.call('POST', '/images/uploads', A, { target: 'event', eventId: EVENT_A })).json();
    ctx.s.issued.forEach((p) => ctx.s.uploaded.add(p));
    expect((await ctx.call('POST', '/images/attach', B, { target: 'event', eventId: EVENT_A, imageId })).statusCode).toBe(403);
    // As a profile photo, B's paths would be under B's own folder, which holds nothing.
    expect((await ctx.call('POST', '/images/attach', B, { target: 'profile', imageId })).statusCode).toBe(409);
  });

  it('profile photos are one size, under your own folder; removing clears and deletes', async () => {
    const { imageId, uploads } = (await ctx.call('POST', '/images/uploads', B, { target: 'profile' })).json();
    expect(uploads).toEqual([{ variant: 'full', path: `profiles/${B}/${imageId}.jpg`, token: `tok-profiles/${B}/${imageId}.jpg` }]);
    ctx.s.issued.forEach((p) => ctx.s.uploaded.add(p));
    expect((await ctx.call('POST', '/images/attach', B, { target: 'profile', imageId })).json()).toEqual({
      url: `${URL}profiles/${B}/${imageId}.jpg`,
      thumbUrl: null,
    });
    expect((await ctx.call('DELETE', '/images', B, { target: 'profile' })).statusCode).toBe(200);
    expect(ctx.s.profileImage.get(B)).toBeNull();
    expect(ctx.s.removed).toEqual([`${URL}profiles/${B}/${imageId}.jpg`]);
  });
});
