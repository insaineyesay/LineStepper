import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { listBlocked, unblockPerson, type PersonSummary } from '@/data/moderation';
import { logTap } from '@/lib/log-tap';

/** Profile card listing the people you blocked, with Unblock. Hidden when there are none. */
export function BlockedPeople() {
  const [people, setPeople] = useState<PersonSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listBlocked().then(({ data }) => {
        if (!cancelled && data) setPeople(data);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (people.length === 0) return null;

  const unblock = async (id: string) => {
    const { error } = await unblockPerson(id);
    if (!error) setPeople((list) => list.filter((p) => p.id !== id));
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Blocked people</ThemedText>
      {people.map((p) => (
        <ThemedView key={p.id} type="backgroundElement" style={styles.row}>
          <ThemedText type="small" style={styles.name}>
            {p.displayName ?? (p.handle ? `@${p.handle}` : 'Dancer')}
          </ThemedText>
          <Pressable onPress={() => logTap('unblock_person', () => void unblock(p.id))} hitSlop={Spacing.two}>
            <ThemedText type="smallBold">Unblock</ThemedText>
          </Pressable>
        </ThemedView>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
  },
});
