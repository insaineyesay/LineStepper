import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput } from 'react-native';

import { Button } from './button';
import { Chip } from './chip';
import { DraftNotice } from './draft-notice';
import { PhotoField } from './photo-field';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchPostCredits, publishEvent, usePaidPosting } from '@/lib/credits';
import { useFlag } from '@/lib/flags';
import { useFormDraft } from '@/lib/form-draft';
import { isZip, lookupZip } from '@/lib/location';
import { createEvent, updateEvent, type EventInput } from '@/data/events';
import { removeImage, uploadImage } from '@/data/images';
import { IMAGE_SIZES, prepareImage } from '@/lib/image-prep';
import { listMetros } from '@/data/reference';
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
  const changeAlertsFlag = useFlag('events.change_alerts');
  const pushFlag = useFlag('notify.push');
  const changeAlertsOn = changeAlertsFlag && pushFlag;
  // The flyer is uploaded after the event is saved (it needs the event's id).
  const [flyer, setFlyer] = useState<{ kind: 'keep' } | { kind: 'new'; uri: string } | { kind: 'remove' }>({
    kind: 'keep',
  });
  const [savedFlyerUrl, setSavedFlyerUrl] = useState<string | null>(existing?.flyer_url ?? null);
  const flyerPreview = flyer.kind === 'new' ? flyer.uri : flyer.kind === 'remove' ? null : savedFlyerUrl;
  const [needsCredits, setNeedsCredits] = useState(false);

  // Autosave what's typed so leaving the form doesn't lose it.
  const fields = {
    title, description, date, time, venueName, address, city, zip, metroId, priceText, ticketUrl, status,
  };
  const [initialFields] = useState(() => fields);
  const draft = useFormDraft(`event.${existing?.id ?? 'new'}.${userId}`, fields, initialFields, (v) => {
    setTitle(v.title);
    setDescription(v.description);
    setDate(v.date);
    setTime(v.time);
    setVenueName(v.venueName);
    setAddress(v.address);
    setCity(v.city);
    setZip(v.zip);
    setMetroId(v.metroId);
    setPriceText(v.priceText);
    setTicketUrl(v.ticketUrl);
    setStatus(v.status);
  });

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
    listMetros().then(({ data }) => {
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

    const payload: EventInput = {
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
      const { error } = await updateEvent(id, payload);
      if (error) {
        setSaving(false);
        setMessage(error.message);
        return;
      }
    } else {
      const { data, error } = await createEvent(userId, payload);
      if (error) {
        setSaving(false);
        setMessage(error.message);
        return;
      }
      id = data.id;
      setSavedId(data.id);
    }
    // The details are in the database now; the device copy isn't needed.
    draft.clear();
    setSavedStatus(payload.status);

    if (id && flyer.kind !== 'keep') {
      const flyerError = await saveFlyer(id);
      if (flyerError) {
        setSaving(false);
        setMessage(flyerError);
        return;
      }
    }

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

  /** Uploads or removes the flyer; returns an error message, or null. */
  async function saveFlyer(eventId: string): Promise<string | null> {
    try {
      if (flyer.kind === 'new') {
        const [full, thumb] = await Promise.all([
          prepareImage(flyer.uri, IMAGE_SIZES.flyer),
          prepareImage(flyer.uri, IMAGE_SIZES.thumb),
        ]);
        const { data, error } = await uploadImage(
          { target: 'event', eventId },
          { full: full.bytes, thumb: thumb.bytes },
        );
        if (error) throw new Error(error.message);
        setSavedFlyerUrl(data.url);
      } else if (flyer.kind === 'remove') {
        const { error } = await removeImage({ target: 'event', eventId });
        if (error) throw new Error(error.message);
        setSavedFlyerUrl(null);
      }
      setFlyer({ kind: 'keep' });
      return null;
    } catch {
      return "Your event is saved, but the flyer didn't upload. Tap the button below to try again.";
    }
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.background, color: theme.text },
  ];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {draft.restored && <DraftNotice onDiscard={draft.discard} />}
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

      <PhotoField
        label="Flyer (optional)"
        shape="flyer"
        uri={flyerPreview}
        busy={saving && flyer.kind !== 'keep'}
        onPicked={(uri) => setFlyer({ kind: 'new', uri })}
        onRemove={() => setFlyer(savedFlyerUrl ? { kind: 'remove' } : { kind: 'keep' })}
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
      {changeAlertsOn && savedStatus === 'published' && (
        <ThemedText type="small" themeColor="textSecondary">
          People who saved this event get a notification if you change the date, time or
          place, cancel it or move it back to draft.
        </ThemedText>
      )}

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
