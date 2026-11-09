import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth-context';
import { fetchPostCredits, startCheckout } from '@/lib/credits';
import { formatPrice, POST_PACK_OPTIONS, type PostPackOption } from '@/lib/post-packs';

/**
 * Post credit balance and, on the web, buying more with Stripe. In the
 * phone apps posts will be bought with Apple / Google in-app purchase, which
 * needs the store accounts first; until then the apps only show the balance.
 */
export default function CreditsScreen() {
  const { session } = useSession();
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const [balance, setBalance] = useState<number | null>(null);
  const [busyPack, setBusyPack] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBalance(await fetchPostCredits());
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session) void load();
    }, [session, load])
  );

  // Stripe confirms the payment to our server a moment after the buyer comes
  // back, so check the balance a few more times.
  useEffect(() => {
    if (checkout !== 'success' || !session) return;
    const timers = [2000, 5000, 10000].map((ms) => setTimeout(() => void load(), ms));
    return () => timers.forEach(clearTimeout);
  }, [checkout, session, load]);

  const buy = async (pack: PostPackOption) => {
    setMessage(null);
    setBusyPack(pack.id);
    const error = await startCheckout(pack);
    if (error) {
      setMessage(error);
      setBusyPack(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedView style={styles.content}>
          {!session ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Sign in to buy posts</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Sign in on the Profile tab first.
              </ThemedText>
            </ThemedView>
          ) : (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  Your posts
                </ThemedText>
                {balance === null ? (
                  <ActivityIndicator />
                ) : (
                  <ThemedText type="subtitle">
                    {balance} {balance === 1 ? 'post' : 'posts'} left
                  </ThemedText>
                )}
                <ThemedText type="small" themeColor="textSecondary">
                  Each event you publish uses one post. Editing it, or unpublishing
                  and publishing it again, is free.
                </ThemedText>
              </ThemedView>

              {checkout === 'success' && (
                <ThemedText type="small">
                  Payment received. Your posts will show up here in a few seconds.
                </ThemedText>
              )}
              {checkout === 'cancelled' && (
                <ThemedText type="small" themeColor="textSecondary">
                  Checkout cancelled. You weren&apos;t charged.
                </ThemedText>
              )}

              {Platform.OS === 'web' ? (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">Buy posts</ThemedText>
                  {POST_PACK_OPTIONS.map((pack) =>
                    busyPack === pack.id ? (
                      <ActivityIndicator key={pack.id} />
                    ) : (
                      <Button
                        key={pack.id}
                        label={`${pack.credits} ${pack.credits === 1 ? 'post' : 'posts'} · ${formatPrice(pack.amountCents)}`}
                        logName={`buy_pack_${pack.id}`}
                        disabled={busyPack !== null}
                        onPress={() => void buy(pack)}
                      />
                    )
                  )}
                  <ThemedText type="small" themeColor="textSecondary">
                    Payment is handled by Stripe. Posts work in the app too.
                  </ThemedText>
                  {message && <ThemedText type="small">{message}</ThemedText>}
                </ThemedView>
              ) : (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">Buy posts</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Buying posts in the app is coming soon.
                  </ThemedText>
                </ThemedView>
              )}
            </>
          )}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
