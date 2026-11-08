import type { LogEvent } from '@linestepper/shared';

export interface ConnectorHealth {
  ok: boolean;
  detail?: string;
}

/**
 * The contract every log vendor implements (PRD B5). Adding a vendor means
 * writing one of these plus config — nothing outside src/logging changes.
 */
export interface LogConnector {
  /** Matches the `log.connector.<name>` flag, e.g. 'papertrail'. */
  readonly name: string;
  /** Write each event as it arrives instead of in batches (stdout). */
  readonly immediate?: boolean;
  /** No flag; can't be switched off (stdout is the Heroku baseline). */
  readonly alwaysOn?: boolean;
  init(): Promise<void>;
  send(batch: LogEvent[]): Promise<void>;
  flush(): Promise<void>;
  health(): ConnectorHealth;
}
