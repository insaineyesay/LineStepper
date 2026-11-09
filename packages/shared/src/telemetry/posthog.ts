import type { LogEvent } from '../logging/types';

import { kindOf } from './catalog';

/**
 * How one telemetry event maps onto PostHog. Shared by the app's adapter and
 * the API's connector, so both send the same shape. Pure: no PostHog import.
 */
export type PostHogCall =
  | { type: 'screen'; name: string; properties: Record<string, unknown> }
  | { type: 'capture'; name: string; properties: Record<string, unknown> }
  | { type: 'exception'; error: Error; properties: Record<string, unknown> }
  | { type: 'skip' };

/** Fields every PostHog event carries, for filtering and for joining sessions to requests. */
function baseProperties(e: LogEvent): Record<string, unknown> {
  const props: Record<string, unknown> = {
    ...e.data,
    level: e.level,
    source: e.source,
    app_version: e.appVersion,
    env: e.env,
    platform: e.platform,
    session_id: e.sessionId,
    request_id: e.requestId,
  };
  for (const key of Object.keys(props)) if (props[key] === undefined) delete props[key];
  return props;
}

function toError(e: LogEvent): Error {
  const err = new Error(e.error?.message ?? e.msg ?? e.event);
  err.name = e.error?.name ?? 'Error';
  if (e.error?.stack) err.stack = e.error.stack;
  return err;
}

/**
 * - analytics → a PostHog event (screen views use PostHog's screen call);
 * - errors → PostHog error tracking;
 * - logs → only warnings are sent (as events); routine logs stay with the
 *   host's log (Heroku), where they're cheaper and searchable by time.
 */
export function toPostHogCall(e: LogEvent): PostHogCall {
  const kind = kindOf(e);
  const properties = baseProperties(e);
  if (kind === 'error') {
    return { type: 'exception', error: toError(e), properties: { ...properties, event: e.event } };
  }
  if (kind === 'analytics') {
    if (e.event === 'screen.view' && typeof e.data?.screen === 'string') {
      return { type: 'screen', name: e.data.screen, properties };
    }
    return { type: 'capture', name: e.event, properties };
  }
  if (e.level === 'warn') return { type: 'capture', name: e.event, properties };
  return { type: 'skip' };
}
