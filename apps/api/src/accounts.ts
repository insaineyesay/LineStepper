import type { SupabaseClient } from '@supabase/supabase-js';

export interface DeletedAccount {
  /** Crews handed to their next member. */
  crewsHandedOff: number;
  /** Crews deleted because nobody else was in them. */
  crewsDeleted: number;
}

/** Deletes a person's account and everything that belongs to it. */
export interface AccountStore {
  deleteAccount(userId: string): Promise<DeletedAccount>;
}

/**
 * Supabase: hand off or delete the crews they own (migration 0007), then
 * delete the auth user. Everything else cascades from the profile. Safe to
 * retry: a second run finds no crews and deletes the user.
 */
export function supabaseAccountStore(db: SupabaseClient): AccountStore {
  return {
    async deleteAccount(userId) {
      const crews = await db.rpc('release_owned_crews', { p_profile: userId });
      if (crews.error) throw new Error(`release_owned_crews failed: ${crews.error.message}`);
      const row = (Array.isArray(crews.data) ? crews.data[0] : crews.data) as
        | { handed_off: number; deleted: number }
        | undefined;

      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) throw new Error(`deleteUser failed: ${error.message}`);
      return { crewsHandedOff: row?.handed_off ?? 0, crewsDeleted: row?.deleted ?? 0 };
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
