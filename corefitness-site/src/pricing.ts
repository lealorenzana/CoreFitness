/**
 * What Core Fitness charges a gym.
 *
 * **The numbers are the owner's to set, and are not invented here.** A price
 * with no decision behind it is a claim the business has not made — the same
 * rule the apps follow about plans and point rules (CLAUDE.md: copy is a
 * claim). While `monthly` is null the card says "Talk to us" and the form still
 * works, which is the honest state of a service whose pricing is not fixed yet.
 *
 * Set a number here, redeploy, and the page says it.
 */
export interface Tier {
  key: 'trial' | 'standard' | 'premium';
  name: string;
  /** Pesos per month. null = not decided yet. */
  monthly: number | null;
  line: string;
  includes: string[];
}

export const TIERS: Tier[] = [
  {
    key: 'trial',
    name: 'Free trial',
    monthly: 0,
    line: 'Thirty days, the whole system, no card.',
    includes: [
      'Every feature below',
      'Your members keep whatever they log',
      'Stop whenever — nothing is deleted',
    ],
  },
  {
    key: 'standard',
    name: 'Standard',
    monthly: null,
    line: 'One gym, everything it needs to run a day.',
    includes: [
      'Members, memberships and cash payments',
      'QR check-in and the front-desk kiosk',
      'Classes, bookings and the waitlist',
      'Your own plans, prices and refund rules',
      'The phone app for your members and coaches',
    ],
  },
  {
    key: 'premium',
    name: 'Premium',
    monthly: null,
    line: 'For a gym that wants the coaching side too.',
    includes: [
      'Everything in Standard',
      'Coaches with their own app, hours and bookings',
      'Points, rewards, badges and challenges',
      'Progress, goals and workout tracking',
      'Announcements and reminders to phones',
    ],
  },
];
