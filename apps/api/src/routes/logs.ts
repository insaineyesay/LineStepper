import type { FastifyInstance } from 'fastify';

import { LogEvents, validateClientBatch } from '@linestepper/shared';

/**
 * Client log ingest (PRD B5). Mobile and web batch their events here; they
 * join the same server pipeline, with identity set by the server from the
 * bearer token and request id — never trusted from the body.
 */
export async function logRoutes(app: FastifyInstance) {
  app.post(
    '/logs',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const result = validateClientBatch(req.body);
      if (!result.ok) return reply.status(400).send({ error: result.error });

      for (const e of result.events) {
        app.deps.bus.write({ ...e, requestId: req.id, userId: req.user?.id });
      }
      if (result.rejected) req.logger.warn(LogEvents.logsDropped, { rejected: result.rejected, reason: 'invalid' });
      return reply.status(202).send({ accepted: result.events.length, rejected: result.rejected });
    },
  );
}
