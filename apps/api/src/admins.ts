import type { SupabaseClient } from '@supabase/supabase-js';

import type { AdminDirectory } from './auth';

/** Admin = profiles.is_admin (migration 0003). Cached for a minute per user. */
export function supabaseAdminDirectory(db: SupabaseClient, ttlMs = 60_000): AdminDirectory {
  const cache = new Map<string, { value: boolean; at: number }>();
  return {
    async isAdmin(userId) {
      const hit = cache.get(userId);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;
      const { data, error } = await db.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
      const value = !error && Boolean(data?.is_admin);
      cache.set(userId, { value, at: Date.now() });
      return value;
    },
  };
}

/** Nobody is an admin. Used when no service-role key is configured. */
export const noAdmins: AdminDirectory = { isAdmin: async () => false };
