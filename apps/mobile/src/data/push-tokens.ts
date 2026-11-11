import { db } from './backend';
import { fromResponse, ok, type DataResult } from './result';

/** Saves this device's push token for the signed-in user (moves it if the phone changed hands). */
export async function registerPushToken(token: string, platform: string): Promise<DataResult<true>> {
  const res = await db.rpc('register_push_token', { p_token: token, p_platform: platform });
  return res.error ? fromResponse(res) : ok(true);
}

export async function removePushToken(token: string): Promise<DataResult<true>> {
  const res = await db.from('push_tokens').delete().eq('token', token);
  return res.error ? fromResponse(res) : ok(true);
}
