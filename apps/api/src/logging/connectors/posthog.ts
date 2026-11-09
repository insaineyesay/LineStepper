import { PostHog } from 'posthog-node';

import { toPostHogCall, type LogEvent } from '@linestepper/shared';

import type { LogConnector } from '../connector';

/** The parts of the PostHog client this connector uses (so tests can fake it). */
export interface PostHogClientLike {
  capture(message: { distinctId?: string; event: string; properties?: Record<string, unknown> }): void;
  captureException(error: unknown, distinctId?: string, properties?: Record<string, unknown>): void;
  flush(): Promise<void>;
}

/**
 * Sends the API's own analytics and errors to PostHog, mapped by the shared
 * catalog (packages/shared/src/telemetry). Events the apps upload to /logs
 * are skipped here: the apps already send those to PostHog themselves, so
 * forwarding them would count everything twice. Routine logs stay in stdout.
 */
export function posthogConnector(options: {
  apiKey: string;
  host: string;
  client?: PostHogClientLike;
}): LogConnector {
  let client: PostHogClientLike | undefined = options.client;
  let lastError: string | undefined;

  return {
    name: 'posthog',
    async init() {
      client ??= new PostHog(options.apiKey, { host: options.host, flushAt: 20, flushInterval: 5000 });
    },
    async send(batch: LogEvent[]) {
      if (!client) return;
      try {
        for (const e of batch) {
          if (e.source !== 'api') continue;
          const call = toPostHogCall(e);
          // Server events without a user (startup, cron) group under one id.
          const distinctId = e.userId ?? 'api-server';
          if (call.type === 'exception') client.captureException(call.error, distinctId, call.properties);
          else if (call.type === 'capture') client.capture({ distinctId, event: call.name, properties: call.properties });
        }
        lastError = undefined;
      } catch (err) {
        lastError = (err as Error).message;
        throw err;
      }
    },
    async flush() {
      await client?.flush();
    },
    health: () => (lastError ? { ok: false, detail: lastError } : { ok: true }),
  };
}
