import type { Metro } from '@/lib/types';

import { db, isBackendConfigured } from './backend';
import { fromResponse, ok, type DataResult } from './result';

/** Reference data the app reads but never changes: areas, ZIP centers, flags. */

export async function listMetros(): Promise<DataResult<Metro[]>> {
  return fromResponse(await db.from('metros').select('*').order('id'));
}

/** The center of a ZIP area, or null when the ZIP isn't a real one. */
export async function getZipCenter(zip: string): Promise<DataResult<{ lat: number; lng: number } | null>> {
  if (!isBackendConfigured) return ok(null);
  const res = await db.from('zip_codes').select('lat, lng').eq('zip', zip).maybeSingle();
  if (res.error) return fromResponse(res);
  return ok(res.data ? { lat: res.data.lat as number, lng: res.data.lng as number } : null);
}

/** A feature flag's runtime value (an admin's override, else `fallback`). */
export async function getFlag(key: string, fallback: boolean): Promise<DataResult<boolean>> {
  const res = await db.rpc('flag_enabled', { p_key: key, p_default: fallback });
  if (res.error) return fromResponse(res);
  return ok(typeof res.data === 'boolean' ? res.data : fallback);
}
