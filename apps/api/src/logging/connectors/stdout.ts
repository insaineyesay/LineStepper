import pino from 'pino';

import type { LogEvent } from '@linestepper/shared';

import type { LogConnector } from '../connector';

/**
 * Structured JSON to stdout via Pino. Heroku captures stdout, so these lines
 * show in `heroku logs` and in any log drain add-on. Always on.
 */
export function stdoutConnector(options: { destination?: pino.DestinationStream } = {}): LogConnector {
  const out = pino(
    { base: null, timestamp: false, messageKey: 'msg', level: 'debug', formatters: { level: (label) => ({ level: label }) } },
    options.destination ?? pino.destination({ sync: false }),
  );
  return {
    name: 'stdout',
    immediate: true,
    alwaysOn: true,
    async init() {},
    async send(batch: LogEvent[]) {
      for (const { level, ...rest } of batch) out[level](rest);
    },
    async flush() {
      out.flush();
    },
    health: () => ({ ok: true }),
  };
}
