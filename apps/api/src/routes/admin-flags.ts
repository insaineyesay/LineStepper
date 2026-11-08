import type { FastifyInstance } from 'fastify';

import { isFlagKey } from '@linestepper/shared';

export async function adminFlagRoutes(app: FastifyInstance) {
  app.put<{ Params: { key: string }; Body: { enabled: boolean } }>(
    '/admin/flags/:key',
    {
      preHandler: app.requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['enabled'],
          properties: { enabled: { type: 'boolean' } },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { key } = req.params;
      if (!isFlagKey(key)) return reply.status(404).send({ error: 'unknown_flag' });
      const flags = await app.deps.flags.set(key, req.body.enabled, req.user!.id, req.logger);
      return { key, enabled: req.body.enabled, effective: flags[key], flags };
    },
  );
}
