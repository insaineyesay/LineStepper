import type { FastifyInstance } from 'fastify';

import { FLAG_REGISTRY } from '@linestepper/shared';

export async function flagRoutes(app: FastifyInstance) {
  /** Effective flags for the caller. Clients use this to hide UI; the server still enforces. */
  app.get('/flags', async (_req, reply) => {
    reply.header('cache-control', 'private, max-age=30');
    return { flags: await app.deps.flags.all() };
  });

  /** Registry with descriptions, for the admin dashboard. */
  app.get('/flags/registry', { preHandler: app.requireAdmin }, async () => ({ registry: FLAG_REGISTRY }));
}
