import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { logTap } from '@/lib/log-tap';

export function Button({
  label,
  onPress,
  logName,
  disabled,
}: {
  label: string;
  onPress: () => void;
  /** Stable name for the ui.tap log event; defaults to the label. */
  logName?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={() => logTap(logName ?? label, onPress, 'button')} disabled={disabled} style={disabled && styles.dimmed}>
      <ThemedView type="backgroundSelected" style={styles.button}>
        <ThemedText type="smallBold">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  dimmed: {
    opacity: 0.4,
  },
});
