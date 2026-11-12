import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { LogEvents } from '@linestepper/shared';

import { IMAGE_TARGETS, imagePaths, type ImageTarget } from '../images';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TargetBody {
  target?: unknown;
  eventId?: unknown;
}

/**
 * Event flyers and profile photos. Three steps, so the app never holds
 * storage credentials and can't write anywhere else:
 *   1. POST /images/uploads   -> one-time upload links for paths we choose
 *   2. the app uploads the shrunk JPEGs to those links
 *   3. POST /images/attach    -> we check the files arrived and record them
 * DELETE /images removes a flyer or photo.
 */
export async function imageRoutes(app: FastifyInstance) {
  const images = () => app.deps.images;
  const moderation = () => app.deps.moderation;

  /** Who the image belongs to (the event, or the caller), or null after replying with an error. */
  async function resolveOwner(req: FastifyRequest<{ Body: TargetBody }>, reply: FastifyReply) {
    const { target, eventId } = req.body ?? {};
    if (typeof target !== 'string' || !IMAGE_TARGETS.includes(target as ImageTarget)) {
      reply.status(400).send({ error: 'target' });
      return null;
    }
    if (await moderation().isBanned(req.user!.id)) {
      reply.status(403).send({ error: 'banned' });
      return null;
    }
    if (target === 'profile') return { target: 'profile' as const, ownerId: req.user!.id };

    if (typeof eventId !== 'string' || !UUID.test(eventId)) {
      reply.status(400).send({ error: 'eventId' });
      return null;
    }
    const organizer = await moderation().ownerOf('event', eventId);
    if (!organizer) {
      reply.status(404).send({ error: 'not_found' });
      return null;
    }
    if (organizer !== req.user!.id) {
      reply.status(403).send({ error: 'not_yours' });
      return null;
    }
    return { target: 'event' as const, ownerId: eventId };
  }

  app.post<{ Body: TargetBody }>(
    '/images/uploads',
    { preHandler: app.requireUser, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const owner = await resolveOwner(req, reply);
      if (!owner) return;
      const imageId = randomUUID();
      const paths = imagePaths(owner.target, owner.ownerId, imageId);
      const uploads = await images().createUploads(Object.values(paths) as string[]);
      return {
        imageId,
        uploads: uploads.map((u) => ({ ...u, variant: u.path === paths.thumb ? 'thumb' : 'full' })),
      };
    },
  );

  app.post<{ Body: TargetBody & { imageId?: unknown } }>(
    '/images/attach',
    { preHandler: app.requireUser, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const { imageId } = req.body ?? {};
      if (typeof imageId !== 'string' || !UUID.test(imageId)) return reply.status(400).send({ error: 'imageId' });
      const owner = await resolveOwner(req, reply);
      if (!owner) return;

      const paths = imagePaths(owner.target, owner.ownerId, imageId);
      if (!(await images().allExist(Object.values(paths) as string[]))) {
        return reply.status(409).send({ error: 'not_uploaded' });
      }
      const url = images().publicUrl(paths.full);
      const thumbUrl = paths.thumb ? images().publicUrl(paths.thumb) : null;
      const replaced =
        owner.target === 'event'
          ? await images().setEventImage(owner.ownerId, url, thumbUrl)
          : await images().setProfileImage(owner.ownerId, url);
      await images().removeByUrls(replaced);
      req.logger.info(LogEvents.imageAttached, { target: owner.target });
      return { url, thumbUrl };
    },
  );

  app.delete<{ Body: TargetBody }>('/images', { preHandler: app.requireUser }, async (req, reply) => {
    const owner = await resolveOwner(req, reply);
    if (!owner) return;
    const replaced =
      owner.target === 'event'
        ? await images().setEventImage(owner.ownerId, null, null)
        : await images().setProfileImage(owner.ownerId, null);
    await images().removeByUrls(replaced);
    req.logger.info(LogEvents.imageRemoved, { target: owner.target });
    return { removed: true };
  });
}
