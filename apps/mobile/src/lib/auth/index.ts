import type { AuthClient } from '@linestepper/shared';

import { isSupabaseConfigured, supabase } from '../supabase';
import { createSupabaseAuthClient } from './supabase-auth-client';

/**
 * The app's auth backend. To switch providers (Clerk, Auth0, our own local
 * auth API), write another AuthClient adapter and change this one line —
 * screens only see the AuthClient interface via useSession().
 */
export const authClient: AuthClient = createSupabaseAuthClient(supabase, isSupabaseConfigured);
