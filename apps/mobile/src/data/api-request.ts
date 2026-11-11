import { apiFetch } from '@/lib/api';
import { API_URL } from '@/lib/logger';

import { fail, ok, type DataResult } from './result';

/**
 * One call to our API, as a DataResult. The error code is the API's
 * `error` field (e.g. 'not_found', 'banned') or the HTTP status.
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<DataResult<T>> {
  if (!API_URL) return fail(null, "This isn't available in this build.");
  try {
    const res = await apiFetch(path, init);
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return fail({ message: `Request failed (${res.status})`, code: body.error ?? String(res.status) });
    return ok(body);
  } catch (err) {
    return fail({ message: err instanceof Error ? err.message : String(err), code: 'network' });
  }
}
