import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput } from 'react-native';

import { Button } from './button';
import { Chip } from './chip';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createCrew, updateCrew, type CrewInput } from '@/data/crews';
import { listMetros } from '@/data/reference';
import type { Crew, Metro } from '@/lib/types';

interface CrewFormProps {
  userId: string;
  existing?: Crew;
  onSaved: (id: string) => void;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function CrewForm({ userId, existing, onSaved }: CrewFormProps) {
  const theme = useTheme();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [metroId, setMetroId] = useState<number | null>(existing?.home_metro_id ?? null);
  const [merchUrl, setMerchUrl] = useState(existing?.merch_url ?? '');
  const [isJoinable, setIsJoinable] = useState(existing?.is_joinable ?? true);
  const [metros, setMetros] = useState<Metro[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
    const cleanName = name.trim();
    if (cleanName.length < 3) {
      setMessage('Give the crew a name (at least 3 characters).');
      return;
    }

    const payload: CrewInput = {
      name: cleanName,
      description: description.trim() || null,
      home_metro_id: metroId,
      merch_url: merchUrl.trim() || null,
      is_joinable: isJoinable,
    };

    setSaving(true);
    if (existing) {
      const { error } = await updateCrew(existing.id, payload);
      setSaving(false);
      if (error) {
        setMessage(error.message);
      } else {
        onSaved(existing.id);
      }
    } else {
      const slug = slugify(cleanName);
      if (slug.length < 3) {
        setMessage('That name needs a few more letters or numbers.');
        return;
      }
      const { data, error } = await createCrew(userId, slug, payload);
      setSaving(false);
      if (error) {
        setMessage(
          error.code === '23505'
            ? 'A crew with a very similar name already exists — try another.'
            : error.message
        );
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
      <ThemedText type="small">Crew name</ThemedText>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Richmond Smooth Steppers"
        placeholderTextColor={theme.textSecondary}
        editable={!existing}
        style={inputStyle}
      />
      {existing && (
        <ThemedText type="small" themeColor="textSecondary">
          Crew names can&apos;t be changed yet — contact support if needed.
        </ThemedText>
      )}

      <ThemedText type="small">Description</ThemedText>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Who you are, where and when you dance"
        placeholderTextColor={theme.textSecondary}
        multiline
        numberOfLines={4}
        style={[inputStyle, styles.multiline]}
      />

      <ThemedText type="small">Home area</ThemedText>
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

      <ThemedText type="small">Membership</ThemedText>
      <ThemedView type="backgroundElement" style={styles.chipRow}>
        <Chip
          label="Open to join requests"
          selected={isJoinable}
          onPress={() => setIsJoinable(true)}
        />
        <Chip
          label="Invite only"
          selected={!isJoinable}
          onPress={() => setIsJoinable(false)}
        />
      </ThemedView>

      <ThemedText type="small">Merch store link (optional)</ThemedText>
      <TextInput
        value={merchUrl}
        onChangeText={setMerchUrl}
        placeholder="https://your-store.example.com"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        keyboardType="url"
        style={inputStyle}
      />

      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
      {saving ? (
        <ActivityIndicator />
      ) : (
        <Button label={existing ? 'Save changes' : 'Create crew'} onPress={save} />
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
