import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { PricingCard } from '@/components/pricing-card';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TabRootTopInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth-context';
import { EVENT_TYPES, SKILL_LEVELS, kindLine, matchesLevel } from '@/lib/event-kinds';
import {
  DEFAULT_RADIUS,
  distanceMiles,
  getDeviceLocation,
  isZip,
  lookupZip,
  RADIUS_OPTIONS,
  type Coords,
  type RadiusMiles,
} from '@/lib/location';
import { isBackendConfigured } from '@/data/backend';
import { listEventsNear, listUpcomingEvents } from '@/data/events';
import { getProfileZip } from '@/data/profiles';
import type { DanceEvent, EventType, SkillLevel } from '@/lib/types';

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
    zip: null,
    lat: null,
    lng: null,
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
    zip: null,
    lat: null,
    lng: null,
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

/** Where "near" searches are measured from. */
type Origin =
  | { kind: 'anywhere' }
  | { kind: 'me'; coords: Coords }
  | { kind: 'zip'; zip: string; coords: Coords };

function EventCard({
  event,
  milesAway,
  onPress,
}: {
  event: DanceEvent;
  milesAway: number | null;
  onPress: () => void;
}) {
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
        {kindLine(event) && (
          <ThemedText type="small" themeColor="textSecondary">
            {kindLine(event)}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {[event.venue_name, event.city].filter(Boolean).join(' · ')}
          {event.price_text ? ` · ${event.price_text}` : ''}
          {milesAway !== null ? ` · ${milesAway < 1 ? 'under 1' : Math.round(milesAway)} mi` : ''}
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
  const [usingSampleData, setUsingSampleData] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<EventType | null>(null);
  // "All levels" events show under every level.
  const [levelFilter, setLevelFilter] = useState<SkillLevel | null>(null);
  const [showKindFilters, setShowKindFilters] = useState(false);
  const activeKindFilters = (typeFilter ? 1 : 0) + (levelFilter ? 1 : 0);
  const [origin, setOrigin] = useState<Origin>({ kind: 'anywhere' });
  const [radius, setRadius] = useState<RadiusMiles>(DEFAULT_RADIUS);
  const [zipInput, setZipInput] = useState('');
  const [locating, setLocating] = useState(false);
  const [nearMessage, setNearMessage] = useState<string | null>(null);
  // Once someone picks a location themselves, don't replace it with their
  // profile ZIP when that finishes loading.
  const pickedOrigin = useRef(false);
  const [dateFilter, setDateFilter] = useState<{
    key: DateFilterKey;
    cutoff: number | null;
  }>({ key: 'all', cutoff: null });

  // Start near the signed-in person's ZIP (PRD: events within 25 miles).
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId || !isBackendConfigured) return;
    let cancelled = false;
    (async () => {
      const { data: zip } = await getProfileZip(userId);
      if (!zip || cancelled || pickedOrigin.current) return;
      const coords = await lookupZip(zip);
      if (coords && !cancelled && !pickedOrigin.current) {
        setOrigin({ kind: 'zip', zip, coords });
        setZipInput(zip);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Refetch every time the tab gains focus (so freshly posted events appear)
  // and whenever the location or radius changes.
  useFocusEffect(
    useCallback(() => {
      if (!isBackendConfigured) {
        return;
      }
      let cancelled = false;
      const request =
        origin.kind === 'anywhere' ? listUpcomingEvents() : listEventsNear(origin.coords, radius);
      request.then(({ data, error }) => {
        if (!cancelled && !error) {
          setEvents(data);
          setUsingSampleData(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [origin, radius])
  );

  const chooseAnywhere = () => {
    pickedOrigin.current = true;
    setNearMessage(null);
    setOrigin({ kind: 'anywhere' });
  };

  const chooseNearMe = async () => {
    pickedOrigin.current = true;
    setNearMessage(null);
    setLocating(true);
    const result = await getDeviceLocation();
    setLocating(false);
    if (result === 'denied') {
      setNearMessage('Location is off for LineUp2Step. Enter a ZIP code instead, or allow location in Settings.');
    } else if (result === 'unavailable') {
      setNearMessage("Couldn't find your location. Enter a ZIP code instead.");
    } else {
      setOrigin({ kind: 'me', coords: result });
    }
  };

  const changeZip = async (text: string) => {
    const zip = text.replace(/[^0-9]/g, '').slice(0, 5);
    setZipInput(zip);
    if (!isZip(zip)) return;
    pickedOrigin.current = true;
    setNearMessage(null);
    const coords = await lookupZip(zip);
    if (coords) {
      setOrigin({ kind: 'zip', zip, coords });
    } else {
      setNearMessage(`We don't recognize ZIP ${zip}.`);
    }
  };

  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = dateFilter.cutoff;
    return events.filter((e) => {
      if (cutoff && new Date(e.starts_at).getTime() > cutoff) {
        return false;
      }
      if (typeFilter && e.event_type !== typeFilter) {
        return false;
      }
      if (!matchesLevel(e.skill_level, levelFilter)) {
        return false;
      }
      if (!q) {
        return true;
      }
      return [e.title, e.venue_name, e.city]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [events, search, dateFilter, typeFilter, levelFilter]);

  const originCoords = origin.kind === 'anywhere' ? null : origin.coords;

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
          <Chip
            label={activeKindFilters ? `Type & level (${activeKindFilters})` : 'Type & level'}
            selected={showKindFilters || activeKindFilters > 0}
            onPress={() => setShowKindFilters((v) => !v)}
          />
        </ScrollView>
        {showKindFilters && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}>
              <Chip label="Any type" selected={!typeFilter} onPress={() => setTypeFilter(null)} />
              {EVENT_TYPES.map((t) => (
                <Chip
                  key={t.value}
                  label={t.label}
                  selected={typeFilter === t.value}
                  onPress={() => setTypeFilter(typeFilter === t.value ? null : t.value)}
                />
              ))}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}>
              <Chip label="Any level" selected={!levelFilter} onPress={() => setLevelFilter(null)} />
              {SKILL_LEVELS.filter((l) => l.value !== 'all').map((l) => (
                <Chip
                  key={l.value}
                  label={l.label}
                  selected={levelFilter === l.value}
                  onPress={() => setLevelFilter(levelFilter === l.value ? null : l.value)}
                />
              ))}
            </ScrollView>
          </>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}>
          <Chip label="Anywhere" selected={origin.kind === 'anywhere'} onPress={chooseAnywhere} />
          <Chip
            label={locating ? 'Finding you…' : 'Near me'}
            selected={origin.kind === 'me'}
            onPress={() => void chooseNearMe()}
          />
          <TextInput
            value={zipInput}
            onChangeText={(text) => void changeZip(text)}
            placeholder="ZIP"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            maxLength={5}
            accessibilityLabel="ZIP code"
            style={[
              styles.zipInput,
              {
                backgroundColor: origin.kind === 'zip' ? theme.backgroundSelected : theme.backgroundElement,
                color: theme.text,
              },
            ]}
          />
        </ScrollView>
        {origin.kind !== 'anywhere' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}>
            {RADIUS_OPTIONS.map((miles) => (
              <Chip
                key={miles}
                label={`${miles} mi`}
                selected={radius === miles}
                onPress={() => setRadius(miles)}
              />
            ))}
          </ScrollView>
        )}
        {nearMessage && (
          <ThemedText type="small" themeColor="textSecondary">
            {nearMessage}
          </ThemedText>
        )}
        {usingSampleData && (
          <ThemedText type="small" themeColor="textSecondary">
            Showing sample events — connect Supabase in .env to load real data.
          </ThemedText>
        )}
        <PricingCard />
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
              milesAway={
                originCoords && item.lat !== null && item.lng !== null
                  ? distanceMiles(originCoords, { lat: item.lat, lng: item.lng })
                  : null
              }
              onPress={() =>
                router.push({ pathname: '/event/[id]', params: { id: item.id } })
              }
            />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {origin.kind === 'anywhere'
                ? 'No events match your filters.'
                : `No events within ${radius} miles. Try a wider distance.`}
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
    alignItems: 'center',
  },
  // Sized and shaped like a chip so it sits in the same row.
  zipInput: {
    width: 72,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
    textAlign: 'center',
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
