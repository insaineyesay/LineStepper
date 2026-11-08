import { scrub } from './scrub';
import { LEVEL_RANK, type LogContext, type LogEvent, type LogLevel, type LogSource } from './types';

/** Where a client- or server-side logger hands events off. */
export interface LogTransport {
  name: string;
  write(event: LogEvent): void;
  flush?(): Promise<void>;
}

export interface Logger {
  debug(event: string, data?: Record<string, unknown>, msg?: string): void;
  info(event: string, data?: Record<string, unknown>, msg?: string): void;
  warn(event: string, data?: Record<string, unknown>, msg?: string): void;
  error(event: string, err?: unknown, data?: Record<string, unknown>): void;
  /** Same transports, more context (e.g. per request: requestId + userId). */
  child(context: LogContext): Logger;
  /** Replace context in place (e.g. userId after sign-in). */
  setContext(context: LogContext): void;
  flush(): Promise<void>;
}

export interface CreateLoggerOptions {
  source: LogSource;
  transports: LogTransport[];
  context?: LogContext;
  minLevel?: LogLevel;
  now?: () => Date;
}

export function serializeError(err: unknown): LogEvent['error'] {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  if (err === undefined) return undefined;
  return { name: 'NonError', message: typeof err === 'string' ? err : safeJson(err) };
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * The one logger implementation, used by mobile, web and API. App code only
 * talks to this; vendors live behind transports / connectors (PRD B5).
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const { source, transports, minLevel = 'debug', now = () => new Date() } = options;
  let context: LogContext = { ...options.context };

  const emit = (level: LogLevel, event: string, extra: Partial<LogEvent>) => {
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
    const line: LogEvent = scrub({
      ts: now().toISOString(),
      level,
      event,
      source,
      ...stripUndefined(context),
      ...stripUndefined(extra),
    });
    for (const t of transports) {
      try {
        t.write(line);
      } catch {
        // A broken transport must never break the app.
      }
    }
  };

  const logger: Logger = {
    debug: (event, data, msg) => emit('debug', event, { data, msg }),
    info: (event, data, msg) => emit('info', event, { data, msg }),
    warn: (event, data, msg) => emit('warn', event, { data, msg }),
    error: (event, err, data) =>
      emit('error', event, { data, error: serializeError(err), msg: err instanceof Error ? err.message : undefined }),
    child: (extra) => createLogger({ ...options, context: { ...context, ...extra } }),
    setContext: (extra) => {
      context = { ...context, ...extra };
    },
    flush: async () => {
      await Promise.allSettled(transports.map((t) => t.flush?.()));
    },
  };
  return logger;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}
