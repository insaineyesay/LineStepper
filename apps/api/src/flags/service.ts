import {
  LogEvents,
  parseFlagEnv,
  resolveFlags,
  type FlagKey,
  type FlagOverrides,
  type FlagValues,
  type Logger,
} from '@linestepper/shared';

import type { FlagStore } from './store';

/**
 * Resolves flags as: registry defaults → FLAGS env (deploy-time) → store
 * (runtime, set by admins), then enforces `requires`. Cached briefly so the
 * hot path (`isOn`) is synchronous and never hits the database.
 */
export class FlagService {
  private envOverrides: FlagOverrides;
  private storeOverrides: FlagOverrides = {};
  private values: FlagValues;
  private loadedAt = 0;
  private refreshing: Promise<void> | undefined;
  private log: Logger | undefined;

  constructor(
    private readonly store: FlagStore,
    flagsEnv: string | undefined,
    private readonly ttlMs = 30_000,
  ) {
    const { overrides, unknown } = parseFlagEnv(flagsEnv);
    this.envOverrides = overrides;
    this.unknownEnvKeys = unknown;
    this.values = resolveFlags(this.envOverrides);
  }

  readonly unknownEnvKeys: string[];

  /** Logger is attached after construction because logging itself reads flags. */
  attachLogger(log: Logger) {
    this.log = log;
    if (this.unknownEnvKeys.length) log.warn('flags.unknown_env_keys', { keys: this.unknownEnvKeys });
  }

  isOn(key: FlagKey): boolean {
    if (Date.now() - this.loadedAt > this.ttlMs) void this.refresh();
    return this.values[key] === true;
  }

  async all(): Promise<FlagValues> {
    if (Date.now() - this.loadedAt > this.ttlMs) await this.refresh();
    return { ...this.values };
  }

  async refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      try {
        this.storeOverrides = await this.store.load();
        this.values = resolveFlags(this.envOverrides, this.storeOverrides);
      } catch (err) {
        // Keep serving the last known values; a flags outage must not change behaviour.
        this.log?.error('flags.load_failed', err, { store: this.store.id });
      } finally {
        this.loadedAt = Date.now();
        this.refreshing = undefined;
      }
    })();
    return this.refreshing;
  }

  /** Every change is persisted with who made it and logged (PRD B2). */
  async set(key: FlagKey, enabled: boolean, actorId: string, requestLog?: Logger): Promise<FlagValues> {
    const { previous } = await this.store.set(key, enabled, actorId);
    this.loadedAt = 0;
    await this.refresh();
    (requestLog ?? this.log)?.info(LogEvents.flagChanged, { key, previous, enabled, effective: this.values[key], actorId });
    return { ...this.values };
  }
}
