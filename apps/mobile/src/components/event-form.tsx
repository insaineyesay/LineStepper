import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput } from 'react-native';

import { Button } from './button';
import { Chip } from './chip';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchPostCredits, publishEvent, usePaidPosting } from '@/lib/credits';
import { isZip, lookupZip } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import type { DanceEvent, EventStatus, Metro } from '@/lib/types';

interface EventFormProps {
  userId: string;
  existing?: DanceEvent;
  onSaved: (id: string) => void;
}

function toLocalDateInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function EventForm({ userId, existing, onSaved }: EventFormProps) {
  const theme = useTheme();
  const router = useRouter();
  const paidPosting = usePaidPosting();
  const initial = existing ? toLocalDateInput(existing.starts_at) : { date: '', time: '' };

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [venueName, setVenueName] = useState(existing?.venue_name ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [zip, setZip] = useState(existing?.zip ?? '');
  const [metroId, setMetroId] = useState<number | null>(existing?.metro_id ?? null);
  const [priceText, setPriceText] = useState(existing?.price_text ?? '');
  const [ticketUrl, setTicketUrl] = useState(existing?.ticket_url ?? '');
  const [status, setStatus] = useState<EventStatus>(existing?.status ?? 'draft');
  const [metros, setMetros] = useState<Metro[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Set once the event exists, so saving again (say, after buying a post)
  // updates it instead of creating a second copy.
  const [savedId, setSavedId] = useState<string | null>(existing?.id ?? null);
  const [savedStatus, setSavedStatus] = useState<EventStatus | null>(existing?.status ?? null);
  const [credits, setCredits] = useState<number | null>(null);
  const [needsCredits, setNeedsCredits] = useState(false);

  useEffect(() => {
    if (!paidPosting) return;
    let cancelled = false;
    fetchPostCredits().then((n) => {
      if (!cancelled) setCredits(n);
    });
    return () => {
      cancelled = true;
    };
  }, [paidPosting]);

  // Publishing for the first time spends a post, which only the database's
  // publish_event() can do; everything else is a normal save.
  const willSpendPost = paidPosting && status === 'published' && savedStatus !== 'published';

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('metros')
      .select('*')
      .order('id')
      .then(({ data }) => {
        if (!cancelled && data) {
          setMetros(data);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setMessage(null);
    if (!title.trim()) {
      setMessage('Give the event a title.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) || !/^\d{1,2}:\d{2}$/.test(time.trim())) {
      setMessage('Date must be YYYY-MM-DD and time must be HH:MM (24-hour).');
      return;
    }
    const startsAt = new Date(`${date.trim()}T${time.trim().padStart(5, '0')}`);
    if (isNaN(startsAt.getTime())) {
      setMessage("That date and time couldn't be understood — double-check them.");
      return;
    }

    // The ZIP places the event for "near me" searches. Required for new events;
    // older events without one fall back to their area.
    const cleanZip = zip.trim();
    if (cleanZip || !existing) {
      if (!isZip(cleanZip)) {
        setMessage('Enter the venue’s 5-digit ZIP code so dancers nearby can find it.');
        return;
      }
      if (!(await lookupZip(cleanZip))) {
        setMessage(`We don't recognize ZIP ${cleanZip}. Double-check it.`);
        return;
      }
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      starts_at: startsAt.toISOString(),
      venue_name: venueName.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      zip: cleanZip || null,
      metro_id: metroId,
      price_text: priceText.trim() || null,
      ticket_url: ticketUrl.trim() || null,
      // When this save spends a post, store the details first without
      // publishing, then publish through publishEvent() below.
      status: willSpendPost ? (savedStatus ?? 'draft') : status,
    };

    setSaving(true);
    setNeedsCredits(false);
    let id = savedId;
    if (id) {
      const { error } = await supabase.from('events').update(payload).eq('id', id);
      if (error) {
        setSaving(false);
        setMessage(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from('events')
        .insert({ ...payload, organizer_id: userId })
        .select('id')
        .single();
      if (error || !data) {
        setSaving(false);
        setMessage(error?.message ?? 'Something went wrong saving the event.');
        return;
      }
      id = data.id;
      setSavedId(data.id);
    }
    setSavedStatus(payload.status);

    if (willSpendPost && id) {
      const result = await publishEvent(id);
      if (result === 'no_credits') {
        setSaving(false);
        setNeedsCredits(true);
        setCredits(0);
        setMessage('Your event is saved as a draft. Publishing it uses one post ($0.99).');
        return;
      }
      if (result !== 'published') {
        setSaving(false);
        setMessage(result.error);
        return;
      }
      setSavedStatus('published');
    }
    setSaving(false);
    if (id) onSaved(id);
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.background, color: theme.text },
  ];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small">Event title</ThemedText>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Soul Line Saturday"
        placeholderTextColor={theme.textSecondary}
        style={inputStyle}
      />

      <ThemedText type="small">Description</ThemedText>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What should dancers know?"
        placeholderTextColor={theme.textSecondary}
        multiline
        numberOfLines={4}
        style={[inputStyle, styles.multiline]}
      />

      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedView type="backgroundElement" style={styles.rowItem}>
          <ThemedText type="small">Date</ThemedText>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="2026-09-12"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            style={inputStyle}
          />
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.rowItem}>
          <ThemedText type="small">Start time (24h)</ThemedText>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="19:00"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            style={inputStyle}
          />
        </ThemedView>
      </ThemedView>

      <ThemedText type="small">Venue</ThemedText>
      <TextInput
        value={venueName}
        onChangeText={setVenueName}
        placeholder="The Granby Ballroom"
        placeholderTextColor={theme.textSecondary}
        style={inputStyle}
      />

      <ThemedText type="small">Address</ThemedText>
      <TextInput
        value={address}
        onChangeText={setAddress}
        placeholder="123 Main St"
        placeholderTextColor={theme.textSecondary}
        style={inputStyle}
      />

      <ThemedText type="small">City</ThemedText>
      <TextInput
        value={city}
        onChangeText={setCity}
        placeholder="Norfolk"
        placeholderTextColor={theme.textSecondary}
        style={inputStyle}
      />

      <ThemedText type="small">ZIP code</ThemedText>
      <TextInput
        value={zip}
        onChangeText={(text) => setZip(text.replace(/[^0-9]/g, '').slice(0, 5))}
        placeholder="23510"
        placeholderTextColor={theme.textSecondary}
        keyboardType="number-pad"
        maxLength={5}
        style={inputStyle}
      />

      <ThemedText type="small">Area</ThemedText>
      <ThemedView type="backgroundElement" style={styles.chipRow}>
        {metros.map((metro) => (
          <Chip
            key={metro.id}
            label={metro.name}
            selected={metroId === metro.id}
            onPress={() => setMetroId(metro.id === metroId ? null : metro.id)}
          />
        ))}
      </ThemedView>

      <ThemedText type="small">Price (as text)</ThemedText>
      <TextInput
        value={priceText}
        onChangeText={setPriceText}
        placeholder="$10 at the door, or Free"
        placeholderTextColor={theme.textSecondary}
        style={inputStyle}
      />

      <ThemedText type="small">Ticket link (optional)</ThemedText>
      <TextInput
        value={ticketUrl}
        onChangeText={setTicketUrl}
        placeholder="https://…"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        keyboardType="url"
        style={inputStyle}
      />

      <ThemedText type="small">Visibility</ThemedText>
      <ThemedView type="backgroundElement" style={styles.chipRow}>
        <Chip
          label="Draft (only you)"
          selected={status === 'draft'}
          onPress={() => setStatus('draft')}
        />
        <Chip
          label="Published"
          selected={status === 'published'}
          onPress={() => setStatus('published')}
        />
        {existing && (
          <Chip
            label="Cancelled"
            selected={status === 'cancelled'}
            onPress={() => setStatus('cancelled')}
          />
        )}
      </ThemedView>

      {willSpendPost && credits !== null && !needsCredits && (
        <ThemedText type="small" themeColor="textSecondary">
          {credits > 0
            ? `Publishing uses 1 of your ${credits} ${credits === 1 ? 'post' : 'posts'}.`
            : 'Publishing uses one post ($0.99). You have none left.'}
        </ThemedText>
      )}
      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
      {saving ? (
        <ActivityIndicator />
      ) : (
        <>
          <Button
            label={
              willSpendPost
                ? 'Publish event'
                : savedId
                  ? 'Save changes'
                  : status === 'published'
                    ? 'Post event'
                    : 'Save draft'
            }
            onPress={save}
          />
          {willSpendPost && (needsCredits || credits === 0) && (
            <Button label="Buy posts" logName="buy_posts_from_form" onPress={() => router.push('/credits')} />
          )}
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
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rowItem: {
    flex: 1,
    gap: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
