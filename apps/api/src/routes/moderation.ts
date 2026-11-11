import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { LogEvents } from '@linestepper/shared';

import { REPORT_REASONS, RESOLUTIONS, TARGET_TYPES, type ReportReason } from '../moderation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DETAILS = 1000;

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && list.includes(v as T);

/**
 * Report, block and moderate. People report events, crews and profiles and
 * block other people; admins work through open reports. Every admin action
 * is logged (moderation_actions table and the log stream).
 */
export async function moderationRoutes(app: FastifyInstance) {
  const store = () => app.deps.moderation;

  /** Banned people can't report or block; returns true if it replied. */
  async function refuseIfBanned(req: FastifyRequest, reply: FastifyReply) {
    if (await store().isBanned(req.user!.id)) {
      reply.status(403).send({ error: 'banned' });
      return true;
    }
    return false;
  }

  app.post<{ Body: { targetType?: unknown; targetId?: unknown; reason?: unknown; details?: unknown } }>(
    '/reports',
    { preHandler: app.requireUser, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const { targetType, targetId, reason, details } = req.body ?? {};
      if (!isOneOf(TARGET_TYPES, targetType)) return reply.status(400).send({ error: 'targetType' });
      if (typeof targetId !== 'string' || !UUID.test(targetId)) return reply.status(400).send({ error: 'targetId' });
      if (!isOneOf(REPORT_REASONS, reason)) return reply.status(400).send({ error: 'reason' });
      if (details !== undefined && details !== null && (typeof details !== 'string' || details.length > MAX_DETAILS)) {
        return reply.status(400).send({ error: 'details' });
      }
      if (await refuseIfBanned(req, reply)) return;

      const owner = await store().ownerOf(targetType, targetId);
      if (!owner) return reply.status(404).send({ error: 'not_found' });
      if (owner === req.user!.id) return reply.status(400).send({ error: 'own_content' });

      const result = await store().createReport({
        reporterId: req.user!.id,
        targetType,
        targetId,
        reason: reason as ReportReason,
        details: typeof details === 'string' && details.trim() ? details.trim() : null,
      });
      // Ids only: what was reported is for the moderation screen, not the logs.
      if (result === 'created') req.logger.info(LogEvents.reportCreated, { targetType, targetId, reason });
      return reply.status(result === 'created' ? 201 : 200).send({ reported: true });
    },
  );

  app.get('/me/blocks', { preHandler: app.requireUser }, async (req) => ({
    blocked: await store().listBlocked(req.user!.id),
  }));

  app.put<{ Params: { profileId: string } }>(
    '/blocks/:profileId',
    { preHandler: app.requireUser, config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const { profileId } = req.params;
      if (!UUID.test(profileId)) return reply.status(400).send({ error: 'profileId' });
      if (profileId === req.user!.id) return reply.status(400).send({ error: 'self' });
      if (await refuseIfBanned(req, reply)) return;
      if (!(await store().ownerOf('profile', profileId))) return reply.status(404).send({ error: 'not_found' });
      await store().block(req.user!.id, profileId);
      req.logger.info(LogEvents.userBlocked);
      return { blocked: true };
    },
  );

  app.delete<{ Params: { profileId: string } }>('/blocks/:profileId', { preHandler: app.requireUser }, async (req, reply) => {
    const { profileId } = req.params;
    if (!UUID.test(profileId)) return reply.status(400).send({ error: 'profileId' });
    await store().unblock(req.user!.id, profileId);
    req.logger.info(LogEvents.userUnblocked);
    return { blocked: false };
  });

  // ---- Admins ----

  app.get('/admin/reports', { preHandler: app.requireAdmin }, async () => ({
    reports: await store().listOpenReports(100),
  }));

  app.post<{ Params: { id: string }; Body: { action?: unknown; note?: unknown } }>(
    '/admin/reports/:id/resolve',
    { preHandler: app.requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const { action, note } = req.body ?? {};
      if (!UUID.test(id)) return reply.status(400).send({ error: 'id' });
      if (!isOneOf(RESOLUTIONS, action)) return reply.status(400).send({ error: 'action' });
      const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, MAX_DETAILS) : null;

      const report = await store().getOpenReport(id);
      if (!report) return reply.status(404).send({ error: 'not_found' });
      const { targetType, targetId } = report;
      const owner = await store().ownerOf(targetType, targetId);

      let logged: string = action;
      if (action === 'remove') {
        if (targetType === 'profile') return reply.status(400).send({ error: 'use_ban_for_profiles' });
        await store().removeContent(targetType, targetId);
        logged = `remove_${targetType}`;
      } else if (action === 'ban') {
        if (!owner) return reply.status(404).send({ error: 'owner_not_found' });
        if (owner === req.user!.id) return reply.status(400).send({ error: 'self' });
        if (await store().isAdmin(owner)) return reply.status(400).send({ error: 'admin' });
        await store().ban(owner);
        logged = 'ban_user';
      }

      const closed = await store().closeReports({
        reportId: id,
        targetType,
        targetId,
        status: action === 'dismiss' ? 'dismissed' : 'actioned',
        actorId: req.user!.id,
        action: logged,
        note: cleanNote,
      });
      req.logger.info(LogEvents.moderationAction, {
        action: logged,
        targetType,
        targetId,
        ownerId: action === 'ban' ? owner : undefined,
        reportsClosed: closed,
      });
      return { resolved: true, action: logged, reportsClosed: closed };
    },
  );
}

