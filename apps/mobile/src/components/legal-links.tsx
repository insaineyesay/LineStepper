import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { DISCLAIMERS, type LegalDocumentKey } from '@/content/legal';
import { logTap } from '@/lib/log-tap';

function useOpen() {
  const router = useRouter();
  return (doc: LegalDocumentKey) =>
    logTap(`open_legal_${doc}`, () => router.push({ pathname: '/legal/[doc]', params: { doc } }));
}

/** "Terms of Service · Privacy Policy" under the version on Profile. */
export function LegalLinks() {
  const open = useOpen();
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.underline} onPress={() => open('terms')}>
        Terms of Service
      </ThemedText>
      {'  ·  '}
      <ThemedText type="small" themeColor="textSecondary" style={styles.underline} onPress={() => open('privacy')}>
        Privacy Policy
      </ThemedText>
    </ThemedText>
  );
}

/** The agreement line on the sign-in card, with the two documents linked. */
export function SignInConsent() {
  const open = useOpen();
  const [before, rest] = DISCLAIMERS.signIn.split('Terms of Service');
  const [middle, after] = (rest ?? '').split('Privacy Policy');
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {before}
      <ThemedText type="small" themeColor="textSecondary" style={styles.underline} onPress={() => open('terms')}>
        Terms of Service
      </ThemedText>
      {middle}
      <ThemedText type="small" themeColor="textSecondary" style={styles.underline} onPress={() => open('privacy')}>
        Privacy Policy
      </ThemedText>
      {after}
    </ThemedText>
  );
}

/** A disclaimer at the foot of an event or crew page. */
export function Disclaimer({ kind }: { kind: 'event' | 'crew' }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
      {DISCLAIMERS[kind]}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  disclaimer: {
    fontSize: 13,
    opacity: 0.8,
    paddingTop: Spacing.two,
  },
});
