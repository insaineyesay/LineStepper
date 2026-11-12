import { Image } from 'expo-image';
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
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { useSession } from '@/lib/auth-context';
import { useFlag } from '@/lib/flags';
import { getPushStatusAsync, registerForPushAsync, type PushStatus } from '@/lib/push';
import { BlockButton } from '@/components/block-button';
import { ReportButton } from '@/components/report-button';
import { isBackendConfigured } from '@/data/backend';
import { listCrewsForMember, type CrewLink } from '@/data/crews';
import { listUpcomingEventsByOrganizer, type UpcomingEventSummary } from '@/data/events';
import { countFollowers, follow, isFollowing as fetchIsFollowing, unfollow } from '@/data/follows';
import { getMemberProfile, type MemberProfile } from '@/data/profiles';
import type { ProfileRole } from '@/lib/types';

function followNote(pushStatus: PushStatus, name: string): string {
  switch (pushStatus) {
    case 'granted':
      return `We'll let you know when ${name} posts an event.`;
    case 'denied':
      return `Turn on notifications for LineStepper in Settings to hear when ${name} posts an event.`;
    case 'unsupported':
      return `Get the LineStepper app to hear when ${name} posts an event.`;
    default:
      return '';
  }
}

const ROLE_LABELS: Record<ProfileRole, string> = {
  dancer: 'Dancer',
  crew_leader: 'Crew Leader',
  dj: 'DJ',
  instructor: 'Instructor',
  event_planner: 'Event Planner',
  vendor: 'Vendor',
};

export default function MemberScreen() {
  const tabBarPadding = useTabBarPadding();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [crews, setCrews] = useState<CrewLink[]>([]);
  const [events, setEvents] = useState<UpcomingEventSummary[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isBackendConfigured || !id) {
      setNotFound(true);
      return;
    }
    const { data, error } = await getMemberProfile(id);
    if (error) {
      setNotFound(true);
      return;
    }
    setProfile(data);

    const [crewRes, eventRes, countRes] = await Promise.all([
      listCrewsForMember(id),
      listUpcomingEventsByOrganizer(id),
      countFollowers(id),
    ]);
    if (crewRes.data) {
      setCrews(crewRes.data);
    }
    if (eventRes.data) {
      setEvents(eventRes.data);
    }
    setFollowerCount(countRes.data ?? 0);

    if (session && session.user.id !== id) {
      const { data: following } = await fetchIsFollowing(session.user.id, id);
      setIsFollowing(Boolean(following));
    }
  }, [id, session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only sets state after awaited fetches resolve
    load();
  }, [load]);

  const followerAlertsFlag = useFlag('events.follower_alerts');
  const pushFlag = useFlag('notify.push');
  const followerAlertsOn = followerAlertsFlag && pushFlag;
  const [pushStatus, setPushStatus] = useState<PushStatus>('undetermined');
  const [justFollowed, setJustFollowed] = useState(false);

  const toggleFollow = async () => {
    if (!session || !id) {
      return;
    }
    setFollowBusy(true);
    if (isFollowing) {
      const { error } = await unfollow(session.user.id, id);
      if (!error) {
        setIsFollowing(false);
        setFollowerCount((c) => Math.max(0, c - 1));
      }
    } else {
      const { error } = await follow(session.user.id, id);
      if (!error) {
        setIsFollowing(true);
        setFollowerCount((c) => c + 1);
        setJustFollowed(true);
        // Following is when new-event alerts make sense, so ask for notifications here.
        if (followerAlertsOn) {
          const result = await registerForPushAsync({ prompt: true });
          setPushStatus(
            result === 'registered' ? 'granted' : result === 'denied' ? 'denied' : await getPushStatusAsync()
          );
        }
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
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <ThemedView style={styles.content}>
          {profile.tier === 'featured' && (
            <ThemedText type="smallBold">★ Featured</ThemedText>
          )}
          {profile.avatar_url && (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" accessibilityLabel={`${name}'s photo`} />
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
          {session && !isSelf && isFollowing && justFollowed && followerAlertsOn && (
            <ThemedText type="small" themeColor="textSecondary">
              {followNote(pushStatus, name)}
            </ThemedText>
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
          {session && !isSelf && (
            <>
              <ReportButton targetType="profile" targetId={profile.id} />
              <BlockButton profileId={profile.id} name={name} onBlocked={() => router.back()} />
            </>
          )}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
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
