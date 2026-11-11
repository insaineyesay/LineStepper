import { apiFetch } from '@/lib/api';
import { API_URL } from '@/lib/logger';

import { fail, ok, type DataResult } from './result';

/**
 * The signed-in person's own account. The first data module served by our
 * API instead of the database directly: deleting an account needs the
 * server's admin key, which never ships in the app.
 */

export interface DeletedAccount {
  crewsHandedOff: number;
  crewsDeleted: number;
}

/** Permanently deletes the signed-in account (DELETE /me). */
export async function deleteAccount(): Promise<DataResult<DeletedAccount>> {
  if (!API_URL) return fail(null, "Account deletion isn't available in this build.");
  try {
    const res = await apiFetch('/me', { method: 'DELETE' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return fail({ message: `Delete failed (${res.status})`, code: body.error ?? String(res.status) });
    }
    const body = (await res.json()) as DeletedAccount;
    return ok({ crewsHandedOff: body.crewsHandedOff ?? 0, crewsDeleted: body.crewsDeleted ?? 0 });
  } catch (err) {
    return fail({ message: err instanceof Error ? err.message : String(err), code: 'network' });
  }
}
