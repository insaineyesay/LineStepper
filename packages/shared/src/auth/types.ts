/**
 * Pluggable auth contract. App code depends only on these interfaces, so the
 * backing service (Supabase today; Clerk, Auth0, Firebase or our own local
 * auth API later) is swapped by writing one adapter, not by touching screens.
 *
 * - AuthClient   runs in the mobile app / web dashboard.
 * - AuthVerifier runs in the API and turns a bearer token into a user.
 */

export type AuthMethod =
  | 'email_otp'
  | 'email_password'
  | 'oauth:apple'
  | 'oauth:google'
  | 'oauth:facebook';

export type OAuthProvider = 'apple' | 'google' | 'facebook';

export interface AuthUser {
  id: string;
  /** Present for display in the account screen only. Never log it. */
  email?: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  /** Epoch seconds. */
  expiresAt?: number;
}

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'invalid_code'
  | 'rate_limited'
  | 'not_supported'
  | 'not_configured'
  | 'network'
  | 'unknown';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthClient {
  /** Adapter id, e.g. 'supabase', 'local'. Logged so we know which backend handled a sign-in. */
  readonly id: string;
  readonly methods: ReadonlySet<AuthMethod>;
  /** False when the adapter is missing its config (e.g. no Supabase URL in .env). */
  readonly configured: boolean;

  getSession(): Promise<AuthSession | null>;
  /** Called on sign-in, sign-out and token refresh. Returns an unsubscribe function. */
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;

  /** Sends a one-time code to the email address. */
  requestEmailOtp(email: string): Promise<void>;
  verifyEmailOtp(email: string, code: string): Promise<AuthSession>;
  signInWithPassword?(email: string, password: string): Promise<AuthSession>;
  signInWithOAuth?(provider: OAuthProvider): Promise<AuthSession | null>;
  signOut(): Promise<void>;
}

export interface AuthVerifier {
  readonly id: string;
  /** Returns the user for a valid, unexpired token, or null. Never throws for a bad token. */
  verify(accessToken: string): Promise<AuthUser | null>;
}
