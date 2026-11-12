export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

export type LogSource = 'mobile' | 'web' | 'api';

/**
 * One log line, identical in shape on every platform (PRD B5: "same event
 * names, levels and fields everywhere"). Never put email, phone or payment
 * data here — `scrub()` removes it anyway, but don't rely on that.
 */
export interface LogEvent {
  ts: string;
  level: LogLevel;
  /** Dotted event name, e.g. `screen.view`, `ui.tap`, `api.request`. See LogEvents. */
  event: string;
  msg?: string;
  source: LogSource;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  appVersion?: string;
  env?: string;
  platform?: string;
  durationMs?: number;
  data?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  appVersion?: string;
  env?: string;
  platform?: string;
}

/** Shared event names, so dashboards can count the same thing on every platform. */
export const LogEvents = {
  appStart: 'app.start',
  appBackground: 'app.background',
  appShutdown: 'app.shutdown',
  screenView: 'screen.view',
  uiTap: 'ui.tap',
  apiRequest: 'api.request',
  authSignIn: 'auth.sign_in',
  accountDeleted: 'account.deleted',
  accountDeleteFailed: 'account.delete_failed',
  reportCreated: 'report.created',
  userBlocked: 'user.blocked',
  userUnblocked: 'user.unblocked',
  moderationAction: 'moderation.action',
  imageAttached: 'image.attached',
  imageRemoved: 'image.removed',
  authSignOut: 'auth.sign_out',
  authError: 'auth.error',
  flagsLoaded: 'flags.loaded',
  flagsLoadFailed: 'flags.load_failed',
  flagChanged: 'flags.changed',
  flagDenied: 'flags.denied',
  logsDropped: 'logs.dropped',
  pushRegistered: 'push.registered',
  pushRegisterFailed: 'push.register_failed',
  pushOpened: 'push.opened',
  creditsLoadFailed: 'credits.load_failed',
  checkoutStarted: 'checkout.started',
  checkoutFailed: 'checkout.failed',
  eventPublished: 'event.published',
  locationFailed: 'location.failed',
  unhandledError: 'error.unhandled',
} as const;
