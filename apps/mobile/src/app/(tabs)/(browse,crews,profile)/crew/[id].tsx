import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth-context';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Crew } from '@/lib/types';

interface CrewDetail extends Crew {
  metro: { name: string; state: string } | null;
  owner: { id: string; display_name: string | null; handle: string | null } | null;
}

interface MemberRow {
  profile_id: string;
  role: 'owner' | 'admin' | 'member';
  status: 'pending' | 'active' | 'removed';
  profile: {
    id: string;
    display_name: string | null;
    handle: string | null;
    role: string;
  } | null;
}

function memberName(m: MemberRow) {
  return m.profile?.display_name ?? m.profile?.handle ?? 'Dancer';
}

export default function CrewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [crew, setCrew] = useState<CrewDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [myMembership, setMyMembership] = useState<MemberRow | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = Boolean(session && crew && crew.owner_id === session.user.id);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !id) {
      setNotFound(true);
      return;
    }
    const { data, error } = await supabase
      .from('crews')
      .select(
        '*, metro:metros(name, state), owner:profiles!crews_owner_id_fkey(id, display_name, handle)'
      )
      .eq('id', id)
      .single();
    if (error || !data) {
      setNotFound(true);
      return;
    }
    setCrew(data as CrewDetail);

    const { data: memberRows } = await supabase
      .from('crew_members')
      .select('profile_id, role, status, profile:profiles(id, display_name, handle, role)')
      .eq('crew_id', id);
    if (memberRows) {
      const rows = memberRows as unknown as MemberRow[];
      setMembers(rows);
      setMyMembership(
        session ? (rows.find((m) => m.profile_id === session.user.id) ?? null) : null
      );
    }
  }, [id, session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only sets state after awaited fetches resolve
    load();
  }, [load]);

  const requestJoin = async () => {
    if (!session || !crew) {
      return;
    }
    setBusy(true);
    await supabase.from('crew_members').insert({
      crew_id: crew.id,
      profile_id: session.user.id,
      role: 'member',
      status: 'pending',
    });
    await load();
    setBusy(false);
  };

  const leaveOrCancel = async () => {
    if (!session || !crew) {
      return;
    }
    setBusy(true);
    await supabase
      .from('crew_members')
      .delete()
      .eq('crew_id', crew.id)
      .eq('profile_id', session.user.id);
    await load();
    setBusy(false);
  };

  const approve = async (profileId: string) => {
    if (!crew) {
      return;
    }
    setBusy(true);
    await supabase
      .from('crew_members')
      .update({ status: 'active' })
      .eq('crew_id', crew.id)
      .eq('profile_id', profileId);
    await load();
    setBusy(false);
  };

  const removeMember = async (profileId: string) => {
    if (!crew) {
      return;
    }
    setBusy(true);
    await supabase
      .from('crew_members')
      .delete()
      .eq('crew_id', crew.id)
      .eq('profile_id', profileId);
    await load();
    setBusy(false);
  };

  if (notFound) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          This crew isn&apos;t available.
        </ThemedText>
      </ThemedView>
    );
  }

  if (!crew) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.centered} />
      </ThemedView>
    );
  }

  const activeMembers = members.filter((m) => m.status === 'active');
  const pendingMembers = members.filter((m) => m.status === 'pending');

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedView style={styles.content}>
          {crew.tier === 'featured' && (
            <ThemedText type="smallBold">★ Featured crew</ThemedText>
          )}
          <ThemedText type="subtitle">{crew.name}</ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            {crew.metro && (
              <ThemedText type="small" themeColor="textSecondary">
                {crew.metro.name}, {crew.metro.state}
              </ThemedText>
            )}
            {crew.description && (
              <ThemedText type="default">{crew.description}</ThemedText>
            )}
            {crew.owner && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/member/[id]',
                    params: { id: crew.owner!.id },
                  })
                }>
                <ThemedText type="small" themeColor="textSecondary">
                  Led by{' '}
                  <ThemedText type="smallBold">
                    {crew.owner.display_name ?? crew.owner.handle ?? 'the crew leader'}
                  </ThemedText>
                </ThemedText>
              </Pressable>
            )}
          </ThemedView>

          {crew.merch_url && (
            <Pressable onPress={() => Linking.openURL(crew.merch_url!)}>
              <ThemedView type="backgroundSelected" style={styles.actionButton}>
                <ThemedText type="smallBold">Shop crew merch</ThemedText>
              </ThemedView>
            </Pressable>
          )}

          {/* Join / membership state */}
          {busy ? (
            <ActivityIndicator />
          ) : !session ? (
            crew.is_joinable && (
              <ThemedText type="small" themeColor="textSecondary">
                Sign in on the Profile tab to request to join this crew.
              </ThemedText>
            )
          ) : myMembership?.status === 'active' ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">✓ You&apos;re a member</ThemedText>
              {isOwner ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/crew/edit/[id]',
                      params: { id: crew.id },
                    })
                  }>
                  <ThemedText type="small" themeColor="textSecondary">
                    Edit crew
                  </ThemedText>
                </Pressable>
              ) : (
                <Pressable onPress={leaveOrCancel}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Leave crew
                  </ThemedText>
                </Pressable>
              )}
            </ThemedView>
          ) : myMembership?.status === 'pending' ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Request pending</ThemedText>
              <Pressable onPress={leaveOrCancel}>
                <ThemedText type="small" themeColor="textSecondary">
                  Cancel request
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : crew.is_joinable ? (
            <Button label="Request to join" onPress={requestJoin} />
          ) : null}

          {/* Members */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">
              Members{activeMembers.length > 0 ? ` (${activeMembers.length})` : ''}
            </ThemedText>
            {activeMembers.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No members listed yet.
              </ThemedText>
            ) : (
              activeMembers.map((member) => (
                <ThemedView
                  key={member.profile_id}
                  type="backgroundElement"
                  style={styles.memberRow}>
                  <Pressable
                    style={styles.memberName}
                    onPress={() =>
                      router.push({
                        pathname: '/member/[id]',
                        params: { id: member.profile_id },
                      })
                    }>
                    <ThemedText type="small">
                      {memberName(member)}
                      {member.role !== 'member' ? ` · ${member.role}` : ''}
                    </ThemedText>
                  </Pressable>
                  {isOwner && member.role !== 'owner' && (
                    <Pressable onPress={() => removeMember(member.profile_id)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Remove
                      </ThemedText>
                    </Pressable>
                  )}
                </ThemedView>
              ))
            )}
          </ThemedView>

          {/* Owner: pending requests */}
          {isOwner && pendingMembers.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">
                Join requests ({pendingMembers.length})
              </ThemedText>
              {pendingMembers.map((member) => (
                <ThemedView
                  key={member.profile_id}
                  type="backgroundElement"
                  style={styles.memberRow}>
                  <ThemedText type="small" style={styles.memberName}>
                    {memberName(member)}
                  </ThemedText>
                  <Pressable onPress={() => approve(member.profile_id)}>
                    <ThemedText type="smallBold">Approve</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => removeMember(member.profile_id)}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Decline
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              ))}
            </ThemedView>
          )}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    textAlign: 'center',
    paddingTop: Spacing.six,
  },
  scroll: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  actionButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  memberName: {
    flex: 1,
  },
});
