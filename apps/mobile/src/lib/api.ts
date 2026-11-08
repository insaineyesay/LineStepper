import { authClient } from './auth';
import { randomId } from './ids';
import { API_URL } from './logger';

/**
 * fetch() against the LineStepper API with the user's token and a request id,
 * so client and server log lines for one action share an id.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL is not set');
  const session = await authClient.getSession();
  const headers = new Headers(init.headers);
  headers.set('x-request-id', randomId());
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${API_URL}${path}`, { ...init, headers });
}
