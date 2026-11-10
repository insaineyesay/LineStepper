import { db } from './backend';
import { fromResponse, ok, type DataResult } from './result';

export async function countFollowers(profileId: string): Promise<DataResult<number>> {
  const res = await db.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', profileId);
  return res.error ? fromResponse(res) : ok(res.count ?? 0);
}

export async function isFollowing(followerId: string, followedId: string): Promise<DataResult<boolean>> {
  const res = await db
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('followed_id', followedId)
    .maybeSingle();
  return res.error ? fromResponse(res) : ok(Boolean(res.data));
}

export async function follow(followerId: string, followedId: string): Promise<DataResult<true>> {
  const res = await db.from('follows').insert({ follower_id: followerId, followed_id: followedId });
  return res.error ? fromResponse(res) : ok(true);
}

export async function unfollow(followerId: string, followedId: string): Promise<DataResult<true>> {
  const res = await db.from('follows').delete().eq('follower_id', followerId).eq('followed_id', followedId);
  return res.error ? fromResponse(res) : ok(true);
}
