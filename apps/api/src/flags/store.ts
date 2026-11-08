import type { SupabaseClient } from '@supabase/supabase-js';

import type { FlagKey, FlagOverrides } from '@linestepper/shared';

/** Where runtime flag changes live. Swap the implementation without touching FlagService. */
export interface FlagStore {
  readonly id: string;
  load(): Promise<FlagOverrides>;
  set(key: FlagKey, enabled: boolean, actorId: string): Promise<{ previous: boolean | null }>;
}

/** No runtime store: flags come only from registry defaults + the FLAGS env var. */
export class MemoryFlagStore implements FlagStore {
  readonly id = 'memory';
  private values: FlagOverrides = {};
  async load() {
    return { ...this.values };
  }
  async set(key: FlagKey, enabled: boolean) {
    const previous = this.values[key] ?? null;
    this.values[key] = enabled;
    return { previous };
  }
}

/** Runtime overrides in Supabase (feature_flags + flag_audit tables, migration 0003). */
export class SupabaseFlagStore implements FlagStore {
  readonly id = 'supabase';
  constructor(private readonly db: SupabaseClient) {}

  async load(): Promise<FlagOverrides> {
    const { data, error } = await this.db.from('feature_flags').select('key, enabled');
    if (error) throw new Error(`feature_flags load failed: ${error.message}`);
    const out: FlagOverrides = {};
    for (const row of data ?? []) out[row.key as string] = Boolean(row.enabled);
    return out;
  }

  async set(key: FlagKey, enabled: boolean, actorId: string) {
    const { data: existing } = await this.db.from('feature_flags').select('enabled').eq('key', key).maybeSingle();
    const previous = existing ? Boolean(existing.enabled) : null;
    const { error } = await this.db
      .from('feature_flags')
      .upsert({ key, enabled, updated_by: actorId, updated_at: new Date().toISOString() });
    if (error) throw new Error(`feature_flags write failed: ${error.message}`);
    const audit = await this.db.from('flag_audit').insert({ key, previous, enabled, actor_id: actorId });
    if (audit.error) throw new Error(`flag_audit write failed: ${audit.error.message}`);
    return { previous };
  }
}
