import { LogEvents } from '@linestepper/shared';
import { useEffect, useState } from 'react';

import { createCheckout, getPostCreditBalance, publishEvent as publishEventData } from '@/data/credits';
import { isBackendConfigured } from '@/data/backend';
import { getFlag } from '@/data/reference';

import { useFlag } from './flags';
import { logger } from './logger';
import type { PostPackOption } from './post-packs';

/**
 * Post credits: publishing an event costs one. The rules live in the
 * database (supabase/migrations/0005_post_credits.sql); these helpers only
 * call them.
 */

/**
 * Whether publishing costs a post right now. The switch lives in the
 * database (an admin turns it on once payments are set up), so read it from
 * there; the registry default covers the moment before it loads.
 */
export function usePaidPosting(): boolean {
  const fromRegistry = useFlag('events.paid_posting');
  const [fromDb, setFromDb] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isBackendConfigured) return;
    let cancelled = false;
    getFlag('events.paid_posting', true).then(({ data, error }) => {
      if (cancelled) return;
      // An error means the paid-posting migration isn't in this database
      // yet, so there is nothing to charge with: post the old way.
      setFromDb(error ? false : data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return fromDb ?? fromRegistry;
}

/** The signed-in user's credit balance, or null if it couldn't be loaded. */
export async function fetchPostCredits(): Promise<number | null> {
  if (!isBackendConfigured) return null;
  const { data, error } = await getPostCreditBalance();
  if (error) {
    logger.warn(LogEvents.creditsLoadFailed, { message: error.message });
    return null;
  }
  return data;
}

export type PublishResult = 'published' | 'no_credits' | { error: string };

/** Publishes one of the user's events, spending a credit the first time. */
export async function publishEvent(eventId: string): Promise<PublishResult> {
  const { error } = await publishEventData(eventId);
  if (!error) {
    logger.info(LogEvents.eventPublished);
    return 'published';
  }
  if (error.code === 'no_post_credits') return 'no_credits';
  return { error: error.message };
}

/**
 * Opens Stripe Checkout for a pack (web only). Returns an error message, or
 * nothing once the browser is on its way to Stripe.
 */
export async function startCheckout(pack: PostPackOption): Promise<string | null> {
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { data, error } = await createCheckout(pack.id, origin);
  if (error) {
    logger.warn(LogEvents.checkoutFailed, { message: error.message });
    return "Couldn't start checkout. Try again in a moment.";
  }
  logger.info(LogEvents.checkoutStarted, { pack: pack.id });
  window.location.assign(data.url);
  return null;
}
