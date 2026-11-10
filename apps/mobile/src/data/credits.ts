import { db, isBackendConfigured } from './backend';
import { fail, fromResponse, ok, type DataResult } from './result';

/** Post credits: publishing an event costs one (supabase/migrations/0005). */

export async function getPostCreditBalance(): Promise<DataResult<number>> {
  if (!isBackendConfigured) return fail(null, 'Backend not configured.');
  const res = await db.rpc('post_credit_balance');
  if (res.error) return fromResponse(res);
  return ok(typeof res.data === 'number' ? res.data : 0);
}

/**
 * Publishes one of the caller's events, spending a credit the first time.
 * Fails with code 'no_post_credits' when the balance is zero.
 */
export async function publishEvent(eventId: string): Promise<DataResult<true>> {
  const res = await db.rpc('publish_event', { p_event_id: eventId });
  if (!res.error) return ok(true);
  if (res.error.message.includes('no_post_credits')) return fail({ message: res.error.message, code: 'no_post_credits' });
  return fromResponse(res);
}

/** Starts a Stripe Checkout for a pack and returns its URL (web only). */
export async function createCheckout(packId: string, origin: string | undefined): Promise<DataResult<{ url: string }>> {
  const res = await db.functions.invoke<{ url?: string; error?: string }>('create-checkout', {
    body: { pack: packId, origin },
  });
  if (res.error || !res.data?.url) return fail({ message: res.error?.message ?? res.data?.error ?? 'Checkout failed.' });
  return ok({ url: res.data.url });
}
