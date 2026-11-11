import type { LogLevel } from '@linestepper/shared';

export interface Config {
  port: number;
  env: string;
  appVersion: string;
  corsOrigins: string[];
  logLevel: LogLevel;
  auth: {
    provider: 'supabase' | 'none';
    supabaseUrl?: string;
    supabaseJwtSecret?: string;
  };
  supabase: { url?: string; serviceRoleKey?: string };
  flagsEnv?: string;
  papertrail: { token?: string; url: string };
  sentry: { dsn?: string };
  posthog: { apiKey?: string; host: string };
}

const blank = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const authProvider = blank(env.AUTH_PROVIDER) ?? 'supabase';
  if (authProvider !== 'supabase' && authProvider !== 'none') {
    throw new Error(`AUTH_PROVIDER must be "supabase" or "none", got "${authProvider}"`);
  }
  const supabaseUrl = blank(env.SUPABASE_URL);
  return {
    port: Number(env.PORT ?? 4000),
    env: blank(env.NODE_ENV) ?? 'development',
    appVersion: blank(env.APP_VERSION) ?? blank(env.HEROKU_RELEASE_VERSION) ?? 'dev',
    // Browsers send the origin without a trailing slash, so drop any typed one.
    corsOrigins: (blank(env.CORS_ORIGINS) ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    logLevel: (blank(env.LOG_LEVEL) as LogLevel) ?? 'info',
    auth: { provider: authProvider, supabaseUrl, supabaseJwtSecret: blank(env.SUPABASE_JWT_SECRET) },
    supabase: { url: supabaseUrl, serviceRoleKey: blank(env.SUPABASE_SERVICE_ROLE_KEY) },
    flagsEnv: blank(env.FLAGS),
    papertrail: {
      token: blank(env.PAPERTRAIL_TOKEN),
      url: blank(env.PAPERTRAIL_URL) ?? 'https://logs.collector.solarwinds.com/v1/logs',
    },
    sentry: { dsn: blank(env.SENTRY_DSN) },
    posthog: {
      apiKey: blank(env.POSTHOG_API_KEY),
      host: blank(env.POSTHOG_HOST) ?? 'https://us.i.posthog.com',
    },
  };
}
