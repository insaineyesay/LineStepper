import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import { defaultFlags, LogEvents, type FlagKey, type FlagValues } from '@linestepper/shared';

import { apiFetch } from './api';
import { useSession } from './auth-context';
import { API_URL, logger } from './logger';

const FlagsContext = createContext<FlagValues>(defaultFlags());

/**
 * Loads effective flags from GET /flags on start, sign-in/out and when the
 * app returns to the foreground. Falls back to registry defaults. This only
 * hides UI — the API enforces every flag itself.
 */
async function fetchFlags(): Promise<FlagValues | null> {
  if (!API_URL) return null;
  try {
    const res = await apiFetch('/flags');
    if (!res.ok) throw new Error(`GET /flags ${res.status}`);
    const body = (await res.json()) as { flags: FlagValues };
    logger.debug(LogEvents.flagsLoaded);
    return { ...defaultFlags(), ...body.flags };
  } catch (err) {
    logger.warn(LogEvents.flagsLoadFailed, { message: (err as Error).message });
    return null;
  }
}

/**
 * Loads effective flags from GET /flags on start, sign-in/out and when the
 * app returns to the foreground. Falls back to registry defaults. This only
 * hides UI — the API enforces every flag itself.
 */
export function FlagsProvider({ children }: PropsWithChildren) {
  const [flags, setFlags] = useState<FlagValues>(defaultFlags);
  const { session } = useSession();
  const userId = session?.user.id;

  useEffect(() => {
    let active = true;
    const apply = (next: FlagValues | null) => {
      if (active && next) setFlags(next);
    };
    fetchFlags().then(apply);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') fetchFlags().then(apply);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [userId]);

  return <FlagsContext.Provider value={flags}>{children}</FlagsContext.Provider>;
}

export function useFlag(key: FlagKey): boolean {
  return useContext(FlagsContext)[key];
}

export function useFlags(): FlagValues {
  return useContext(FlagsContext);
}
