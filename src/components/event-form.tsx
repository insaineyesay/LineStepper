import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput } from 'react-native';

import { Button } from './button';
import { Chip } from './chip';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
  const initial = existing ? toLocalDateInput(existing.starts_at) : { date: '', time: '' };

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [venueName, setVenueName] = useState(existing?.venue_name ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [metroId, setMetroId] = useState<number | null>(existing?.metro_id ?? null);
  const [priceText, setPriceText] = useState(existing?.price_text ?? '');
  const [ticketUrl, setTicketUrl] = useState(existing?.ticket_url ?? '');
  const [status, setStatus] = useState<EventStatus>(existing?.status ?? 'draft');
  const [metros, setMetros] = useState<Metro[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      starts_at: startsAt.toISOString(),
      venue_name: venueName.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      metro_id: metroId,
      price_text: priceText.trim() || null,
      ticket_url: ticketUrl.trim() || null,
      status,
    };

    setSaving(true);
    if (existing) {
      const { error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', existing.id);
      setSaving(false);
      if (error) {
        setMessage(error.message);
      } else {
        onSaved(existing.id);
      }
    } else {
      const { data, error } = await supabase
        .from('events')
        .insert({ ...payload, organizer_id: userId })
        .select('id')
        .single();
      setSaving(false);
      if (error || !data) {
        setMessage(error?.message ?? 'Something went wrong saving the event.');
      } else {
        onSaved(data.id);
      }
    }
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

      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
      {saving ? (
        <ActivityIndicator />
      ) : (
        <Button
          label={existing ? 'Save changes' : status === 'published' ? 'Post event' : 'Save draft'}
          onPress={save}
        />
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
