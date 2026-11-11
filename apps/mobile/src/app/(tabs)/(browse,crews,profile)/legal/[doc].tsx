import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { LEGAL_DETAILS, LEGAL_DOCUMENTS, type LegalBlock, type LegalDocumentKey } from '@/content/legal';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';

/**
 * /legal/terms and /legal/privacy. Public: no sign-in needed, so the web
 * address doubles as the privacy policy URL the app stores ask for.
 */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const tabBarPadding = useTabBarPadding();
  const document = LEGAL_DOCUMENTS[(doc ?? '') as LegalDocumentKey];

  if (!document) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.missing}>Page not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: document.title }} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <ThemedView style={styles.content}>
          {LEGAL_DETAILS.draft && (
            <ThemedView type="backgroundElement" style={styles.notice}>
              <ThemedText type="small" themeColor="textSecondary">
                Draft: this page is being finalized. Details in brackets will be filled in before launch.
              </ThemedText>
            </ThemedView>
          )}
          <ThemedText type="subtitle">{document.title}</ThemedText>
          <ThemedText type="small">{document.intro}</ThemedText>
          {document.sections.map((section) => (
            <ThemedView key={section.heading} style={styles.section}>
              <ThemedText type="smallBold" accessibilityRole="header">
                {section.heading}
              </ThemedText>
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </ThemedView>
          ))}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <ThemedText type="small">{block}</ThemedText>;
  return (
    <ThemedView style={styles.list}>
      {block.bullets.map((item, i) => (
        <ThemedView key={i} style={styles.bullet}>
          <ThemedText type="small">•</ThemedText>
          <ThemedText type="small" style={styles.bulletText}>
            {typeof item === 'string' ? (
              item
            ) : (
              <>
                <ThemedText type="smallBold">{item.label}</ThemedText> {item.text}
              </>
            )}
          </ThemedText>
        </ThemedView>
      ))}
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
  notice: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.one,
  },
  bullet: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bulletText: {
    flex: 1,
  },
  missing: {
    padding: Spacing.four,
  },
});
