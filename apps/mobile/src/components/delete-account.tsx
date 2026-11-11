import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { LogEvents } from '@linestepper/shared';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { deleteAccount } from '@/data/account';
import { authClient } from '@/lib/auth';
import { logTap } from '@/lib/log-tap';
import { logger } from '@/lib/logger';

/**
 * "Delete account" at the bottom of Profile (required by the App Store and
 * Google Play). Asks once, in place, so it works the same on phones and web.
 */
export function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const confirm = async () => {
    setDeleting(true);
    setMessage(null);
    const { error } = await deleteAccount();
    if (error) {
      logger.warn(LogEvents.accountDeleteFailed, { code: error.code });
      setDeleting(false);
      setMessage("Your account couldn't be deleted. Check your connection and try again.");
      return;
    }
    // The account is gone on the server; clear the session on this device.
    await authClient.signOut().catch(() => {});
    onDeleted();
  };

  if (!confirming) {
    return (
      <Pressable onPress={() => logTap('delete_account', () => setConfirming(true))}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.link}>
          Delete account
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Delete your account?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        This permanently deletes your profile, the events you posted, your bookmarks, follows and
        crew memberships, and any posts you haven&apos;t used. Crews you started go to their next
        member, or are deleted if no one else is in them. This can&apos;t be undone.
      </ThemedText>
      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
      {deleting ? (
        <ActivityIndicator />
      ) : (
        <>
          <Button label="Delete my account" logName="delete_account_confirm" onPress={confirm} />
          <Pressable onPress={() => logTap('delete_account_cancel', () => setConfirming(false))}>
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
