import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { pickPhoto } from '@/lib/image-prep';
import { logTap } from '@/lib/log-tap';

/**
 * A photo slot: shows the current image (or an empty box), with Add / Change
 * and Remove. Picking only returns the photo's local URI; the screen decides
 * when to upload.
 */
export function PhotoField({
  label,
  uri,
  shape,
  busy,
  onPicked,
  onRemove,
}: {
  label: string;
  uri: string | null;
  shape: 'flyer' | 'avatar';
  busy?: boolean;
  onPicked: (localUri: string) => void;
  onRemove: () => void;
}) {
  const choose = async () => {
    const picked = await pickPhoto();
    if (picked) onPicked(picked);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.wrap}>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedView style={[styles.row]} type="backgroundElement">
        <ThemedView type="background" style={shape === 'avatar' ? styles.avatar : styles.flyer}>
          {uri ? (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={label} />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No photo
            </ThemedText>
          )}
          {busy && (
            <ThemedView style={styles.busy}>
              <ActivityIndicator />
            </ThemedView>
          )}
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.actions}>
          <Pressable onPress={() => logTap(`photo_${shape}_choose`, () => void choose())} disabled={busy} hitSlop={Spacing.two}>
            <ThemedText type="smallBold">{uri ? 'Change photo' : 'Add photo'}</ThemedText>
          </Pressable>
          {uri && (
            <Pressable onPress={() => logTap(`photo_${shape}_remove`, onRemove)} disabled={busy} hitSlop={Spacing.two}>
              <ThemedText type="small" themeColor="textSecondary">
                Remove
              </ThemedText>
            </Pressable>
          )}
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flyer: {
    width: 96,
    height: 120,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
  actions: {
    gap: Spacing.two,
  },
});
