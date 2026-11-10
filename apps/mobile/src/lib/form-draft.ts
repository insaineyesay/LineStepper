import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Autosaves a form on the device as people type, so leaving it (tapping a
 * tab, the app closing) doesn't throw their work away. One draft per form
 * per person: the key names the form ("event.new", "event.<id>") and the
 * user. It lives only on this device and is deleted once the form saves.
 *
 * When the form opens and a draft exists, the hook hands it to `apply` and
 * reports `restored`, so the form can say so and offer to start over.
 */
const WRITE_DELAY_MS = 300;

interface Stored<T> {
  values: T;
  savedAt: number;
}

export function useFormDraft<T>(
  key: string | null,
  values: T,
  initial: T,
  apply: (values: T) => void
): { restored: boolean; discard: () => void; clear: () => void } {
  const storageKey = key ? `form_draft.${key}` : null;
  const [loaded, setLoaded] = useState(false);
  const [restored, setRestored] = useState(false);
  const json = JSON.stringify(values);
  const [initialJson] = useState(() => JSON.stringify(initial));
  // After a successful save nothing may write the draft back.
  const done = useRef(false);
  const pending = useRef<string | null>(null);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  // Load once.
  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        const stored = JSON.parse(raw) as Stored<T>;
        applyRef.current(stored.values);
        setRestored(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const write = useCallback(
    (valuesJson: string) => {
      if (!storageKey || done.current) return;
      if (valuesJson === initialJson) {
        void AsyncStorage.removeItem(storageKey).catch(() => {});
      } else {
        const stored = `{"values":${valuesJson},"savedAt":${Date.now()}}`;
        void AsyncStorage.setItem(storageKey, stored).catch(() => {});
      }
    },
    [storageKey, initialJson]
  );

  // Write shortly after typing stops. Wait until the load finishes so an
  // empty form never overwrites a draft that's about to be restored.
  useEffect(() => {
    if (!loaded) return;
    pending.current = json;
    const timer = setTimeout(() => {
      pending.current = null;
      write(json);
    }, WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loaded, json, write]);

  // Leaving mid-typing: write what's waiting.
  useEffect(
    () => () => {
      if (pending.current !== null) write(pending.current);
    },
    [write]
  );

  const clear = useCallback(() => {
    done.current = true;
    pending.current = null;
    if (storageKey) void AsyncStorage.removeItem(storageKey).catch(() => {});
  }, [storageKey]);

  const discard = useCallback(() => {
    setRestored(false);
    applyRef.current(JSON.parse(initialJson) as T);
    if (storageKey) void AsyncStorage.removeItem(storageKey).catch(() => {});
  }, [storageKey, initialJson]);

  return { restored, discard, clear };
}
