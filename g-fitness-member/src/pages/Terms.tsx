import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import GymContact from '../components/ui/GymContact';

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
const sections: { title: string; body: string | string[] }[] = [
  {
    title: '1. Your membership',
    body: 'Membership gives you access to the gym during posted opening hours. The gym is cash-only by design: membership is paid at the front desk, and nothing in this app takes payment or holds card details. What the app shows you is the record of what the desk entered.',
  },
  {
    title: '2. Freezing your membership',
    body: [
      'You may freeze twice in a calendar month. A reason is required.',
      'While frozen you cannot check in or book — a freeze pauses the membership, not attendance alone.',
      'Frozen days are added back to your expiry date, so you are not charged for days you were denied access.',
      'The desk is shown how many frozen days you have used this year (60 is the guideline). Anything beyond the usual limits is an admin decision, made on the record.',
    ],
  },
  {
    title: '3. Cancelling, and what you get back',
    body: [
      'Within 7 days and you have not checked in once: 100% refunded.',
      'Within 7 days and you have checked in: 50%.',
      'Between 8 and 30 days: 25%.',
      'After 30 days: the unused part of your term, calculated pro-rata.',
      'Medical, with documentation: decided by an admin, any amount, with the reason recorded.',
      'Days are counted from the start date of your membership, in Manila time — not from the day you paid.',
      'A documented processing fee may be deducted. The exact amount, and the rule that produced it, is shown to you before you confirm.',
      'Refunds are paid in cash at the desk.',
    ],
  },
  {
    title: '4. Why those percentages are a floor',
    body: 'Republic Act 7394, the Consumer Act of the Philippines, expects the unused portion of something you prepaid to come back to you. The tiers above are the minimum the gym pays; where a pro-rata calculation comes out higher, you are paid the higher figure. Lowering a tier cannot reduce a payout below what the law expects.',
  },
  {
    title: '5. Classes and personal training',
    body: [
      'You can cancel a class or a session yourself while it is still pending or booked. There is no cut-off and nothing is forfeited for cancelling late — please just tell your coach, so the slot goes to somebody else.',
      'You cannot be booked into two things at once. A class that overlaps a session you already have is refused, and the app says which booking it clashes with.',
      'Coaches accept or decline their own requests, oldest request first. An admin can reverse a decision.',
      'If a request sits unanswered, the system chases it: your coach after a day, you after two, and an admin after three, so a request cannot quietly expire.',
    ],
  },
  {
    title: '6. Using the gym',
    body: [
      'Proper gym attire and footwear are required.',
      'Return equipment to where you found it.',
      'Respect other members and keep the space clean.',
      'No photography or video of other people without their permission.',
    ],
  },
  {
    title: '7. Health and safety',
    body: 'You use the facilities at your own risk. Talk to a doctor before starting a new programme, and report injuries or broken equipment immediately. The plans and suggestions in this app are generated from fixed rules, not by a medical professional, and they are not medical advice. If you tell the app about an injury it will point you to a professional rather than quietly change your exercises.',
  },
  {
    title: '8. Conduct',
    body: 'Harassment and abusive behaviour are not tolerated, and can end a membership immediately. Ending it does not cancel the refund rules in section 3 — a suspension is recorded with a reason, and the amount owed is worked out the same way it would be for anyone else.',
  },
  {
    title: '9. Your account',
    body: 'Accounts are archived, never deleted: your attendance and payment history are the gym\'s own records and it has to keep them. If your account is suspended, the reason is recorded, and you are told what it is rather than being met with a locked door and no explanation.',
  },
  {
    title: '10. Changes to these terms',
    body: 'These terms can change. Significant changes are announced in the app rather than quietly edited in, and the date above is updated when they are.',
  },
];

export default function Terms() {
  const navigate = useNavigate();
  return (
    <MobileFrame>
      <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
        <div className="flex-1 flex flex-col px-6 py-6 overflow-hidden">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-3 mb-6 flex-shrink-0">
              <button onClick={() => navigate(-1)}
                className="p-1.5 rounded-lg"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <ArrowLeft size={18} />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: 'var(--color-secondary)' }}>
                  <FileText size={20} className="text-black" />
                </div>
                <h1 className="text-2xl font-bold text-white">Terms of Service</h1>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3" style={{ color: 'var(--color-text-secondary)' }}>
              <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Last updated: 14 September 2026</p>
                <p className="text-sm leading-relaxed">
                  By using the gym and this app you agree to these terms. They describe what the
                  system actually does — every rule below is one the app or the database enforces,
                  and nothing here is a rule you will find out about only after it costs you money.
                </p>
              </div>

              {sections.map((s) => (
                <div key={s.title} className="rounded-xl p-4"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                  <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-secondary)' }} />
                    {s.title}
                  </h2>
                  {Array.isArray(s.body) ? (
                    <ul className="text-sm space-y-1.5">
                      {s.body.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="mt-1" style={{ color: 'var(--color-secondary)' }}>•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm leading-relaxed">{s.body}</p>
                  )}
                </div>
              ))}

              <GymContact lead="Questions about any of this?" accent="var(--color-secondary)" />
              <div className="h-6" />
            </div>
          </motion.div>
        </div>
      </div>
    </MobileFrame>
  );
}
