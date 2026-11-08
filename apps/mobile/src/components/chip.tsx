import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { logTap } from '@/lib/log-tap';

export function Chip({
  label,
  selected,
  onPress,
  logName,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Stable name for the ui.tap log event; defaults to the label. */
  logName?: string;
}) {
  return (
    <Pressable onPress={() => logTap(logName ?? label, onPress, 'chip')}>
      <ThemedView
        type={selected ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.chip}>
        <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
});
