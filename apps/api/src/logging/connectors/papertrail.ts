import type { LogEvent } from '@linestepper/shared';

import type { LogConnector } from '../connector';

/**
 * Papertrail (SolarWinds) over HTTPS: one POST per batch, newline-delimited
 * JSON, token as the basic-auth password. Check the ingestion URL for your
 * account region in Papertrail settings before going live.
 */
export function papertrailConnector(options: {
  token: string;
  url: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): LogConnector {
  const doFetch = options.fetchImpl ?? fetch;
  const auth = `Basic ${Buffer.from(`:${options.token}`).toString('base64')}`;
  let lastError: string | undefined;

  return {
    name: 'papertrail',
    async init() {},
    async send(batch: LogEvent[]) {
      const res = await doFetch(options.url, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/octet-stream' },
        body: batch.map((e) => JSON.stringify(e)).join('\n'),
        signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      }).catch((err: Error) => {
        lastError = err.message;
        throw err;
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        throw new Error(`papertrail responded ${res.status}`);
      }
      lastError = undefined;
    },
    async flush() {},
    health: () => (lastError ? { ok: false, detail: lastError } : { ok: true }),
  };
}
