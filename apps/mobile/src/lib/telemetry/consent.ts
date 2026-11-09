import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * The person's choice about usage analytics (taps, screens). Our own switch,
 * not the vendor's, so it carries over if the analytics vendor changes.
 * Opting out stops analytics only; crash and error reports still go out,
 * since they're needed to keep the app working.
 */
const KEY = 'telemetry.analytics_opt_out';

let optedOut = false;
const listeners = new Set<(optedOut: boolean) => void>();

void AsyncStorage.getItem(KEY)
  .then((value) => {
    optedOut = value === '1';
    listeners.forEach((l) => l(optedOut));
  })
  .catch(() => {});

export function isAnalyticsOptedOut(): boolean {
  return optedOut;
}

export async function setAnalyticsOptOut(value: boolean): Promise<void> {
  optedOut = value;
  listeners.forEach((l) => l(value));
  try {
    await AsyncStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // Storage unavailable (private browsing): the choice holds for this session.
  }
}

export function useAnalyticsOptOut(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(optedOut);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return [value, (v) => void setAnalyticsOptOut(v)];
}
