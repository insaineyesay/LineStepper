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
  screenView: 'screen.view',
  uiTap: 'ui.tap',
  apiRequest: 'api.request',
  authSignIn: 'auth.sign_in',
  authSignOut: 'auth.sign_out',
  authError: 'auth.error',
  flagsLoaded: 'flags.loaded',
  flagChanged: 'flags.changed',
  flagDenied: 'flags.denied',
  logsDropped: 'logs.dropped',
  unhandledError: 'error.unhandled',
} as const;
