import type { FastifyInstance } from 'fastify';

import { LogEvents } from '@linestepper/shared';

import { AccountsUnavailableError } from '../accounts';

/**
 * The signed-in person's own account. DELETE /me removes it for good: their
 * profile, events, bookmarks, follows, memberships, push tokens and post
 * credits. Crews they own pass to the next member, or are deleted if empty.
 */
export async function accountRoutes(app: FastifyInstance) {
  app.delete(
    '/me',
    { preHandler: app.requireUser, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const userId = req.user!.id;
      try {
        const result = await app.deps.accounts.deleteAccount(userId);
        req.logger.info(LogEvents.accountDeleted, { ...result });
        if (!result.imagesRemoved) {
          req.logger.error(LogEvents.accountDeleteFailed, new Error('Images left in storage after account deletion'), {
            step: 'images',
          });
        }
        return reply.status(200).send({ deleted: true, ...result });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        req.logger.error(LogEvents.accountDeleteFailed, error);
        if (err instanceof AccountsUnavailableError) return reply.status(503).send({ error: 'unavailable' });
        return reply.status(500).send({ error: 'delete_failed', requestId: req.id });
      }
    },
  );
}
