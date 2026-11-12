import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Event flyers and profile photos in Supabase Storage (migration 0009).
 * The app never uploads with its own credentials: the API hands out one-time
 * upload links for paths it chose, then records the public URLs itself.
 */

export const IMAGE_BUCKET = 'images';
export const IMAGE_TARGETS = ['event', 'profile'] as const;
export type ImageTarget = (typeof IMAGE_TARGETS)[number];
export type ImageVariant = 'full' | 'thumb';

/** Where each variant of an image lives. Paths are always built here, never taken from the app. */
export function imagePaths(target: ImageTarget, ownerId: string, imageId: string): { full: string; thumb?: string } {
  if (target === 'event') {
    return { full: `events/${ownerId}/${imageId}.jpg`, thumb: `events/${ownerId}/${imageId}-thumb.jpg` };
  }
  return { full: `profiles/${ownerId}/${imageId}.jpg` };
}

export interface ImageStore {
  /** One-time upload tokens, one per path. */
  createUploads(paths: string[]): Promise<{ path: string; token: string }[]>;
  /** Whether every path has been uploaded. */
  allExist(paths: string[]): Promise<boolean>;
  publicUrl(path: string): string;
  /** Sets an event's flyer (or clears it with nulls); returns the URLs it replaced. */
  setEventImage(eventId: string, flyerUrl: string | null, thumbUrl: string | null): Promise<string[]>;
  /** Sets a profile photo (or clears it); returns the URL it replaced. */
  setProfileImage(profileId: string, url: string | null): Promise<string[]>;
  /** Deletes files by their public URLs (ones outside our bucket are ignored). */
  removeByUrls(urls: string[]): Promise<void>;
  /** Deletes every image a person uploaded: their photo and their events' flyers. */
  removeAllFor(profileId: string): Promise<void>;
}

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export function supabaseImageStore(db: SupabaseClient): ImageStore {
  const bucket = () => db.storage.from(IMAGE_BUCKET);
  const marker = `/object/public/${IMAGE_BUCKET}/`;
  const pathOf = (url: string) => (url.includes(marker) ? decodeURIComponent(url.split(marker)[1]!.split('?')[0]!) : null);

  async function removeFolder(prefix: string) {
    const { data, error } = await bucket().list(prefix, { limit: 1000 });
    check(error, 'list images');
    const paths = (data ?? []).map((f) => `${prefix}/${f.name}`);
    if (paths.length) check((await bucket().remove(paths)).error, 'remove images');
  }

  return {
    async createUploads(paths) {
      return Promise.all(
        paths.map(async (path) => {
          const { data, error } = await bucket().createSignedUploadUrl(path);
          check(error, 'create upload link');
          return { path, token: data!.token };
        }),
      );
    },

    async allExist(paths) {
      for (const path of paths) {
        const slash = path.lastIndexOf('/');
        const { data, error } = await bucket().list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 5 });
        check(error, 'check upload');
        if (!(data ?? []).some((f) => f.name === path.slice(slash + 1))) return false;
      }
      return true;
    },

    publicUrl(path) {
      return bucket().getPublicUrl(path).data.publicUrl;
    },

    async setEventImage(eventId, flyerUrl, thumbUrl) {
      const before = await db.from('events').select('flyer_url, flyer_thumb_url').eq('id', eventId).maybeSingle();
      check(before.error, 'read event images');
      const upd = await db.from('events').update({ flyer_url: flyerUrl, flyer_thumb_url: thumbUrl }).eq('id', eventId);
      check(upd.error, 'set event image');
      return [before.data?.flyer_url, before.data?.flyer_thumb_url].filter((u): u is string => Boolean(u));
    },

    async setProfileImage(profileId, url) {
      const before = await db.from('profiles').select('avatar_url').eq('id', profileId).maybeSingle();
      check(before.error, 'read profile image');
      const upd = await db.from('profiles').update({ avatar_url: url }).eq('id', profileId);
      check(upd.error, 'set profile image');
      return before.data?.avatar_url ? [before.data.avatar_url as string] : [];
    },

    async removeByUrls(urls) {
      const paths = urls.map(pathOf).filter((p): p is string => Boolean(p));
      if (paths.length) check((await bucket().remove(paths)).error, 'remove old images');
    },

    async removeAllFor(profileId) {
      await removeFolder(`profiles/${profileId}`);
      const { data, error } = await db.from('events').select('id').eq('organizer_id', profileId);
      check(error, 'list events for image cleanup');
      for (const e of data ?? []) await removeFolder(`events/${e.id}`);
    },
  };
}

/** Used when the API has no service-role key. */
export class ImagesUnavailableError extends Error {
  statusCode = 503;
  constructor() {
    super('Image uploads need SUPABASE_SERVICE_ROLE_KEY on the API.');
  }
}

export const noImageStore: ImageStore = new Proxy({} as ImageStore, {
  get: (_t, prop) => (prop === 'publicUrl' ? () => '' : async () => {
    throw new ImagesUnavailableError();
  }),
});
