import type { AuthError as SupabaseAuthError, Session, SupabaseClient } from '@supabase/supabase-js';

import { AuthError, type AuthClient, type AuthMethod, type AuthSession } from '@linestepper/shared';

function toSession(s: Session | null): AuthSession | null {
  if (!s) return null;
  return { user: { id: s.user.id, email: s.user.email }, accessToken: s.access_token, expiresAt: s.expires_at };
}

function toAuthError(err: SupabaseAuthError): AuthError {
  const status = err.status ?? 0;
  if (status === 429) return new AuthError('rate_limited', 'Too many attempts. Wait a minute and try again.');
  if (/token|otp|expired/i.test(err.message)) return new AuthError('invalid_code', 'That code is wrong or expired.');
  if (/credentials/i.test(err.message)) return new AuthError('invalid_credentials', 'Email or password is wrong.');
  return new AuthError('unknown', err.message);
}

/** AuthClient adapter for Supabase Auth. The only file in the app that calls supabase.auth. */
export function createSupabaseAuthClient(supabase: SupabaseClient, configured: boolean): AuthClient {
  const methods = new Set<AuthMethod>(['email_otp', 'email_password']);
  const requireConfigured = () => {
    if (!configured) throw new AuthError('not_configured', 'Backend not connected.');
  };

  return {
    id: 'supabase',
    methods,
    configured,

    async getSession() {
      if (!configured) return null;
      const { data } = await supabase.auth.getSession();
      return toSession(data.session);
    },

    onSessionChange(listener) {
      if (!configured) return () => {};
      const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(toSession(session)));
      return () => data.subscription.unsubscribe();
    },

    async requestEmailOtp(email) {
      requireConfigured();
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw toAuthError(error);
    },

    async verifyEmailOtp(email, code) {
      requireConfigured();
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw toAuthError(error);
      const session = toSession(data.session);
      if (!session) throw new AuthError('invalid_code', 'That code is wrong or expired.');
      return session;
    },

    async signInWithPassword(email, password) {
      requireConfigured();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw toAuthError(error);
      return toSession(data.session)!;
    },

    async signOut() {
      if (!configured) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw toAuthError(error);
    },
  };
}
