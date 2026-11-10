import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { logTap } from '@/lib/log-tap';

/** Shown at the top of a form that reopened with autosaved work in it. */
export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  return (
    <ThemedView type="backgroundSelected" style={styles.notice}>
      <ThemedText type="small" style={styles.text}>
        Picked up where you left off.
      </ThemedText>
      <Pressable onPress={() => logTap('discard_form_draft', onDiscard, 'button')} hitSlop={Spacing.two}>
        <ThemedText type="smallBold">Start over</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  text: {
    flex: 1,
  },
});
