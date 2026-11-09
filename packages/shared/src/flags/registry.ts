/**
 * Feature flag registry — the single source of truth for every flag in the
 * PRD (Addendum B2 + B5). Mobile, web and API all import this list, so a flag
 * is declared once and its MVP1 default lives next to it.
 *
 * Flags are enforced on the server. The client copy only hides UI; it is
 * never the thing that keeps a disabled feature unreachable.
 */
export const FLAG_REGISTRY = {
  // Events
  'events.core': { default: true, description: 'Post events with date, time, location, details' },
  'events.reminders': { default: true, description: 'Reminders before an event' },
  'events.change_alerts': { default: true, description: 'Alerts when a date changes or an event is cancelled' },
  'events.paid_posting': { default: true, description: 'Publishing an event costs one $0.99 post credit' },

  // Booking & payments (built, off for MVP1)
  booking: { default: false, description: 'Reserve spots, capacity' },
  'payments.tickets': { default: false, description: 'Paying for events in the app', requires: ['booking'] },
  'payments.refunds': { default: false, description: 'Refund requests and processing', requires: ['payments.tickets'] },
  'payments.payouts': { default: false, description: 'Creator payouts', requires: ['payments.tickets'] },
  waitlist: { default: false, description: 'Waitlists for full events', requires: ['booking'] },

  // Tickets
  'tickets.qr': { default: false, description: 'QR code tickets and scanning', requires: ['booking'] },
  'tickets.wallet': { default: false, description: 'Apple / Google Wallet passes', requires: ['booking'] },
  'tickets.confirmation_code': { default: false, description: 'Confirmation code by email / text', requires: ['booking'] },
  checkin: { default: false, description: 'Scanning and attendance', requires: ['booking'] },

  // Trust & safety
  'reviews.verified': { default: false, description: 'Reviews require a scanned check-in', requires: ['checkin'] },
  age_gates: { default: false, description: 'Age check at sign-up, age-restricted events' },

  // Notifications
  'notify.email': { default: true, description: 'Email notifications' },
  'notify.push': { default: true, description: 'Push notifications' },
  'notify.sms': { default: false, description: 'Text messages (costs per message)' },

  // Log connectors (B5). stdout is always on and has no flag.
  'log.connector.papertrail': { default: true, description: 'Ship server logs to Papertrail' },
  'log.connector.sentry': { default: true, description: 'Ship warnings and errors to Sentry' },
} as const satisfies Record<string, FlagDefinition>;

export interface FlagDefinition {
  default: boolean;
  description: string;
  /** Flags that must also be on for this one to take effect. */
  requires?: readonly string[];
}

export type FlagKey = keyof typeof FLAG_REGISTRY;
export type FlagValues = Record<FlagKey, boolean>;

export const FLAG_KEYS = Object.keys(FLAG_REGISTRY) as FlagKey[];

export function isFlagKey(key: string): key is FlagKey {
  return Object.prototype.hasOwnProperty.call(FLAG_REGISTRY, key);
}
