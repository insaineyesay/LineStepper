import type { Profile, ProfileRole } from '@/lib/types';

import { db } from './backend';
import { fromResponse, ok, type DataResult } from './result';

/** A profile with its home area, for public member pages. */
export interface MemberProfile extends Profile {
  metro: { name: string; state: string } | null;
}

export interface ProfileUpdate {
  display_name: string | null;
  handle: string | null;
  role: ProfileRole;
  home_metro_id: number | null;
  zip: string | null;
}

export async function getProfile(id: string): Promise<DataResult<Profile>> {
  return fromResponse(await db.from('profiles').select('*').eq('id', id).single());
}

export async function getMemberProfile(id: string): Promise<DataResult<MemberProfile>> {
  return fromResponse(await db.from('profiles').select('*, metro:metros(name, state)').eq('id', id).single());
}

/** Someone's saved ZIP, or null if they haven't set one. */
export async function getProfileZip(userId: string): Promise<DataResult<string | null>> {
  const res = await db.from('profiles').select('zip').eq('id', userId).maybeSingle();
  return res.error ? fromResponse(res) : ok((res.data?.zip as string | null | undefined) ?? null);
}

/** Fails with code '23505' when the handle is taken, or a message mentioning "handle" when it's invalid. */
export async function updateProfile(userId: string, update: ProfileUpdate): Promise<DataResult<true>> {
  const res = await db.from('profiles').update(update).eq('id', userId);
  return res.error ? fromResponse(res) : ok(true);
}
