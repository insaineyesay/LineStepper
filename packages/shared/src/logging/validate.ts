import { LOG_LEVELS, type LogEvent, type LogLevel, type LogSource } from './types';

export const MAX_CLIENT_BATCH = 100;
const CLIENT_SOURCES: LogSource[] = ['mobile', 'web'];
const EVENT_NAME = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

export type BatchResult = { ok: true; events: LogEvent[]; rejected: number } | { ok: false; error: string };

/**
 * Validates a batch posted by a client to POST /logs. Bad lines are dropped
 * and counted rather than failing the whole batch. Identity fields
 * (userId, requestId) are NOT trusted from the client — the server sets them.
 */
export function validateClientBatch(body: unknown): BatchResult {
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) return { ok: false, error: 'body.events must be an array' };
  if (events.length > MAX_CLIENT_BATCH) return { ok: false, error: `max ${MAX_CLIENT_BATCH} events per batch` };

  const out: LogEvent[] = [];
  let rejected = 0;
  for (const raw of events) {
    const e = raw as Partial<LogEvent>;
    const valid =
      e &&
      typeof e === 'object' &&
      typeof e.event === 'string' &&
      EVENT_NAME.test(e.event) &&
      e.event.length <= 80 &&
      LOG_LEVELS.includes(e.level as LogLevel) &&
      CLIENT_SOURCES.includes(e.source as LogSource) &&
      typeof e.ts === 'string' &&
      !Number.isNaN(Date.parse(e.ts));
    if (!valid) {
      rejected++;
      continue;
    }
    out.push({
      ts: e.ts!,
      level: e.level!,
      event: e.event!,
      source: e.source!,
      msg: typeof e.msg === 'string' ? e.msg : undefined,
      sessionId: typeof e.sessionId === 'string' ? e.sessionId : undefined,
      appVersion: typeof e.appVersion === 'string' ? e.appVersion : undefined,
      platform: typeof e.platform === 'string' ? e.platform : undefined,
      env: typeof e.env === 'string' ? e.env : undefined,
      durationMs: typeof e.durationMs === 'number' ? e.durationMs : undefined,
      data: e.data && typeof e.data === 'object' && !Array.isArray(e.data) ? e.data : undefined,
      error: e.error && typeof e.error === 'object' ? e.error : undefined,
    });
  }
  return { ok: true, events: out, rejected };
}
