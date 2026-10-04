import { useEffect, useMemo, useState } from 'react';
import { Archive, Banknote, CalendarX, FileText, Snowflake } from 'lucide-react';
import LegalPage, { type GlanceItem, type LegalSection } from '../components/legal/LegalPage';
import { describeWindow, getRefundTerms, type RefundTermsState } from '../lib/api/refundTerms';
import { prettyVersion, TERMS_VERSION } from '../lib/legalVersions';
import HouseRulesBlock from '../components/legal/HouseRulesBlock';

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
 *   Refunds             0070, 0073      — the gym's own tiers, and RA 7394's pro-rata floor
 *   Cancel a booking    0016, 0071      — any time before it starts, no forfeit
 *   Account status      0069, 0078      — archived, never deleted; reasons kept
 *
 * The full reasoning, including the sources behind the numbers, is in
 * docs/MEMBERSHIP_POLICY.md. **If that document and this page ever disagree,
 * this page is the one members read** — fix it here first, then there.
 *
 * **The numbers a gym sets are read, never typed** (lib/api/refundTerms.ts):
 * the refund tiers come from the member's gym's `refund_rules`, the processing
 * fee and its reason and the yearly freeze guideline from its `gym_settings`.
 * A reader who is not signed in has no gym, so they are told each gym sets its
 * own and shown the one rule every gym shares: never less than pro-rata.
 */
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });
const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;

/**
 * Section 3's tiers, drawn as a table from the gym's own `refund_rules` — the
 * rows `refund_quote()` reads, in the order it reads them. Two rows are the
 * same for every gym and sit beneath: pro-rata at any time (0073's floor) and
 * the medical case an admin decides.
 */
function RefundTiers({ state }: { state: RefundTermsState }) {
  const rows: { when: string; get: string; share: number | null }[] = [];
  if (state.kind === 'ready') {
    for (const r of state.terms.rules) {
      rows.push({
        when: describeWindow(r),
        get: r.percent >= 100 ? '100% refunded' : r.percent > 0 ? `At least ${pct(r.percent)}` : 'No minimum — pro-rata applies',
        share: r.percent > 0 ? Math.min(100, r.percent) : null,
      });
    }
  }
  rows.push({ when: 'Any time', get: 'The unused part of your term, calculated pro-rata — if that is higher, it is what you are paid', share: null });
  rows.push({ when: 'Medical, with documentation', get: 'Decided by an admin, any amount, with the reason recorded', share: null });

  return (
    <div className="legal-table" role="table" aria-label="Refund tiers">
      {state.kind === 'ready' && (
        <p className="legal-table-cap">
          {state.terms.gymName ? `${state.terms.gymName}'s` : 'Your gym’s'} current minimums
          {state.terms.rules.length === 0 && ' — none are set, so your refund is pro-rata'}
        </p>
      )}
      {state.kind === 'guest' && (
        <p className="legal-table-cap">Each gym sets its own minimum percentages. Sign in and your gym’s appear here.</p>
      )}
      {state.kind === 'failed' && (
        <p className="legal-table-cap">Your gym’s minimum percentages could not be loaded just now. The desk can show you them, and the rule below holds whatever they are.</p>
      )}
      {state.kind === 'loading' && <p className="legal-table-cap">Loading your gym’s minimums…</p>}
      <div className="legal-tr legal-th" role="row">
        <span role="columnheader">When you cancel</span><span role="columnheader">What you get back</span>
      </div>
      {rows.map((t, i) => (
        <div className="legal-tr" role="row" key={t.when} style={{ ['--i' as string]: i }}>
          <span role="cell">{t.when}</span>
          <span role="cell" className="legal-get">
            {t.share !== null && <i className="legal-meter" style={{ ['--share' as string]: t.share / 100 }} aria-hidden="true" />}
            <b>{t.get}</b>
          </span>
        </div>
      ))}
      <p className="legal-table-note">You are paid the higher of your gym’s minimum and pro-rata for the unused term — section 4.</p>
    </div>
  );
}

function feeLine(state: RefundTermsState): string {
  const tail = 'The exact amount, and the rule that produced it, is shown to you before you confirm.';
  if (state.kind !== 'ready') return `A documented processing fee may be deducted. ${tail}`;
  const { fee, feeReason } = state.terms;
  if (fee <= 0) return `Your gym deducts no processing fee. ${tail}`;
  return `A processing fee of ${peso(fee)} is deducted${feeReason ? ` (${feeReason})` : ''}. ${tail}`;
}

function freezeLine(state: RefundTermsState): string {
  const n = state.kind === 'ready' ? state.terms.maxFreezeDaysPerYear : null;
  return `The desk is shown how many frozen days you have used this year (${n !== null ? `${n} is your gym’s guideline` : 'your gym sets the guideline'}). Anything beyond the usual limits is an admin decision, made on the record.`;
}

const buildSections = (state: RefundTermsState): LegalSection[] => [
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
      freezeLine(state),
    ],
  },
  {
    id: 'refunds',
    title: '3. Cancelling, and what you get back',
    lead: <RefundTiers state={state} />,
    body: [
      'Days are counted from the start date of your membership, in Manila time — not from the day you paid.',
      feeLine(state),
      'Refunds are paid in cash at the desk.',
    ],
  },
  {
    id: 'floor',
    title: '4. Why those percentages are a floor',
    body: 'Republic Act 7394, the Consumer Act of the Philippines, expects the unused portion of something you prepaid to come back to you. The percentages above are the minimum the gym pays; where a pro-rata calculation comes out higher, you are paid the higher figure. Lowering a tier cannot reduce a payout below what the law expects.',
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
    lead: <HouseRulesBlock />,
    body: [
      'Proper gym attire and footwear are required.',
      'Return equipment to where you found it.',
      'Respect other members and keep the space clean.',
      'No photography or video of other people without their permission.',
      'Your gym may add house rules of its own. They are shown here, dated and numbered, and you are asked to agree to each new version. They can never be changed after they are published — a change is a new version.',
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
  const [state, setState] = useState<RefundTermsState>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    // Wrapped, so the set-state-in-effect rule does not follow the call into setState.
    (async () => {
      try {
        const next = await getRefundTerms();
        if (alive) setState(next);
      } catch {
        if (alive) setState({ kind: 'failed' });
      }
    })();
    return () => { alive = false; };
  }, []);
  const sections = useMemo(() => buildSections(state), [state]);

  return (
    <LegalPage
      title="Terms of Service"
      icon={FileText}
      updated={prettyVersion(TERMS_VERSION)}
      agreement="member_terms"
      framework="RA 7394"
      intro="By using the gym and this app you agree to these terms. They describe what the system actually does — every rule below is one the app or the database enforces, and nothing here is a rule you will find out about only after it costs you money."
      glance={glance}
      sections={sections}
      contactLead="Questions about any of this?"
      other={{ to: '/privacy', label: 'Privacy Policy', blurb: 'What the gym holds about you, and who can see it.' }}
    />
  );
}
