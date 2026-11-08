import type { AuthVerifier } from '@linestepper/shared';

import type { Config } from '../config';
import { supabaseVerifier } from './supabase-verifier';

/** Rejects every token. Used when AUTH_PROVIDER=none (local dev without a backend). */
const noAuth: AuthVerifier = { id: 'none', verify: async () => null };

/**
 * Picks the verifier from AUTH_PROVIDER. To add a provider (Clerk, Auth0,
 * our own local auth API), write an AuthVerifier and add a case here.
 */
export function createAuthVerifier(config: Config): AuthVerifier {
  switch (config.auth.provider) {
    case 'supabase':
      if (!config.auth.supabaseUrl) throw new Error('AUTH_PROVIDER=supabase needs SUPABASE_URL');
      return supabaseVerifier({ url: config.auth.supabaseUrl, jwtSecret: config.auth.supabaseJwtSecret });
    case 'none':
      return noAuth;
  }
}

/** Answers "is this user a platform admin?" without tying routes to a database. */
export interface AdminDirectory {
  isAdmin(userId: string): Promise<boolean>;
}
