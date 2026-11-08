import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { createLogger, LEVEL_RANK, type LogEvent, type LogTransport } from '@linestepper/shared';

import { randomId } from './ids';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || undefined;

let getAccessToken: () => Promise<string | undefined> = async () => undefined;
/** Called by the auth layer so log uploads carry the user's token (server sets userId from it). */
export function configureLogAuth(getter: () => Promise<string | undefined>) {
  getAccessToken = getter;
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
        const token = await getAccessToken();
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

const transports: LogTransport[] = [];
if (__DEV__) transports.push(consoleTransport);
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
