import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { APP_PRICE, POST_PRICE } from '@/content/faq';
import { usePaidPosting } from '@/lib/credits';
import { logTap } from '@/lib/log-tap';

const DISMISSED_KEY = 'home.pricing_card_dismissed';

/**
 * Short "how it works / what it costs" note on the Events screen, with a link
 * to the FAQ. "Got it" hides it on this device; the FAQ stays linked from Profile.
 */
export function PricingCard() {
  const router = useRouter();
  const paidPosting = usePaidPosting();
  // Hidden until we know it wasn't dismissed, so it doesn't flash.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setVisible(v !== '1'))
      .catch(() => setVisible(true));
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    void AsyncStorage.setItem(DISMISSED_KEY, '1').catch(() => {});
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">How LineUp2Step works</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Your {APP_PRICE} app purchase lets you create a profile, find events near you and connect with other
        steppers. Want to post an event, class or social for others to see and join? Each post is {POST_PRICE}.
        {paidPosting ? '' : ' Posting is free while we test.'}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => logTap('open_faq_from_home', () => router.push('/faq'))} hitSlop={Spacing.two}>
          <ThemedText type="smallBold" style={styles.link}>
            Read the FAQ
          </ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => logTap('dismiss_pricing_card', dismiss)} hitSlop={Spacing.two}>
          <ThemedText type="small" themeColor="textSecondary">
            Got it
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.one,
  },
  link: {
    textDecorationLine: 'underline',
  },
});
