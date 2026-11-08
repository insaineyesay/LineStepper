import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import { LogEvents, type AuthClient, type AuthSession } from '@linestepper/shared';

import { authClient } from './auth';
import { configureLogAuth, logger } from './logger';

interface SessionState {
  session: AuthSession | null;
  loading: boolean;
  auth: AuthClient;
}

const SessionContext = createContext<SessionState>({ session: null, loading: false, auth: authClient });

configureLogAuth(async () => (await authClient.getSession())?.accessToken);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(authClient.configured);

  useEffect(() => {
    if (!authClient.configured) return;
    authClient.getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });
    return authClient.onSessionChange((next) => {
      setSession((prev) => {
        if (!prev && next) logger.info(LogEvents.authSignIn, { provider: authClient.id });
        if (prev && !next) logger.info(LogEvents.authSignOut, { provider: authClient.id });
        return next;
      });
    });
  }, []);

  // Client logs carry the user id locally too (the server also sets it from the token).
  useEffect(() => {
    logger.setContext({ userId: session?.user.id });
  }, [session?.user.id]);

  return (
    <SessionContext.Provider value={{ session, loading, auth: authClient }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
