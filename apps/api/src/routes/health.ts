import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true,
    version: app.deps.config.appVersion,
    auth: app.deps.auth.id,
    logConnectors: app.deps.bus.health(),
  }));
}
