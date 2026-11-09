import { Platform } from 'react-native';

import { LogEvents } from '@linestepper/shared';

import { logger } from './logger';

/**
 * Sends crashes to the logs (and so to the API on Heroku). Two kinds:
 * - errors thrown while drawing a screen, caught by the ErrorBoundary in
 *   app/_layout.tsx, which calls reportScreenError();
 * - everything else (a failed tap handler, a rejected promise), caught here.
 * A crash in native code kills the app before JavaScript can report it;
 * those show up in App Store Connect and Google Play Console instead.
 */
let installed = false;

export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (e) => {
      logger.error(LogEvents.unhandledError, e.error ?? e.message, { kind: 'error' });
    });
    window.addEventListener('unhandledrejection', (e) => {
      logger.error(LogEvents.unhandledError, e.reason, { kind: 'unhandled_rejection' });
    });
    return;
  }

  // React Native's global handler. Keep the previous one (it shows the red
  // screen in development and closes the app on a fatal error in release).
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    logger.error(LogEvents.unhandledError, error, { fatal: Boolean(isFatal) });
    if (isFatal) {
      // Give the upload a moment before the app closes.
      void logger.flush().finally(() => previous(error, isFatal));
    } else {
      previous(error, isFatal);
    }
  });
}

export function reportScreenError(error: Error, route: string) {
  logger.error(LogEvents.unhandledError, error, { kind: 'render', route });
  void logger.flush();
}

interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}
