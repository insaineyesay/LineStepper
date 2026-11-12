import { createClient } from '@supabase/supabase-js';

import { LogEvents } from '@linestepper/shared';

import { noAccountStore, supabaseAccountStore } from './accounts';
import { noAdmins, supabaseAdminDirectory } from './admins';
import { noImageStore, supabaseImageStore } from './images';
import { noModerationStore, supabaseModerationStore } from './moderation';
import { createAuthVerifier } from './auth';
import { loadConfig } from './config';
import { FlagService } from './flags/service';
import { MemoryFlagStore, SupabaseFlagStore } from './flags/store';
import { createServerLogging } from './logging';
import { buildServer } from './server';

if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('.env');
  } catch {
    // no .env — fine, use the real environment
  }
}

async function main() {
  const config = loadConfig();

  const db =
    config.supabase.url && config.supabase.serviceRoleKey
      ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  const flags = new FlagService(db ? new SupabaseFlagStore(db) : new MemoryFlagStore(), config.flagsEnv);
  const { bus, logger } = createServerLogging(config, (key) => flags.isOn(key));
  flags.attachLogger(logger);
  await bus.start();
  await flags.refresh();

  const app = await buildServer({
    config,
    logger,
    bus,
    flags,
    auth: createAuthVerifier(config),
    admins: db ? supabaseAdminDirectory(db) : noAdmins,
    accounts: db ? supabaseAccountStore(db, supabaseImageStore(db)) : noAccountStore,
    moderation: db ? supabaseModerationStore(db) : noModerationStore,
    images: db ? supabaseImageStore(db) : noImageStore,
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(LogEvents.appStart, {
    port: config.port,
    auth: config.auth.provider,
    flagStore: db ? 'supabase' : 'memory',
    connectors: bus.health().map((c) => `${c.name}:${c.enabled ? 'on' : 'off'}`),
  });

  // Heroku sends SIGTERM on restart and gives 30s; flush logs before exiting.
  const shutdown = async (signal: string) => {
    logger.info(LogEvents.appShutdown, { signal });
    await app.close();
    await bus.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error(LogEvents.unhandledError, err, { kind: 'unhandledRejection' }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
