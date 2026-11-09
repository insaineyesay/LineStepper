/**
 * Post packs as the app shows them. The server's copy, which sets the real
 * price, is supabase/functions/_shared/post-packs.ts; a test fails if these
 * drift apart.
 */
export interface PostPackOption {
  id: 'single' | 'five' | 'ten';
  credits: number;
  amountCents: number;
}

export const POST_PACK_OPTIONS: readonly PostPackOption[] = [
  { id: 'single', credits: 1, amountCents: 99 },
  { id: 'five', credits: 5, amountCents: 495 },
  { id: 'ten', credits: 10, amountCents: 990 },
];

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
