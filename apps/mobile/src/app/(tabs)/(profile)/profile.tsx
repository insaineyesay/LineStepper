import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TabRootTopInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth-context';
import { fetchPostCredits, usePaidPosting } from '@/lib/credits';
import { isZip, lookupZip } from '@/lib/location';
import { logTap } from '@/lib/log-tap';
import { unregisterPushAsync } from '@/lib/push';
import { authClient } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Metro, Profile, ProfileRole } from '@/lib/types';

const ROLE_OPTIONS: { value: ProfileRole; label: string }[] = [
  { value: 'dancer', label: 'Dancer' },
  { value: 'crew_leader', label: 'Crew Leader' },
  { value: 'dj', label: 'DJ' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'event_planner', label: 'Event Planner' },
  { value: 'vendor', label: 'Vendor' },
];

function SignInCard() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await authClient.requestEmailOtp(email.trim());
      setCodeSent(true);
      setMessage('Check your email for a sign-in code.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await authClient.verifyEmailOtp(email.trim(), code.trim());
      // On success the session listener re-renders this screen.
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.background, color: theme.text },
  ];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Sign in or create your profile</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Enter your email and we&apos;ll send you a one-time code. No password
        needed.
      </ThemedText>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        editable={!codeSent}
        style={inputStyle}
      />
      {codeSent && (
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Code from your email"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          maxLength={10}
          style={inputStyle}
        />
      )}
      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
      {busy ? (
        <ActivityIndicator />
      ) : codeSent ? (
        <>
          <Button label="Verify code" onPress={verifyCode} disabled={code.trim().length < 6} />
          <Pressable onPress={() => { setCodeSent(false); setCode(''); setMessage(null); }}>
            <ThemedText type="small" themeColor="textSecondary">
              Use a different email
            </ThemedText>
          </Pressable>
        </>
      ) : (
        <Button
          label="Send code"
          onPress={sendCode}
          disabled={!email.includes('@')}
        />
      )}
    </ThemedView>
  );
}

interface BookmarkedEvent {
  event_id: string;
  events: {
    id: string;
    title: string;
    starts_at: string;
    venue_name: string | null;
    city: string | null;
  } | null;
}

function BookmarksCard({ userId }: { userId: string }) {
  const router = useRouter();
  const [bookmarks, setBookmarks] = useState<BookmarkedEvent[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      supabase
        .from('event_bookmarks')
        .select('event_id, events(id, title, starts_at, venue_name, city)')
        .eq('profile_id', userId)
        .then(({ data }) => {
          if (!cancelled && data) {
            const upcoming = (data as unknown as BookmarkedEvent[])
              .filter((b) => b.events)
              .sort((a, b) => a.events!.starts_at.localeCompare(b.events!.starts_at));
            setBookmarks(upcoming);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">My bookmarked events</ThemedText>
      {bookmarks.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Bookmark events from the calendar and they&apos;ll show up here. In the
          app, you&apos;ll get a reminder about a day before each one.
        </ThemedText>
      ) : (
        bookmarks.map((bookmark) => (
          <Pressable
            key={bookmark.event_id}
            onPress={() =>
              router.push({
                pathname: '/event/[id]',
                params: { id: bookmark.event_id },
              })
            }>
            <ThemedText type="small">{bookmark.events!.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {new Date(bookmark.events!.starts_at).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
              {bookmark.events!.city ? ` · ${bookmark.events!.city}` : ''}
            </ThemedText>
          </Pressable>
        ))
      )}
    </ThemedView>
  );
}

function MyEventsCard({ userId }: { userId: string }) {
  const router = useRouter();
  const paidPosting = usePaidPosting();
  const [credits, setCredits] = useState<number | null>(null);
  const [myEvents, setMyEvents] = useState<
    { id: string; title: string; starts_at: string; status: string }[]
  >([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (paidPosting) {
        fetchPostCredits().then((n) => {
          if (!cancelled) setCredits(n);
        });
      }
      supabase
        .from('events')
        .select('id, title, starts_at, status')
        .eq('organizer_id', userId)
        .order('starts_at', { ascending: true })
        .then(({ data }) => {
          if (!cancelled && data) {
            setMyEvents(data);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [userId, paidPosting])
  );

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">My events</ThemedText>
      {paidPosting && credits !== null && (
        <Pressable onPress={() => router.push('/credits')}>
          <ThemedText type="small" themeColor="textSecondary">
            {credits} {credits === 1 ? 'post' : 'posts'} left ·{' '}
            <ThemedText type="small">Buy posts</ThemedText>
          </ThemedText>
        </Pressable>
      )}
      {myEvents.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Events you post show up here — drafts included.
        </ThemedText>
      ) : (
        myEvents.map((event) => (
          <Pressable
            key={event.id}
            onPress={() =>
              router.push({ pathname: '/event/edit/[id]', params: { id: event.id } })
            }>
            <ThemedText type="small">{event.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {new Date(event.starts_at).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
              {event.status !== 'published' ? ` · ${event.status}` : ''}
            </ThemedText>
          </Pressable>
        ))
      )}
      <Button label="+ Post an event" onPress={() => router.push('/event/new')} />
    </ThemedView>
  );
}

function ProfileEditor({ userId, email }: { userId: string; email: string | undefined }) {
  const theme = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [metros, setMetros] = useState<Metro[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [role, setRole] = useState<ProfileRole>('dancer');
  const [metroId, setMetroId] = useState<number | null>(null);
  const [zip, setZip] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: profileRow }, { data: metroRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('metros').select('*').order('id'),
    ]);
    if (profileRow) {
      setProfile(profileRow);
      setDisplayName(profileRow.display_name ?? '');
      setHandle(profileRow.handle ?? '');
      setRole(profileRow.role);
      setMetroId(profileRow.home_metro_id);
      setZip(profileRow.zip ?? '');
    }
    if (metroRows) {
      setMetros(metroRows);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() only sets state after awaited fetches resolve
    load();
  }, [load]);

  const save = async () => {
    setMessage(null);
    const cleanZip = zip.trim();
    if (cleanZip && (!isZip(cleanZip) || !(await lookupZip(cleanZip)))) {
      setMessage(`We don't recognize ZIP ${cleanZip}. Double-check it.`);
      return;
    }
    setSaving(true);
    const cleanHandle = handle.trim().toLowerCase();
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || null,
        handle: cleanHandle || null,
        role,
        home_metro_id: metroId,
        zip: cleanZip || null,
      })
      .eq('id', userId);
    setSaving(false);
    if (error) {
      setMessage(
        error.message.includes('handle')
          ? 'Handles are 3–30 characters: lowercase letters, numbers, and _ only.'
          : error.code === '23505'
            ? 'That handle is taken — try another.'
            : error.message
      );
    } else {
      setMessage('Profile saved.');
      load();
    }
  };

  if (!profile) {
    return <ActivityIndicator style={styles.loader} />;
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.background, color: theme.text },
  ];
  const isNewProfile = !profile.handle;

  return (
    <>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">
          {isNewProfile ? 'Finish setting up your profile' : 'Your profile'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Signed in as {email}
        </ThemedText>

        <ThemedText type="small">Display name</ThemedText>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="How dancers know you"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
        />

        <ThemedText type="small">Handle</ThemedText>
        <TextInput
          value={handle}
          onChangeText={setHandle}
          placeholder="your_handle"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={inputStyle}
        />

        <ThemedText type="small">I&apos;m a…</ThemedText>
        <ThemedView type="backgroundElement" style={styles.chipRow}>
          {ROLE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={role === option.value}
              onPress={() => setRole(option.value)}
            />
          ))}
        </ThemedView>

        <ThemedText type="small">Home area</ThemedText>
        <ThemedView type="backgroundElement" style={styles.chipRow}>
          {metros.map((metro) => (
            <Chip
              key={metro.id}
              label={`${metro.name}, ${metro.state}`}
              selected={metroId === metro.id}
              onPress={() => setMetroId(metro.id)}
            />
          ))}
        </ThemedView>

        <ThemedText type="small">ZIP code</ThemedText>
        <TextInput
          value={zip}
          onChangeText={(text) => setZip(text.replace(/[^0-9]/g, '').slice(0, 5))}
          placeholder="Shows you events near home"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          maxLength={5}
          style={inputStyle}
        />

        {message && (
          <ThemedText type="small" themeColor="textSecondary">
            {message}
          </ThemedText>
        )}
        {saving ? (
          <ActivityIndicator />
        ) : (
          <Button label="Save profile" onPress={save} />
        )}
      </ThemedView>

      <BookmarksCard userId={userId} />

      <MyEventsCard userId={userId} />

      <Pressable
        onPress={() =>
          logTap('sign_out', async () => {
            // Stop reminders reaching this phone before the session goes away.
            await unregisterPushAsync();
            await authClient.signOut();
          })
        }>
        <ThemedText type="small" themeColor="textSecondary" style={styles.signOut}>
          Sign out
        </ThemedText>
      </Pressable>
    </>
  );
}

export default function ProfileScreen() {
  const { session, loading } = useSession();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="subtitle">Profile</ThemedText>

          {!isSupabaseConfigured ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Backend not connected</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Copy .env.example to .env and add your Supabase project URL and
                anon key, then restart the dev server.
              </ThemedText>
            </ThemedView>
          ) : loading ? (
            <ActivityIndicator style={styles.loader} />
          ) : session ? (
            <ProfileEditor userId={session.user.id} email={session.user.email} />
          ) : (
            <SignInCard />
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: TabRootTopInset,
  },
  scroll: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  dimmed: {
    opacity: 0.4,
  },
  signOut: {
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
  loader: {
    paddingTop: Spacing.five,
  },
});
