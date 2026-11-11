import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { blockPerson } from '@/data/moderation';
import { logTap } from '@/lib/log-tap';

/**
 * "Block" on someone's profile. Asks once, then hides you from each other:
 * profiles, events and crews, and removes follows both ways. Undo it from
 * Profile → Blocked people.
 */
export function BlockButton({ profileId, name, onBlocked }: { profileId: string; name: string; onBlocked: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!confirming) {
    return (
      <Pressable onPress={() => logTap('block_person', () => setConfirming(true))}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.link}>
          Block {name}
        </ThemedText>
      </Pressable>
    );
  }

  const confirm = async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await blockPerson(profileId);
    setBusy(false);
    if (error) {
      setMessage("Couldn't block right now. Try again in a moment.");
      return;
    }
    onBlocked();
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Block {name}?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        You won&apos;t see each other&apos;s profiles, events or crews, and any follows between you are
        removed. They aren&apos;t told. You can unblock them from your Profile.
      </ThemedText>
      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
      {busy ? (
        <ActivityIndicator />
      ) : (
        <>
          <Button label="Block" logName="block_person_confirm" onPress={confirm} />
          <Pressable onPress={() => logTap('block_person_cancel', () => setConfirming(false))}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.link}>
              Cancel
            </ThemedText>
          </Pressable>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  link: {
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
});
