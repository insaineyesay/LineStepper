import { scrub, type LogEvent } from '@linestepper/shared';

import type { LogConnector } from './connector';

export interface LogBusOptions {
  connectors: LogConnector[];
  /** Asked on every flush, so flipping a log.connector.* flag takes effect live. */
  isConnectorEnabled: (name: string) => boolean;
  enrich: { env: string; appVersion: string };
  maxBatch?: number;
  flushIntervalMs?: number;
  retries?: number;
  retryDelayMs?: number;
  /** Batches allowed in flight per connector before new ones are dropped. */
  maxPendingPerConnector?: number;
}

export interface ConnectorStats {
  name: string;
  enabled: boolean;
  healthy: boolean;
  detail?: string;
  sent: number;
  dropped: number;
  pending: number;
}

/**
 * Server-side log pipeline (PRD B5): scrub → enrich → batch → broadcast to
 * every enabled connector. Each connector has its own queue, so a slow or
 * failing vendor retries, then drops and counts the batch, without blocking
 * the request path or the other connectors.
 */
export class LogBus {
  private buffer: LogEvent[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly stats = new Map<string, { sent: number; dropped: number; pending: number; chain: Promise<void> }>();
  private readonly o: Required<LogBusOptions>;

  constructor(options: LogBusOptions) {
    this.o = {
      maxBatch: 50,
      flushIntervalMs: 1000,
      retries: 2,
      retryDelayMs: 250,
      maxPendingPerConnector: 20,
      ...options,
    };
    for (const c of this.o.connectors) this.stats.set(c.name, { sent: 0, dropped: 0, pending: 0, chain: Promise.resolve() });
  }

  async start(): Promise<void> {
    await Promise.all(
      this.o.connectors.map(async (c) => {
        try {
          await c.init();
        } catch (err) {
          this.reportToBaseline(`connector ${c.name} failed to init: ${(err as Error).message}`);
        }
      }),
    );
    this.timer = setInterval(() => void this.flush(), this.o.flushIntervalMs);
    this.timer.unref?.();
  }

  write(event: LogEvent): void {
    const line = scrub({ ...event, env: event.env ?? this.o.enrich.env, appVersion: event.appVersion ?? this.o.enrich.appVersion });
    for (const c of this.o.connectors) {
      if (c.immediate && this.enabled(c)) this.dispatch(c, [line]);
    }
    this.buffer.push(line);
    if (this.buffer.length >= this.o.maxBatch) void this.flush();
  }

  /** Send everything buffered; resolves once every connector has finished (or given up). */
  async flush(): Promise<void> {
    const batch = this.buffer;
    this.buffer = [];
    if (batch.length) {
      for (const c of this.o.connectors) {
        if (!c.immediate && this.enabled(c)) this.dispatch(c, batch);
      }
    }
    await Promise.all([...this.stats.values()].map((s) => s.chain));
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
    await Promise.allSettled(this.o.connectors.map((c) => c.flush()));
  }

  health(): ConnectorStats[] {
    return this.o.connectors.map((c) => {
      const s = this.stats.get(c.name)!;
      const h = safeHealth(c);
      return { name: c.name, enabled: this.enabled(c), healthy: h.ok, detail: h.detail, sent: s.sent, dropped: s.dropped, pending: s.pending };
    });
  }

  private enabled(c: LogConnector): boolean {
    if (c.alwaysOn) return true;
    try {
      return this.o.isConnectorEnabled(c.name);
    } catch {
      return false;
    }
  }

  private dispatch(c: LogConnector, batch: LogEvent[]): void {
    const s = this.stats.get(c.name)!;
    if (s.pending >= this.o.maxPendingPerConnector) {
      s.dropped += batch.length;
      return;
    }
    s.pending++;
    s.chain = s.chain.then(async () => {
      try {
        await this.sendWithRetry(c, batch);
        s.sent += batch.length;
      } catch (err) {
        s.dropped += batch.length;
        if (!c.alwaysOn) {
          this.reportToBaseline(`dropped ${batch.length} log events for ${c.name}: ${(err as Error).message}`);
        }
      } finally {
        s.pending--;
      }
    });
  }

  private async sendWithRetry(c: LogConnector, batch: LogEvent[]): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.o.retries; attempt++) {
      try {
        await c.send(batch);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < this.o.retries) await sleep(this.o.retryDelayMs * 2 ** attempt);
      }
    }
    throw lastErr;
  }

  /** Bus problems go straight to the always-on connectors, never back through the bus (no loops). */
  private reportToBaseline(msg: string): void {
    const line: LogEvent = {
      ts: new Date().toISOString(),
      level: 'warn',
      event: 'logs.dropped',
      source: 'api',
      msg,
      env: this.o.enrich.env,
      appVersion: this.o.enrich.appVersion,
    };
    for (const c of this.o.connectors) if (c.alwaysOn) void c.send([line]).catch(() => {});
  }
}

function safeHealth(c: LogConnector) {
  try {
    return c.health();
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
