import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { LogEvents } from '@linestepper/shared';

import { logger } from './logger';

/** Logs app start, every screen view (with time on the previous screen) and backgrounding. */
export function useScreenLogging() {
  const pathname = usePathname();
  const entered = useRef<{ path: string; at: number } | null>(null);

  useEffect(() => {
    logger.info(LogEvents.appStart);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        logger.info(LogEvents.appBackground, { screen: entered.current?.path });
        void logger.flush();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const prev = entered.current;
    const now = Date.now();
    // pathname is the route pattern filled in (e.g. /event/123); ids are fine, they're not PII.
    logger.info(LogEvents.screenView, { screen: pathname, from: prev?.path, prevDurationMs: prev ? now - prev.at : undefined });
    entered.current = { path: pathname, at: now };
  }, [pathname]);
}
