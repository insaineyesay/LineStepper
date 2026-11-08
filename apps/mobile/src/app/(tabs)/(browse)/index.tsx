import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TabRootTopInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth-context';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { DanceEvent, Metro } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_FILTERS = [
  { key: 'all', label: 'All upcoming', days: null },
  { key: '7d', label: 'This week', days: 7 },
  { key: '30d', label: 'This month', days: 30 },
] as const;

type DateFilterKey = (typeof DATE_FILTERS)[number]['key'];

// Placeholder data so the calendar has life before Supabase is connected.
const SAMPLE_EVENTS: DanceEvent[] = [
  {
    id: 'sample-1',
    title: 'Soul Line Saturday',
    description: 'All-levels social with line dance instruction the first hour.',
    starts_at: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    ends_at: null,
    venue_name: 'The Grand Ballroom',
    address: null,
    city: 'Norfolk',
    metro_id: 1,
    flyer_url: null,
    organizer_id: 'sample',
    crew_id: null,
    status: 'published',
    is_featured: true,
    price_text: '$10 at the door',
    ticket_url: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'sample-2',
    title: 'RVA Line Dance Social',
    description: 'Monthly social hosted by the Richmond Smooth Steppers.',
    starts_at: new Date(Date.now() + 8 * DAY_MS).toISOString(),
    ends_at: null,
    venue_name: 'Community Center West',
    address: null,
    city: 'Richmond',
    metro_id: 2,
    flyer_url: null,
    organizer_id: 'sample',
    crew_id: null,
    status: 'published',
    is_featured: false,
    price_text: 'Free',
    ticket_url: null,
    created_at: '',
    updated_at: '',
  },
];

export function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function EventCard({ event, onPress }: { event: DanceEvent; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedView type="backgroundElement" style={styles.cardHeader}>
          <ThemedText type="smallBold" style={styles.cardDate}>
            {formatEventDate(event.starts_at)}
          </ThemedText>
          {event.is_featured && <ThemedText type="small">★ Featured</ThemedText>}
        </ThemedView>
        <ThemedText type="default">{event.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[event.venue_name, event.city].filter(Boolean).join(' · ')}
          {event.price_text ? ` · ${event.price_text}` : ''}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export default function EventsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const [events, setEvents] = useState<DanceEvent[]>(SAMPLE_EVENTS);
  const [metros, setMetros] = useState<Metro[]>([]);
  const [usingSampleData, setUsingSampleData] = useState(true);
  const [search, setSearch] = useState('');
  const [metroFilter, setMetroFilter] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<{
    key: DateFilterKey;
    cutoff: number | null;
  }>({ key: 'all', cutoff: null });

  // Refetch every time the tab gains focus so freshly posted events appear.
  useFocusEffect(
    useCallback(() => {
      if (!isSupabaseConfigured) {
        return;
      }
      let cancelled = false;
      supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(100)
        .then(({ data, error }) => {
          if (!cancelled && !error && data) {
            setEvents(data);
            setUsingSampleData(false);
          }
        });
      supabase
        .from('metros')
        .select('*')
        .order('id')
        .then(({ data }) => {
          if (!cancelled && data) {
            setMetros(data);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = dateFilter.cutoff;
    return events.filter((e) => {
      if (metroFilter !== null && e.metro_id !== metroFilter) {
        return false;
      }
      if (cutoff && new Date(e.starts_at).getTime() > cutoff) {
        return false;
      }
      if (!q) {
        return true;
      }
      return [e.title, e.venue_name, e.city]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [events, search, metroFilter, dateFilter]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.heading}>
          Events
        </ThemedText>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, venue, or city"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.search,
            { backgroundColor: theme.backgroundElement, color: theme.text },
          ]}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}>
          {DATE_FILTERS.map((filter) => (
            <Chip
              key={filter.key}
              label={filter.label}
              selected={dateFilter.key === filter.key}
              onPress={() =>
                setDateFilter({
                  key: filter.key,
                  cutoff: filter.days ? Date.now() + filter.days * DAY_MS : null,
                })
              }
            />
          ))}
        </ScrollView>
        {metros.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}>
            <Chip
              label="All areas"
              selected={metroFilter === null}
              onPress={() => setMetroFilter(null)}
            />
            {metros.map((metro) => (
              <Chip
                key={metro.id}
                label={metro.name}
                selected={metroFilter === metro.id}
                onPress={() => setMetroFilter(metro.id)}
              />
            ))}
          </ScrollView>
        )}
        {usingSampleData && (
          <ThemedText type="small" themeColor="textSecondary">
            Showing sample events — connect Supabase in .env to load real data.
          </ThemedText>
        )}
        {session && (
          <Button
            label="+ Post an event"
            onPress={() => router.push('/event/new')}
          />
        )}
        <FlatList
          data={visibleEvents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onPress={() =>
                router.push({ pathname: '/event/[id]', params: { id: item.id } })
              }
            />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No events match your filters.
            </ThemedText>
          }
        />
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
    gap: Spacing.three,
  },
  heading: {
    marginBottom: Spacing.one,
  },
  search: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
  },
  chipScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chipRow: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDate: {
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.7,
  },
  empty: {
    textAlign: 'center',
    paddingTop: Spacing.five,
  },
});
