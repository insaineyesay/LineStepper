import { LEVEL_RANK, type LogEvent } from '../logging/types';

/**
 * The telemetry event catalog: the one list of everything the platform
 * records, shared by the phone app, the web app and the API.
 *
 * Every event has a kind, which decides where it goes:
 * - `analytics`: what people do (taps, screens, purchases). Product questions.
 * - `log`: what the system did (requests, retries, config). Operations.
 * - `error`: something broke. Any event at level `error` or `fatal` is an
 *   error, whatever its listed kind.
 *
 * Adapters (PostHog today) receive the kind and route on it, so swapping a
 * vendor never touches the call sites. A test fails if code uses an event
 * name that isn't listed here.
 */
export type TelemetryKind = 'analytics' | 'log' | 'error';

export interface TelemetryEventDefinition {
  kind: TelemetryKind;
  description: string;
}

export const TELEMETRY_CATALOG = {
  // App lifecycle and navigation
  'app.start': { kind: 'analytics', description: 'The app opened' },
  'app.background': { kind: 'analytics', description: 'The app went to the background' },
  'screen.view': { kind: 'analytics', description: 'A screen was shown (data.screen)' },
  'ui.tap': { kind: 'analytics', description: 'A button or chip was tapped (data.name)' },

  // Accounts
  'auth.sign_in': { kind: 'analytics', description: 'Someone signed in' },
  'auth.sign_out': { kind: 'analytics', description: 'Someone signed out' },
  'auth.error': { kind: 'log', description: 'Sign-in failed' },
  'account.deleted': { kind: 'analytics', description: 'Someone deleted their account' },
  'account.delete_failed': { kind: 'error', description: 'Deleting an account failed' },

  // Safety
  'report.created': { kind: 'analytics', description: 'Someone reported an event, crew or profile (alert on this)' },
  'user.blocked': { kind: 'analytics', description: 'Someone blocked another person' },
  'user.unblocked': { kind: 'analytics', description: 'Someone unblocked another person' },
  'moderation.action': { kind: 'log', description: 'An admin dismissed a report, removed content or banned someone' },

  // Events and posting
  'event.published': { kind: 'analytics', description: 'An event was published (one post spent)' },
  'credits.load_failed': { kind: 'log', description: 'The post balance could not be loaded' },
  'checkout.started': { kind: 'analytics', description: 'Someone opened checkout for a post pack' },
  'checkout.failed': { kind: 'log', description: 'Checkout could not be started' },

  // Push and location
  'push.registered': { kind: 'analytics', description: 'A device registered for reminders' },
  'push.register_failed': { kind: 'log', description: 'Push registration failed' },
  'push.opened': { kind: 'analytics', description: 'A reminder was tapped' },
  'location.failed': { kind: 'log', description: 'The device location could not be read' },

  // Platform
  'api.request': { kind: 'log', description: 'The API handled a request' },
  'app.shutdown': { kind: 'log', description: 'The API is shutting down (deploy or restart)' },
  'flags.loaded': { kind: 'log', description: 'Feature flags were loaded' },
  'flags.load_failed': { kind: 'log', description: 'Feature flags could not be loaded; defaults used' },
  'flags.changed': { kind: 'log', description: 'An admin changed a feature flag' },
  'flags.denied': { kind: 'log', description: 'A request hit a feature that is switched off' },
  'logs.dropped': { kind: 'log', description: 'Telemetry was dropped (invalid, or a vendor failing)' },
  'error.unhandled': { kind: 'error', description: 'A crash or error nothing else caught' },
} as const satisfies Record<string, TelemetryEventDefinition>;

export type TelemetryEventName = keyof typeof TELEMETRY_CATALOG;

export function isCatalogEvent(name: string): name is TelemetryEventName {
  return Object.prototype.hasOwnProperty.call(TELEMETRY_CATALOG, name);
}

/** Where an event belongs. Errors win; unknown names are treated as logs. */
export function kindOf(event: Pick<LogEvent, 'event' | 'level'>): TelemetryKind {
  if (LEVEL_RANK[event.level] >= LEVEL_RANK.error) return 'error';
  return isCatalogEvent(event.event) ? TELEMETRY_CATALOG[event.event].kind : 'log';
}
