import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import type { AuthUser, AuthVerifier } from '@linestepper/shared';

/**
 * Verifies Supabase access tokens locally (no network call per request).
 * Uses the project's JWKS for asymmetric signing keys, or the legacy shared
 * secret when SUPABASE_JWT_SECRET is set.
 */
export function supabaseVerifier(options: { url: string; jwtSecret?: string }): AuthVerifier {
  const issuer = `${options.url.replace(/\/$/, '')}/auth/v1`;
  const key: Uint8Array | JWTVerifyGetKey = options.jwtSecret
    ? new TextEncoder().encode(options.jwtSecret)
    : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return {
    id: 'supabase',
    async verify(token: string): Promise<AuthUser | null> {
      try {
        const { payload } = await jwtVerify(token, key as Uint8Array, { issuer, audience: 'authenticated' });
        return typeof payload.sub === 'string' ? { id: payload.sub } : null;
      } catch {
        return null;
      }
    },
  };
}
