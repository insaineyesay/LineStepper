import type { SupabaseClient } from '@supabase/supabase-js';

import type { ImageStore } from './images';

export interface DeletedAccount {
  /** Crews handed to their next member. */
  crewsHandedOff: number;
  /** Crews deleted because nobody else was in them. */
  crewsDeleted: number;
  /** False if their photo and flyers couldn't all be deleted (the account is deleted anyway). */
  imagesRemoved: boolean;
}

/** Deletes a person's account and everything that belongs to it. */
export interface AccountStore {
  deleteAccount(userId: string): Promise<DeletedAccount>;
}

/**
 * Supabase: delete their images, hand off or delete the crews they own (migration 0007), then
 * delete the auth user. Everything else cascades from the profile. Safe to
 * retry: a second run finds no crews and deletes the user.
 */
export function supabaseAccountStore(db: SupabaseClient, images: ImageStore): AccountStore {
  return {
    async deleteAccount(userId) {
      // Files first, while we can still find their events. A failure here
      // shouldn't keep someone from deleting their account; it's reported.
      let imagesRemoved = true;
      try {
        await images.removeAllFor(userId);
      } catch {
        imagesRemoved = false;
      }

      const crews = await db.rpc('release_owned_crews', { p_profile: userId });
      if (crews.error) throw new Error(`release_owned_crews failed: ${crews.error.message}`);
      const row = (Array.isArray(crews.data) ? crews.data[0] : crews.data) as
        | { handed_off: number; deleted: number }
        | undefined;

      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) throw new Error(`deleteUser failed: ${error.message}`);
      return { crewsHandedOff: row?.handed_off ?? 0, crewsDeleted: row?.deleted ?? 0, imagesRemoved };
    },
  };
}

/** Used when the API has no service-role key: deletion can't be done. */
export const noAccountStore: AccountStore = {
  async deleteAccount() {
    throw new AccountsUnavailableError();
  },
};

export class AccountsUnavailableError extends Error {
  constructor() {
    super('Account deletion needs SUPABASE_SERVICE_ROLE_KEY on the API.');
  }
}
