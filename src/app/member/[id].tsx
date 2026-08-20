import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import type { Profile, ProfileRole } from '@/lib/types';

const ROLE_LABELS: Record<ProfileRole, string> = {
  dancer: 'Dancer',
  crew_leader: 'Crew Leader',
  dj: 'DJ',
  instructor: 'Instructor',
  event_planner: 'Event Planner',
  vendor: 'Vendor',
};

interface MemberProfile extends Profile {
  metro: { name: string; state: string } | null;
}

interface CrewLink {
  crew_id: string;
  crews: { id: string; name: string } | null;
}

interface UpcomingEvent {
  id: string;
  title: string;
  starts_at: string;
  city: string | null;
}

export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [crews, setCrews] = useState<CrewLink[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !id) {
      setNotFound(true);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*, metro:metros(name, state)')
      .eq('id', id)
      .single();
    if (error || !data) {
      setNotFound(true);
      return;
    }
    setProfile(data as MemberProfile);

    const [crewRes, eventRes, countRes] = await Promise.all([
      supabase
        .from('crew_members')
        .select('crew_id, crews(id, name)')
        .eq('profile_id', id)
        .eq('status', 'active'),
      supabase
        .from('events')
        .select('id, title, starts_at, city')
        .eq('organizer_id', id)
        .eq('status', 'published')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(10),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('followed_id', id),
    ]);
    if (crewRes.data) {
      setCrews(crewRes.data as unknown as CrewLink[]);
    }
    if (eventRes.data) {
      setEvents(eventRes.data);
    }
    setFollowerCount(countRes.count ?? 0);

    if (session && session.user.id !== id) {
      const { data: followRow } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', session.user.id)
        .eq('followed_id', id)
        .maybeSingle();
      setIsFollowing(Boolean(followRow));
    }
  }, [id, session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only sets state after awaited fetches resolve
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!session || !id) {
      return;
    }
    setFollowBusy(true);
    if (isFollowing) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', session.user.id)
        .eq('followed_id', id);
      if (!error) {
        setIsFollowing(false);
        setFollowerCount((c) => Math.max(0, c - 1));
      }
    } else {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: session.user.id, followed_id: id });
      if (!error) {
        setIsFollowing(true);
        setFollowerCount((c) => c + 1);
      }
    }
    setFollowBusy(false);
  };

  if (notFound) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          This profile isn&apos;t available.
        </ThemedText>
      </ThemedView>
    );
  }

  if (!profile) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator style={styles.centered} />
      </ThemedView>
    );
  }

  const name = profile.display_name ?? profile.handle ?? 'Dancer';
  const isSelf = session?.user.id === profile.id;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedView style={styles.content}>
          {profile.tier === 'featured' && (
            <ThemedText type="smallBold">★ Featured</ThemedText>
          )}
          <ThemedText type="subtitle">{name}</ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              {ROLE_LABELS[profile.role]}
              {profile.handle ? ` · @${profile.handle}` : ''}
            </ThemedText>
            {profile.metro && (
              <ThemedText type="small" themeColor="textSecondary">
                {profile.metro.name}, {profile.metro.state}
              </ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
            </ThemedText>
            {profile.bio && <ThemedText type="default">{profile.bio}</ThemedText>}
          </ThemedView>

          {session && !isSelf && (
            <Button
              label={
                followBusy ? '…' : isFollowing ? '✓ Following' : 'Follow'
              }
              onPress={toggleFollow}
              disabled={followBusy}
            />
          )}
          {!session && (
            <ThemedText type="small" themeColor="textSecondary">
              Sign in on the Profile tab to follow{' '}
              {profile.display_name ?? 'this member'}.
            </ThemedText>
          )}

          {crews.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Crews</ThemedText>
              {crews.map(
                (link) =>
                  link.crews && (
                    <Pressable
                      key={link.crew_id}
                      onPress={() =>
                        router.push({
                          pathname: '/crew/[id]',
                          params: { id: link.crew_id },
                        })
                      }>
                      <ThemedText type="small">{link.crews.name}</ThemedText>
                    </Pressable>
                  )
              )}
            </ThemedView>
          )}

          {events.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Upcoming events</ThemedText>
              {events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() =>
                    router.push({
                      pathname: '/event/[id]',
                      params: { id: event.id },
                    })
                  }>
                  <ThemedText type="small">{event.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {new Date(event.starts_at).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {event.city ? ` · ${event.city}` : ''}
                  </ThemedText>
                </Pressable>
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
});
