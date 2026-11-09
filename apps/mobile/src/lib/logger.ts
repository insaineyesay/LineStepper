import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { createLogger, LEVEL_RANK, LogEvents, type LogEvent, type LogTransport } from '@linestepper/shared';

import { randomId } from './ids';
import { createPostHogTransport } from './telemetry/posthog-transport';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || undefined;

// Kept on an object, not a module-level `let`: when EXPO_PUBLIC_API_URL is
// unset, the production minifier drops httpBatchTransport and with it the
// `let` declaration, but keeps the assignment in configureLogAuth, which then
// throws "getAccessToken is not defined" and blanks the whole app.
const logAuth: { getAccessToken: () => Promise<string | undefined> } = {
  getAccessToken: async () => undefined,
};
/** Called by the auth layer so log uploads carry the user's token (server sets userId from it). */
export function configureLogAuth(getter: () => Promise<string | undefined>) {
  logAuth.getAccessToken = getter;
}

/**
 * What leaves the device. Every warning and error, plus a few events worth
 * keeping. Taps and screen views stay local: they'd be most of the volume,
 * and Heroku keeps only its most recent log lines, so they'd push the
 * errors out. Add an event here to start collecting it.
 */
const UPLOADED_INFO_EVENTS = new Set<string>([
  LogEvents.appStart,
  LogEvents.authSignIn,
  LogEvents.authSignOut,
  LogEvents.eventPublished,
  LogEvents.checkoutStarted,
  LogEvents.pushRegistered,
  LogEvents.pushOpened,
]);

export function shouldUpload(event: LogEvent): boolean {
  return LEVEL_RANK[event.level] >= LEVEL_RANK.warn || UPLOADED_INFO_EVENTS.has(event.event);
}

/**
 * Batches events and posts them to the API's POST /logs (PRD B5). Flushes
 * every few seconds, when the batch fills, and when the app goes to the
 * background. If the API is unreachable the queue is kept (capped) and retried.
 */
function httpBatchTransport(url: string, { maxBatch = 20, intervalMs = 5000, maxQueue = 500 } = {}): LogTransport {
  let queue: LogEvent[] = [];
  let sending: Promise<void> | undefined;

  const send = async () => {
    if (sending || queue.length === 0) return sending;
    const batch = queue.slice(0, 100);
    sending = (async () => {
      try {
        const token = await logAuth.getAccessToken();
        const res = await fetch(`${url}/logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': randomId(),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ events: batch }),
        });
        // 4xx means the batch itself is bad; drop it rather than retry forever.
        if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) queue = queue.slice(batch.length);
      } catch {
        // offline — keep the queue, try again next tick
      } finally {
        sending = undefined;
      }
    })();
    return sending;
  };

  setInterval(() => void send(), intervalMs);
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') void send();
  });

  return {
    name: 'http',
    write(event) {
      if (!shouldUpload(event)) return;
      queue.push(event);
      if (queue.length > maxQueue) queue = queue.slice(queue.length - maxQueue);
      if (queue.length >= maxBatch) void send();
    },
    flush: async () => {
      await send();
    },
  };
}

const consoleTransport: LogTransport = {
  name: 'console',
  write(e) {
    if (LEVEL_RANK[e.level] < LEVEL_RANK.info) return;
    const fn = e.level === 'error' || e.level === 'fatal' ? console.error : e.level === 'warn' ? console.warn : console.log;
    fn(`[${e.level}] ${e.event}`, e.data ?? '', e.error?.message ?? '');
  },
};

// Where events go. Each one is optional and switched on by configuration:
// - console in development;
// - PostHog (analytics and error tracking), mapped by the shared catalog
//   (packages/shared/src/telemetry);
// - our API, which writes warnings, errors and key events to the server log.
const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || undefined;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const transports: LogTransport[] = [];
if (__DEV__) transports.push(consoleTransport);
if (POSTHOG_KEY) transports.push(createPostHogTransport(POSTHOG_KEY, POSTHOG_HOST));
if (API_URL) transports.push(httpBatchTransport(API_URL));

/**
 * The app's only logger. Screens and components call this; they never talk
 * to a vendor SDK directly.
 */
export const logger = createLogger({
  source: Platform.OS === 'web' ? 'web' : 'mobile',
  transports,
  context: {
    sessionId: randomId(),
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? 'dev',
    env: __DEV__ ? 'development' : 'production',
  },
});
