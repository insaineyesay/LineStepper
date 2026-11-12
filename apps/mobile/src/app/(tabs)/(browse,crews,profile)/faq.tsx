import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { FAQ } from '@/content/faq';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { logTap } from '@/lib/log-tap';

/** /faq: questions grouped by topic; tap a question to show its answer. */
export default function FaqScreen() {
  const tabBarPadding = useTabBarPadding();
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (q: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <ThemedView style={styles.content}>
          <ThemedText type="subtitle">Questions and answers</ThemedText>
          {FAQ.map((group) => (
            <ThemedView key={group.title} style={styles.group}>
              <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
                {group.title.toUpperCase()}
              </ThemedText>
              {group.items.map((item) => {
                const isOpen = open.has(item.question);
                return (
                  <ThemedView key={item.question} type="backgroundElement" style={styles.card}>
                    <Pressable
                      onPress={() => logTap('faq_toggle', () => toggle(item.question))}
                      accessibilityRole="button"
                      aria-expanded={isOpen}
                      style={styles.question}>
                      <ThemedText type="smallBold" style={styles.questionText}>
                        {item.question}
                      </ThemedText>
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        {isOpen ? '−' : '+'}
                      </ThemedText>
                    </Pressable>
                    {isOpen && <ThemedText type="small">{item.answer}</ThemedText>}
                  </ThemedView>
                );
              })}
            </ThemedView>
          ))}
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
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  question: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  questionText: {
    flex: 1,
  },
});
