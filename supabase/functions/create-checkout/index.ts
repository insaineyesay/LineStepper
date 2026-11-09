// Starts a Stripe Checkout for a post pack and returns its URL. Called by the
// web app's "Buy posts" screen with the signed-in user's token.
//
// Deploy:  npx supabase functions deploy create-checkout --no-verify-jwt
//          (the function checks the user's token itself)
// Secrets: STRIPE_SECRET_KEY (sk_test_… or sk_live_…)
//          SITE_URLS: comma-separated web app origins Stripe may send people
//          back to, first one is the default, e.g.
//          "https://lineup2step.vercel.app,http://localhost:8082"

import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { findPack } from '../_shared/post-packs.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Where Stripe sends the buyer back: the caller's origin if allowed, else the first listed. */
function returnOrigin(requested: unknown): string | null {
  const allowed = (Deno.env.get('SITE_URLS') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (typeof requested === 'string' && allowed.includes(requested.replace(/\/$/, ''))) {
    return requested.replace(/\/$/, '');
  }
  return allowed[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json({ error: 'payments are not set up yet' }, 503);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = token
    ? await supabase.auth.getUser(token)
    : { data: { user: null }, error: null };
  const user = userData.user;
  if (userError || !user) return json({ error: 'sign in to buy posts' }, 401);

  let body: { pack?: unknown; origin?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid request' }, 400);
  }
  const pack = findPack(body.pack);
  if (!pack) return json({ error: 'unknown pack' }, 400);

  const origin = returnOrigin(body.origin);
  if (!origin) return json({ error: 'SITE_URLS is not set' }, 503);

  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: pack.amountCents,
            product_data: { name: `LineUp2Step: ${pack.name}` },
          },
        },
      ],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { profile_id: user.id, pack: pack.id },
      payment_intent_data: { metadata: { profile_id: user.id, pack: pack.id } },
      success_url: `${origin}/credits?checkout=success`,
      cancel_url: `${origin}/credits?checkout=cancelled`,
    });
    console.log(JSON.stringify({ event: 'checkout.created', pack: pack.id, session: session.id }));
    return json({ url: session.url });
  } catch (err) {
    console.log(JSON.stringify({ event: 'checkout.failed', message: (err as Error).message }));
    return json({ error: 'could not start checkout' }, 502);
  }
});
