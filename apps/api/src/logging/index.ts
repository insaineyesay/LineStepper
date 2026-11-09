import { createLogger, type FlagKey, type Logger, type LogTransport } from '@linestepper/shared';

import type { Config } from '../config';
import { LogBus } from './bus';
import type { LogConnector } from './connector';
import { papertrailConnector } from './connectors/papertrail';
import { posthogConnector } from './connectors/posthog';
import { sentryConnector } from './connectors/sentry';
import { stdoutConnector } from './connectors/stdout';

export { LogBus } from './bus';
export type { LogConnector } from './connector';

/** Builds the connector list from config. Unconfigured vendors are simply not added. */
export function buildConnectors(config: Config): LogConnector[] {
  const connectors: LogConnector[] = [stdoutConnector()];
  if (config.papertrail.token) {
    connectors.push(papertrailConnector({ token: config.papertrail.token, url: config.papertrail.url }));
  }
  if (config.posthog.apiKey) {
    connectors.push(posthogConnector({ apiKey: config.posthog.apiKey, host: config.posthog.host }));
  }
  if (config.sentry.dsn) {
    connectors.push(sentryConnector({ dsn: config.sentry.dsn, env: config.env, release: config.appVersion }));
  }
  return connectors;
}

export function createServerLogging(
  config: Config,
  isFlagOn: (key: FlagKey) => boolean,
  connectors: LogConnector[] = buildConnectors(config),
): { bus: LogBus; logger: Logger } {
  const bus = new LogBus({
    connectors,
    isConnectorEnabled: (name) => isFlagOn(`log.connector.${name}` as FlagKey),
    enrich: { env: config.env, appVersion: config.appVersion },
  });
  const transport: LogTransport = { name: 'bus', write: (e) => bus.write(e), flush: () => bus.flush() };
  const logger = createLogger({
    source: 'api',
    transports: [transport],
    minLevel: config.logLevel,
    context: { env: config.env, appVersion: config.appVersion, platform: 'server' },
  });
  return { bus, logger };
}
