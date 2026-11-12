import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { listOpenReports, resolveReport, type OpenReport, type Resolution } from '@/data/moderation';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { logTap } from '@/lib/log-tap';

const REASON_LABEL: Record<OpenReport['reason'], string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate',
  fake: 'Fake or misleading',
  other: 'Something else',
};

const KIND: Record<OpenReport['targetType'], string> = { event: 'Event', crew: 'Crew', profile: 'Person' };

/**
 * Open reports, oldest first, for admins (profiles.is_admin). The API refuses
 * everyone else, so this screen only works for them. Each action closes every
 * open report on the same thing and is logged with who did it.
 */
export default function ModerationScreen() {
  const router = useRouter();
  const tabBarPadding = useTabBarPadding();
  const [reports, setReports] = useState<OpenReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Ban is permanent enough to ask twice.
  const [confirmBan, setConfirmBan] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await listOpenReports();
    if (err) {
      setError(err.code === 'forbidden' ? 'Only admins can see reports.' : "Reports couldn't be loaded.");
      setReports([]);
      return;
    }
    setError(null);
    setReports(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const act = async (report: OpenReport, action: Resolution) => {
    setBusy(report.id);
    const { error: err } = await resolveReport(report.id, action);
    setBusy(null);
    setConfirmBan(null);
    if (err) {
      setError(`That didn't work (${err.code ?? 'error'}). Try again.`);
      return;
    }
    // Closing one closes every open report on the same thing.
    setReports((list) => (list ?? []).filter((r) => !(r.targetType === report.targetType && r.targetId === report.targetId)));
  };

  const open = (r: OpenReport) => {
    if (r.targetType === 'event') router.push({ pathname: '/event/[id]', params: { id: r.targetId } });
    else if (r.targetType === 'crew') router.push({ pathname: '/crew/[id]', params: { id: r.targetId } });
    else router.push({ pathname: '/member/[id]', params: { id: r.targetId } });
  };

  // One card per reported thing: the first report, with the count.
  const seen = new Set<string>();
  const cards = (reports ?? []).filter((r) => {
    const key = `${r.targetType}:${r.targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <ThemedView style={styles.content}>
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
          {reports === null ? (
            <ActivityIndicator />
          ) : cards.length === 0 && !error ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">No open reports</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                New reports show up here, oldest first.
              </ThemedText>
            </ThemedView>
          ) : (
            cards.map((r) => (
              <ThemedView key={r.id} type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  {KIND[r.targetType]} · {REASON_LABEL[r.reason]}
                  {r.openOnTarget > 1 ? ` · ${r.openOnTarget} reports` : ''}
                </ThemedText>
                <Pressable accessibilityRole="button" onPress={() => logTap('moderation_open_target', () => open(r))}>
                  <ThemedText type="smallBold">{r.targetLabel ?? '(no longer exists)'}</ThemedText>
                </Pressable>
                {r.details && <ThemedText type="small">“{r.details}”</ThemedText>}
                <ThemedText type="small" themeColor="textSecondary">
                  Reported by {r.reporter?.displayName ?? (r.reporter?.handle ? `@${r.reporter.handle}` : 'a deleted account')} on{' '}
                  {new Date(r.createdAt).toLocaleDateString()}
                </ThemedText>
                {busy === r.id ? (
                  <ActivityIndicator />
                ) : confirmBan === r.id ? (
                  <>
                    <ThemedText type="small">
                      Ban the {r.targetType === 'profile' ? 'person' : r.targetType === 'event' ? 'organizer' : 'crew owner'}?
                      Everything they posted is hidden, they can&apos;t sign in, and their email can&apos;t sign up again.
                    </ThemedText>
                    <Button label="Yes, ban" logName="moderation_ban_confirm" onPress={() => void act(r, 'ban')} />
                    <Button label="Cancel" logName="moderation_ban_cancel" onPress={() => setConfirmBan(null)} />
                  </>
                ) : (
                  <ThemedView type="backgroundElement" style={styles.actions}>
                    <Button label="Dismiss" logName="moderation_dismiss" onPress={() => void act(r, 'dismiss')} />
                    {r.targetType !== 'profile' && (
                      <Button
                        label={`Remove ${r.targetType}`}
                        logName={`moderation_remove_${r.targetType}`}
                        onPress={() => void act(r, 'remove')}
                      />
                    )}
                    <Button label="Ban…" logName="moderation_ban" onPress={() => setConfirmBan(r.id)} />
                  </ThemedView>
                )}
              </ThemedView>
            ))
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
  actions: {
    gap: Spacing.two,
  },
});
