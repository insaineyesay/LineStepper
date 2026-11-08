import * as Sentry from '@sentry/node';

import { LEVEL_RANK, type LogEvent, type LogLevel } from '@linestepper/shared';

import type { LogConnector } from '../connector';

/**
 * Sends warnings and errors to Sentry, tagged so a client crash and the API
 * request behind it line up (same requestId / userId). Lower levels stay in
 * stdout and Papertrail.
 */
export function sentryConnector(options: { dsn: string; env: string; release: string; minLevel?: LogLevel }): LogConnector {
  const min = LEVEL_RANK[options.minLevel ?? 'warn'];
  let ready = false;

  return {
    name: 'sentry',
    async init() {
      Sentry.init({ dsn: options.dsn, environment: options.env, release: options.release });
      ready = true;
    },
    async send(batch: LogEvent[]) {
      for (const e of batch) {
        if (LEVEL_RANK[e.level] < min) continue;
        Sentry.withScope((scope) => {
          scope.setLevel(e.level === 'warn' ? 'warning' : e.level);
          scope.setTags({ event: e.event, source: e.source, platform: e.platform ?? 'server' });
          if (e.requestId) scope.setTag('request_id', e.requestId);
          if (e.userId) scope.setUser({ id: e.userId });
          if (e.data) scope.setContext('data', e.data);
          if (e.error) {
            const err = new Error(e.error.message);
            err.name = e.error.name;
            if (e.error.stack) err.stack = e.error.stack;
            Sentry.captureException(err);
          } else {
            Sentry.captureMessage(e.msg ?? e.event);
          }
        });
      }
    },
    async flush() {
      await Sentry.flush(2000);
    },
    health: () => (ready ? { ok: true } : { ok: false, detail: 'not initialised' }),
  };
}
