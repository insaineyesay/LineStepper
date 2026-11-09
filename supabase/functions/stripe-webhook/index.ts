// Receives Stripe events and writes post credits to the ledger.
// - checkout.session.completed / async_payment_succeeded: adds the pack's credits.
// - charge.refunded (full refund): takes them back.
// Stripe retries webhooks, so every write is keyed on a Stripe ID and a
// repeat delivery changes nothing.
//
// Deploy:  npx supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (whsec_… from the
//          webhook endpoint in the Stripe dashboard)

import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  grantForSession,
  reversalForRefund,
  type ChargeLike,
  type CheckoutSessionLike,
  type LedgerInsert,
} from '../_shared/post-packs.ts';

function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }));
}

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripeKey || !webhookSecret) return new Response('not configured', { status: 503 });

  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
  const signature = req.headers.get('Stripe-Signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature ?? '',
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    log('stripe.bad_signature', { message: (err as Error).message });
    return new Response('bad signature', { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const write = async (row: LedgerInsert) => {
    const { error } = await supabase
      .from('post_credit_ledger')
      .upsert(row, { onConflict: 'external_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    log('credits.written', { reason: row.reason, delta: row.delta, ref: row.external_id });
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const grant = grantForSession(event.data.object as unknown as CheckoutSessionLike);
        if (grant) await write(grant);
        else log('credits.skipped', { type: event.type, id: event.data.object.id });
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as unknown as ChargeLike;
        const ref = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        const { data: purchase } = ref
          ? await supabase
              .from('post_credit_ledger')
              .select('profile_id, delta')
              .eq('payment_ref', ref)
              .eq('reason', 'purchase')
              .maybeSingle()
          : { data: null };
        const reversal = reversalForRefund(charge, purchase);
        if (reversal) await write(reversal);
        else log('refund.skipped', { charge: charge.id, matched: Boolean(purchase) });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // A 500 makes Stripe retry later.
    log('stripe.handler_failed', { type: event.type, message: (err as Error).message });
    return new Response('error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
