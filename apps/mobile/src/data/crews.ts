import type { Crew } from '@/lib/types';

import { db } from './backend';
import { fromResponse, ok, type DataResult } from './result';

/** A crew with its area and owner, for the crew page. */
export interface CrewDetail extends Crew {
  metro: { name: string; state: string } | null;
  owner: { id: string; display_name: string | null; handle: string | null } | null;
}

export interface CrewMember {
  profile_id: string;
  role: 'owner' | 'admin' | 'member';
  status: 'pending' | 'active' | 'removed';
  profile: { id: string; display_name: string | null; handle: string | null; role: string } | null;
}

/** A crew someone belongs to, for their public page. */
export interface CrewLink {
  crew_id: string;
  crews: { id: string; name: string } | null;
}

/** What the crew form saves. */
export interface CrewInput {
  name: string;
  description: string | null;
  home_metro_id: number | null;
  merch_url: string | null;
  is_joinable: boolean;
}

/** All crews, featured first, then by name. */
export async function listCrews(limit = 100): Promise<DataResult<Crew[]>> {
  return fromResponse(
    await db.from('crews').select('*').order('tier', { ascending: false }).order('name').limit(limit)
  );
}

export async function getCrewDetail(id: string): Promise<DataResult<CrewDetail>> {
  return fromResponse(
    await db
      .from('crews')
      .select('*, metro:metros(name, state), owner:profiles!crews_owner_id_fkey(id, display_name, handle)')
      .eq('id', id)
      .single()
  );
}

/** A crew as stored (for editing). */
export async function getCrew(id: string): Promise<DataResult<Crew>> {
  return fromResponse(await db.from('crews').select('*').eq('id', id).single());
}

/** Creates a crew. Fails with code '23505' when a crew with the same slug exists. */
export async function createCrew(ownerId: string, slug: string, input: CrewInput): Promise<DataResult<{ id: string }>> {
  return fromResponse(
    await db
      .from('crews')
      .insert({ ...input, slug, owner_id: ownerId })
      .select('id')
      .single()
  );
}

export async function updateCrew(id: string, input: CrewInput): Promise<DataResult<{ id: string }>> {
  const res = await db.from('crews').update(input).eq('id', id);
  return res.error ? fromResponse(res) : ok({ id });
}

export async function listCrewMembers(crewId: string): Promise<DataResult<CrewMember[]>> {
  const res = await db
    .from('crew_members')
    .select('profile_id, role, status, profile:profiles(id, display_name, handle, role)')
    .eq('crew_id', crewId);
  return res.error ? fromResponse(res) : ok((res.data ?? []) as unknown as CrewMember[]);
}

export async function requestToJoin(crewId: string, userId: string): Promise<DataResult<true>> {
  const res = await db
    .from('crew_members')
    .insert({ crew_id: crewId, profile_id: userId, role: 'member', status: 'pending' });
  return res.error ? fromResponse(res) : ok(true);
}

/** Removes a membership or pending request: someone leaving, or an owner removing them. */
export async function removeMembership(crewId: string, profileId: string): Promise<DataResult<true>> {
  const res = await db.from('crew_members').delete().eq('crew_id', crewId).eq('profile_id', profileId);
  return res.error ? fromResponse(res) : ok(true);
}

export async function approveMember(crewId: string, profileId: string): Promise<DataResult<true>> {
  const res = await db
    .from('crew_members')
    .update({ status: 'active' })
    .eq('crew_id', crewId)
    .eq('profile_id', profileId);
  return res.error ? fromResponse(res) : ok(true);
}

/** Crews someone is an active member of. */
export async function listCrewsForMember(profileId: string): Promise<DataResult<CrewLink[]>> {
  const res = await db
    .from('crew_members')
    .select('crew_id, crews(id, name)')
    .eq('profile_id', profileId)
    .eq('status', 'active');
  return res.error ? fromResponse(res) : ok((res.data ?? []) as unknown as CrewLink[]);
}
