import { FLAG_KEYS, FLAG_REGISTRY, isFlagKey, type FlagDefinition, type FlagKey, type FlagValues } from './registry';

export type FlagOverrides = Partial<Record<string, boolean>>;

/** Registry defaults, before any environment or database overrides. */
export function defaultFlags(): FlagValues {
  const values = {} as FlagValues;
  for (const key of FLAG_KEYS) values[key] = FLAG_REGISTRY[key].default;
  return values;
}

/**
 * Layer overrides on top of the defaults (later layers win), then switch off
 * any flag whose `requires` aren't all on — e.g. `tickets.qr` can't be live
 * while `booking` is off. Unknown keys are ignored.
 */
export function resolveFlags(...layers: FlagOverrides[]): FlagValues {
  const values = defaultFlags();
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (isFlagKey(key) && typeof value === 'boolean') values[key] = value;
    }
  }
  // Dependencies can chain (refunds → tickets → booking), so loop to a fixpoint.
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of FLAG_KEYS) {
      const def: FlagDefinition = FLAG_REGISTRY[key];
      if (values[key] && def.requires?.some((dep) => isFlagKey(dep) && !values[dep])) {
        values[key] = false;
        changed = true;
      }
    }
  }
  return values;
}

/**
 * Parse the FLAGS env var: comma-separated `key=on|off` pairs, e.g.
 * `FLAGS="booking=on,notify.sms=off"`. Unknown keys are reported, not thrown,
 * so a typo can't take the server down.
 */
export function parseFlagEnv(raw: string | undefined): { overrides: FlagOverrides; unknown: string[] } {
  const overrides: FlagOverrides = {};
  const unknown: string[] = [];
  if (!raw) return { overrides, unknown };
  for (const pair of raw.split(',')) {
    const [rawKey, rawValue] = pair.split('=').map((s) => s.trim());
    if (!rawKey) continue;
    if (!isFlagKey(rawKey)) {
      unknown.push(rawKey);
      continue;
    }
    overrides[rawKey] = ['on', 'true', '1', 'yes'].includes((rawValue ?? '').toLowerCase());
  }
  return { overrides, unknown };
}

export function isEnabled(values: FlagValues, key: FlagKey): boolean {
  return values[key] === true;
}
