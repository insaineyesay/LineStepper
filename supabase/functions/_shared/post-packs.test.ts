import { describe, expect, it } from 'vitest';

import { POST_PACK_OPTIONS } from '../../../apps/mobile/src/lib/post-packs';
import { findPack, grantForSession, POST_PACKS, reversalForRefund } from './post-packs';

const USER = '11111111-1111-4111-8111-111111111111';

const session = (over: Record<string, unknown> = {}) => ({
  id: 'cs_test_1',
  payment_status: 'paid',
  payment_intent: 'pi_1',
  metadata: { profile_id: USER, pack: 'five' },
  ...over,
});

describe('packs', () => {
  it('app and server list the same packs and prices', () => {
    expect(POST_PACK_OPTIONS.map(({ id, credits, amountCents }) => ({ id, credits, amountCents }))).toEqual(
      POST_PACKS.map(({ id, credits, amountCents }) => ({ id, credits, amountCents }))
    );
  });
  it('finds packs by id only', () => {
    expect(findPack('ten')?.credits).toBe(10);
    expect(findPack('free')).toBeUndefined();
    expect(findPack(undefined)).toBeUndefined();
  });
});

describe('grantForSession', () => {
  it('grants the pack credits for a paid session, keyed on the session id', () => {
    expect(grantForSession(session())).toEqual({
      profile_id: USER,
      delta: 5,
      reason: 'purchase',
      source: 'stripe',
      external_id: 'cs_test_1',
      payment_ref: 'pi_1',
    });
  });
  it('accepts an expanded payment intent', () => {
    expect(grantForSession(session({ payment_intent: { id: 'pi_2' } }))?.payment_ref).toBe('pi_2');
  });
  it('grants nothing for unpaid, unknown-pack or malformed sessions', () => {
    expect(grantForSession(session({ payment_status: 'unpaid' }))).toBeNull();
    expect(grantForSession(session({ metadata: { profile_id: USER, pack: 'hundred' } }))).toBeNull();
    expect(grantForSession(session({ metadata: { profile_id: 'not-a-uuid', pack: 'five' } }))).toBeNull();
    expect(grantForSession(session({ metadata: null }))).toBeNull();
  });
});

describe('reversalForRefund', () => {
  const charge = { id: 'ch_1', payment_intent: 'pi_1', amount: 495, amount_refunded: 495, refunded: true };
  const purchase = { profile_id: USER, delta: 5 };

  it('takes back all credits on a full refund', () => {
    expect(reversalForRefund(charge, purchase)).toMatchObject({
      profile_id: USER,
      delta: -5,
      reason: 'refund',
      external_id: 'refund:ch_1',
    });
  });
  it('does nothing for partial refunds or unmatched charges', () => {
    expect(reversalForRefund({ ...charge, amount_refunded: 100, refunded: false }, purchase)).toBeNull();
    expect(reversalForRefund(charge, null)).toBeNull();
  });
});
