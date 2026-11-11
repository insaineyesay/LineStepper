import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TabRootTopInset } from '@/constants/theme';
import { useSession } from '@/lib/auth-context';
import { isBackendConfigured } from '@/data/backend';
import { listCrews } from '@/data/crews';
import type { Crew } from '@/lib/types';

const SAMPLE_CREWS: Crew[] = [
  {
    id: 'sample-1',
    name: 'Richmond Smooth Steppers',
    slug: 'richmond-smooth-steppers',
    description: 'Soul line dance crew hosting monthly socials across RVA.',
    logo_url: null,
    home_metro_id: 2,
    owner_id: 'sample',
    is_joinable: true,
    tier: 'featured',
    merch_url: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'sample-2',
    name: 'Tidewater Line Kings',
    slug: 'tidewater-line-kings',
    description: 'Hampton Roads crew — all levels welcome, weekly practice.',
    logo_url: null,
    home_metro_id: 1,
    owner_id: 'sample',
    is_joinable: true,
    tier: 'standard',
    merch_url: null,
    created_at: '',
    updated_at: '',
  },
];

function CrewCard({ crew, onPress }: { crew: Crew; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedView type="backgroundElement" style={styles.cardHeader}>
        <ThemedText type="default">{crew.name}</ThemedText>
        {crew.tier === 'featured' && <ThemedText type="small">★ Featured</ThemedText>}
      </ThemedView>
      {crew.description && (
        <ThemedText type="small" themeColor="textSecondary">
          {crew.description}
        </ThemedText>
      )}
      {crew.is_joinable && (
        <ThemedText type="smallBold">Accepting new members</ThemedText>
      )}
      </ThemedView>
    </Pressable>
  );
}

export default function CrewsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [crews, setCrews] = useState<Crew[]>(SAMPLE_CREWS);
  const [usingSampleData, setUsingSampleData] = useState(true);

  // Refetch every time the tab gains focus so new crews appear.
  useFocusEffect(
    useCallback(() => {
      if (!isBackendConfigured) {
        return;
      }
      let cancelled = false;
      listCrews().then(({ data, error }) => {
        if (!cancelled && !error) {
          setCrews(data);
          setUsingSampleData(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Crews</ThemedText>
        {usingSampleData && (
          <ThemedText type="small" themeColor="textSecondary">
            Showing sample crews — connect Supabase in .env to load real data.
          </ThemedText>
        )}
        {session && (
          <Button label="+ Start a crew" onPress={() => router.push('/crew/new')} />
        )}
        <FlatList
          data={crews}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CrewCard
              crew={item}
              onPress={() =>
                router.push({ pathname: '/crew/[id]', params: { id: item.id } })
              }
            />
          )}
          contentContainerStyle={styles.list}
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
  pressed: {
    opacity: 0.7,
  },
});
