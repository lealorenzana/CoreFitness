import { Archive, Banknote, CalendarX, FileText, Snowflake } from 'lucide-react';
import LegalPage, { type GlanceItem, type LegalSection } from '../components/legal/LegalPage';

/**
 * The terms the gym actually operates by.
 *
 * This page used to be boilerplate, and boilerplate here is not a cosmetic
 * problem — it was **contradicting the system**. It said membership fees are
 * "non-refundable" while `refund_quote()` (0073) computes a pro-rata payout the
 * desk is required to pay; it invented a 30-day written-notice rule and early
 * termination fees that exist nowhere; it promised to forfeit a personal
 * training session cancelled inside 24 hours, which nothing enforces; and it
 * said nothing at all about freezing, which is the option most members actually
 * want. A member who read it would have been told they were owed nothing.
 *
 * So every clause below is now traceable to something that runs:
 *
 *   Freezing            0057, 0070      — twice a month, reason required
 *   Refunds             0070, 0073      — the tiers, and RA 7394's pro-rata floor
 *   Cancel a booking    0016, 0071      — any time before it starts, no forfeit
 *   Account status      0069, 0078      — archived, never deleted; reasons kept
 *
 * The full reasoning, including the sources behind the numbers, is in
 * docs/MEMBERSHIP_POLICY.md. **If that document and this page ever disagree,
 * this page is the one members read** — fix it here first, then there.
 */
/**
 * Section 3's five tiers, drawn as a table. The same five statements the list
 * used to make, word for word in meaning — a picture of the rule, not a new one.
 * The bar is the share refunded; the two rows without a fixed share have none.
 */
const TIERS: { when: string; get: string; share: number | null }[] = [
  { when: 'Within 7 days, and you have not checked in once', get: '100% refunded', share: 100 },
  { when: 'Within 7 days, and you have checked in', get: '50%', share: 50 },
  { when: 'Between 8 and 30 days', get: '25%', share: 25 },
  { when: 'After 30 days', get: 'The unused part of your term, calculated pro-rata', share: null },
  { when: 'Medical, with documentation', get: 'Decided by an admin, any amount, with the reason recorded', share: null },
];

function RefundTiers() {
  return (
    <div className="legal-table" role="table" aria-label="Refund tiers">
      <div className="legal-tr legal-th" role="row">
        <span role="columnheader">When you cancel</span><span role="columnheader">What you get back</span>
      </div>
      {TIERS.map((t, i) => (
        <div className="legal-tr" role="row" key={t.when} style={{ ['--i' as string]: i }}>
          <span role="cell">{t.when}</span>
          <span role="cell" className="legal-get">
            {t.share !== null && <i className="legal-meter" style={{ ['--share' as string]: t.share / 100 }} aria-hidden="true" />}
            <b>{t.get}</b>
          </span>
        </div>
      ))}
      <p className="legal-table-note">Where pro-rata for the unused term comes out higher, you are paid the higher figure — section 4.</p>
    </div>
  );
}

const sections: LegalSection[] = [
  {
    id: 'membership',
    title: '1. Your membership',
    body: 'Membership gives you access to the gym during posted opening hours. The gym is cash-only by design: membership is paid at the front desk, and nothing in this app takes payment or holds card details. What the app shows you is the record of what the desk entered.',
  },
  {
    id: 'freezing',
    title: '2. Freezing your membership',
    body: [
      'You may freeze twice in a calendar month. A reason is required.',
      'While frozen you cannot check in or book — a freeze pauses the membership, not attendance alone.',
      'Frozen days are added back to your expiry date, so you are not charged for days you were denied access.',
      'The desk is shown how many frozen days you have used this year (60 is the guideline). Anything beyond the usual limits is an admin decision, made on the record.',
    ],
  },
  {
    id: 'refunds',
    title: '3. Cancelling, and what you get back',
    lead: <RefundTiers />,
    body: [
      'Days are counted from the start date of your membership, in Manila time — not from the day you paid.',
      'A documented processing fee may be deducted. The exact amount, and the rule that produced it, is shown to you before you confirm.',
      'Refunds are paid in cash at the desk.',
    ],
  },
  {
    id: 'floor',
    title: '4. Why those percentages are a floor',
    body: 'Republic Act 7394, the Consumer Act of the Philippines, expects the unused portion of something you prepaid to come back to you. The tiers above are the minimum the gym pays; where a pro-rata calculation comes out higher, you are paid the higher figure. Lowering a tier cannot reduce a payout below what the law expects.',
  },
  {
    id: 'classes',
    title: '5. Classes and personal training',
    body: [
      'You can cancel a class or a session yourself while it is still pending or booked. There is no cut-off and nothing is forfeited for cancelling late — please just tell your coach, so the slot goes to somebody else.',
      'You cannot be booked into two things at once. A class that overlaps a session you already have is refused, and the app says which booking it clashes with.',
      'Coaches accept or decline their own requests, oldest request first. An admin can reverse a decision.',
      'If a request sits unanswered, the system chases it: your coach after a day, you after two, and an admin after three, so a request cannot quietly expire.',
    ],
  },
  {
    id: 'using',
    title: '6. Using the gym',
    body: [
      'Proper gym attire and footwear are required.',
      'Return equipment to where you found it.',
      'Respect other members and keep the space clean.',
      'No photography or video of other people without their permission.',
    ],
  },
  {
    id: 'health',
    title: '7. Health and safety',
    body: 'You use the facilities at your own risk. Talk to a doctor before starting a new programme, and report injuries or broken equipment immediately. The plans and suggestions in this app are generated from fixed rules, not by a medical professional, and they are not medical advice. If you tell the app about an injury it will point you to a professional rather than quietly change your exercises.',
  },
  {
    id: 'conduct',
    title: '8. Conduct',
    body: 'Harassment and abusive behaviour are not tolerated, and can end a membership immediately. Ending it does not cancel the refund rules in section 3 — a suspension is recorded with a reason, and the amount owed is worked out the same way it would be for anyone else.',
  },
  {
    id: 'account',
    title: '9. Your account',
    body: 'Accounts are archived, never deleted: your attendance and payment history are the gym\'s own records and it has to keep them. If your account is suspended, the reason is recorded, and you are told what it is rather than being met with a locked door and no explanation.',
  },
  {
    id: 'changes',
    title: '10. Changes to these terms',
    body: 'These terms can change. Significant changes are announced in the app rather than quietly edited in, and the date above is updated when they are.',
  },
];

const glance: GlanceItem[] = [
  { icon: Snowflake, label: 'Freeze twice a month', detail: 'Frozen days are added back to your expiry.', to: 'freezing' },
  { icon: Banknote, label: 'Refunds have a floor', detail: 'The tiers are a minimum — pro-rata wins when higher.', to: 'refunds' },
  { icon: CalendarX, label: 'Cancel bookings freely', detail: 'No cut-off, and nothing is forfeited.', to: 'classes' },
  { icon: Archive, label: 'Archived, never deleted', detail: 'A suspension always comes with its reason.', to: 'account' },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      icon={FileText}
      updated="14 September 2026"
      framework="RA 7394"
      intro="By using the gym and this app you agree to these terms. They describe what the system actually does — every rule below is one the app or the database enforces, and nothing here is a rule you will find out about only after it costs you money."
      glance={glance}
      sections={sections}
      contactLead="Questions about any of this?"
      other={{ to: '/privacy', label: 'Privacy Policy', blurb: 'What the gym holds about you, and who can see it.' }}
    />
  );
}
