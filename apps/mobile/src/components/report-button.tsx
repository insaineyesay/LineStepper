import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Button } from './button';
import { Chip } from './chip';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { REPORT_REASONS, reportContent, type ReportReason, type ReportTarget } from '@/data/moderation';
import { useTheme } from '@/hooks/use-theme';
import { logTap } from '@/lib/log-tap';

const NOUN: Record<ReportTarget, string> = { event: 'event', crew: 'crew', profile: 'person' };

/**
 * "Report" link that opens a short form in place: pick a reason, add details
 * if you like, send. Reports go to the moderators (the Moderation screen).
 */
export function ReportButton({ targetType, targetId }: { targetType: ReportTarget; targetId: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (sent) {
    return (
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        Thanks. Our team will review this {NOUN[targetType]}.
      </ThemedText>
    );
  }

  if (!open) {
    return (
      <Pressable onPress={() => logTap(`report_${targetType}`, () => setOpen(true))}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.link}>
          Report this {NOUN[targetType]}
        </ThemedText>
      </Pressable>
    );
  }

  const send = async () => {
    if (!reason) {
      setMessage('Pick a reason.');
      return;
    }
    setSending(true);
    setMessage(null);
    const { error } = await reportContent(targetType, targetId, reason, details.trim() || null);
    setSending(false);
    if (error) {
      setMessage("Your report couldn't be sent. Try again in a moment.");
      return;
    }
    setSent(true);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">What&apos;s wrong with this {NOUN[targetType]}?</ThemedText>
      <ThemedView type="backgroundElement" style={styles.chips}>
        {REPORT_REASONS.map((r) => (
          <Chip key={r.value} label={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />
        ))}
      </ThemedView>
      <TextInput
        value={details}
        onChangeText={setDetails}
        placeholder="Anything else we should know? (optional)"
        placeholderTextColor={theme.textSecondary}
        multiline
        maxLength={1000}
        style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
      />
      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
      {sending ? (
        <ActivityIndicator />
      ) : (
        <>
          <Button label="Send report" logName={`report_${targetType}_send`} onPress={send} />
          <Pressable onPress={() => logTap(`report_${targetType}_cancel`, () => setOpen(false))}>
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  link: {
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
  center: {
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
});
