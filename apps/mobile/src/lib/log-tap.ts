import { LogEvents } from '@linestepper/shared';

import { logger } from './logger';

/** Logs a ui.tap event then runs the handler. Wrap any onPress with this to count the action. */
export function logTap(name: string, handler: () => void, component = 'pressable') {
  logger.info(LogEvents.uiTap, { name, component });
  handler();
}
