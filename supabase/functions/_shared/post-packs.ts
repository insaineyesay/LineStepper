/**
 * Post packs sold on the web, and the pure logic of turning Stripe events
 * into ledger rows. No Deno or Stripe SDK imports, so it is unit-tested with
 * vitest (post-packs.test.ts). The app shows the same packs from
 * apps/mobile/src/lib/post-packs.ts; a test checks the two lists match.
 */

export interface PostPack {
  id: 'single' | 'five' | 'ten';
  credits: number;
  /** Price in US cents. */
  amountCents: number;
  name: string;
}

export const POST_PACKS: readonly PostPack[] = [
  { id: 'single', credits: 1, amountCents: 99, name: '1 event post' },
  { id: 'five', credits: 5, amountCents: 495, name: '5 event posts' },
  { id: 'ten', credits: 10, amountCents: 990, name: '10 event posts' },
];

export function findPack(id: unknown): PostPack | undefined {
  return POST_PACKS.find((p) => p.id === id);
}

/** The fields of a Stripe Checkout Session this code reads. */
export interface CheckoutSessionLike {
  id: string;
  payment_status: string;
  payment_intent: string | { id: string } | null;
  metadata: Record<string, string> | null;
}

export interface LedgerInsert {
  profile_id: string;
  delta: number;
  reason: 'purchase' | 'refund';
  source: 'stripe';
  external_id: string;
  payment_ref: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paymentIntentId(pi: CheckoutSessionLike['payment_intent']): string | null {
  if (!pi) return null;
  return typeof pi === 'string' ? pi : pi.id;
}

/**
 * The credit grant for a completed checkout, or null if the session isn't
 * paid or wasn't created by create-checkout. The credit count comes from our
 * own pack list, never from metadata alone, so a tampered session can't mint
 * extra credits.
 */
export function grantForSession(session: CheckoutSessionLike): LedgerInsert | null {
  if (session.payment_status !== 'paid') return null;
  const profileId = session.metadata?.profile_id;
  const pack = findPack(session.metadata?.pack);
  if (!profileId || !UUID.test(profileId) || !pack) return null;
  return {
    profile_id: profileId,
    delta: pack.credits,
    reason: 'purchase',
    source: 'stripe',
    external_id: session.id,
    payment_ref: paymentIntentId(session.payment_intent),
  };
}

/** The fields of a Stripe Charge this code reads. */
export interface ChargeLike {
  id: string;
  payment_intent: string | { id: string } | null;
  amount: number;
  amount_refunded: number;
  refunded: boolean;
}

/**
 * Takes back the credits of a fully refunded purchase. Partial refunds take
 * nothing back automatically (an admin can adjust by hand). The balance may
 * go below zero if the credits were already used; that only blocks new posts.
 */
export function reversalForRefund(
  charge: ChargeLike,
  purchase: { profile_id: string; delta: number } | null
): LedgerInsert | null {
  if (!purchase || !charge.refunded || charge.amount_refunded < charge.amount) return null;
  return {
    profile_id: purchase.profile_id,
    delta: -purchase.delta,
    reason: 'refund',
    source: 'stripe',
    external_id: `refund:${charge.id}`,
    payment_ref: paymentIntentId(charge.payment_intent),
  };
}
