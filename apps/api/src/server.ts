import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type preHandlerHookHandler } from 'fastify';

import { LogEvents, type AuthUser, type AuthVerifier, type FlagKey, type Logger } from '@linestepper/shared';

import type { AccountStore } from './accounts';
import type { AdminDirectory } from './auth';
import type { ImageStore } from './images';
import type { ModerationStore } from './moderation';
import type { Config } from './config';
import type { FlagService } from './flags/service';
import type { LogBus } from './logging';
import { accountRoutes } from './routes/account';
import { adminFlagRoutes } from './routes/admin-flags';
import { flagRoutes } from './routes/flags';
import { healthRoutes } from './routes/health';
import { logRoutes } from './routes/logs';
import { imageRoutes } from './routes/images';
import { moderationRoutes } from './routes/moderation';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    /** Our logger, already stamped with this request's id and user. */
    logger: Logger;
  }
  interface FastifyInstance {
    deps: ServerDeps;
    requireUser: preHandlerHookHandler;
    requireAdmin: preHandlerHookHandler;
    requireFlag(key: FlagKey): preHandlerHookHandler;
  }
}

export interface ServerDeps {
  config: Config;
  logger: Logger;
  bus: LogBus;
  flags: FlagService;
  auth: AuthVerifier;
  admins: AdminDirectory;
  accounts: AccountStore;
  moderation: ModerationStore;
  images: ImageStore;
}

const REQUEST_ID = /^[\w-]{8,64}$/;

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // All logging goes through our logger → log bus, not Fastify's built-in Pino.
    logger: false,
    bodyLimit: 256 * 1024,
    trustProxy: true, // Heroku router
    // Reuse the caller's request id so one id follows a tap from the app to the database.
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
  });

  app.decorate('deps', deps);
  app.decorateRequest('user', null);
  app.decorateRequest('logger', null as unknown as Logger);

  await app.register(cors, {
    origin: deps.config.corsOrigins.length ? deps.config.corsOrigins : false,
    // Listed explicitly: newer @fastify/cors only allows GET/HEAD/POST by default.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposedHeaders: ['x-request-id'],
  });
  await app.register(rateLimit, { global: false });

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
    req.user = null;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) req.user = await deps.auth.verify(header.slice(7));
    req.logger = deps.logger.child({ requestId: req.id, userId: req.user?.id });
  });

  // PRD: every API request produces a log event with request id and user id.
  app.addHook('onResponse', async (req, reply) => {
    const status = reply.statusCode;
    const route = req.routeOptions.url ?? 'unmatched';
    const data = { method: req.method, route, status, durationMs: Math.round(reply.elapsedTime) };
    if (status >= 500) req.logger.error(LogEvents.apiRequest, undefined, data);
    else if (status >= 400) req.logger.warn(LogEvents.apiRequest, data);
    // Log ingest is chatty; its own events are the useful part.
    else if (route === '/logs') req.logger.debug(LogEvents.apiRequest, data);
    else req.logger.info(LogEvents.apiRequest, data);
  });

  app.setErrorHandler((error, req, reply) => {
    const err = error instanceof Error ? error : new Error(String(error));
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.logger.error(LogEvents.unhandledError, err, { route: req.routeOptions.url });
    reply.status(status).send({ error: status >= 500 ? 'internal_error' : err.message, requestId: req.id });
  });

  app.decorate('requireUser', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthorized' });
  });

  app.decorate('requireAdmin', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthorized' });
    if (!(await deps.admins.isAdmin(req.user.id))) return reply.status(403).send({ error: 'forbidden' });
  });

  // Server-side flag enforcement (PRD B2): a disabled feature 404s even if the API is called directly.
  app.decorate('requireFlag', (key: FlagKey): preHandlerHookHandler => async (req, reply) => {
    if (!deps.flags.isOn(key)) {
      req.logger.info(LogEvents.flagDenied, { key, route: req.routeOptions.url });
      return reply.status(404).send({ error: 'not_found' });
    }
  });

  await app.register(healthRoutes);
  await app.register(flagRoutes);
  await app.register(adminFlagRoutes);
  await app.register(logRoutes);
  await app.register(accountRoutes);
  await app.register(moderationRoutes);
  await app.register(imageRoutes);

  return app;
}
