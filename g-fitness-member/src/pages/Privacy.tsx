import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import GymContact from '../components/ui/GymContact';

/**
 * What the gym holds, who can see it, and what it does not do.
 *
 * Rewritten 2026-09-14 for the same reason as Terms: the boilerplate described
 * a different company. It named **payment processors** as a category of people
 * the gym shares data with, in a business that takes nothing but cash; claimed
 * "regular security audits"; offered **deletion** of your data when members are
 * archived precisely so the gym keeps its own books; offered a data **export**
 * the app does not have; and described cookies "to analyse usage patterns",
 * which nothing here does. Every one of those is a claim an IT expert can
 * disprove in about a minute, and two of them are promises the gym would then
 * be unable to keep.
 *
 * It also left out the one genuinely unusual thing this system does, which is
 * 0032: **a member decides what their trainer can see**, enforced in row-level
 * security rather than by hiding a screen. That is the paragraph worth reading.
 *
 * Framed against RA 10173, the Data Privacy Act of 2012, the way
 * docs/MEMBERSHIP_POLICY.md is framed against RA 7394.
 */
const sections: { title: string; body: string | string[] }[] = [
  {
    title: '1. What the gym holds about you',
    body: [
      'Your name, email, phone, address and date of birth, and an emergency contact.',
      'Your check-in code, and every check-in made with it.',
      'Payments recorded at the desk — amount, method and date. No card or bank details, because the gym does not take them.',
      'Anything you choose to log: workouts, measurements, goals, and how you rate a coach.',
      'If you turn on notifications, the token your phone needs to receive them. You can turn it off again in Settings.',
    ],
  },
  {
    title: '2. Who can see it',
    body: [
      'You.',
      'The gym owner and the front desk, who need it to run the gym.',
      'Your trainer sees only what you allow. Measurements, goals, and workouts with your saved routines are each a switch in Settings, and the database itself refuses a trainer the rest — it is not a hidden screen, it is a rule they cannot get around. Your training plan — the days you mean to come in — is visible to the coaches you train with, so they can plan around it, and so is your emergency contact, so a coach can call someone if you are hurt in a session.',
      'Nobody else. The gym does not sell, rent or trade any of it.',
    ],
  },
  {
    title: '3. Ratings you give a coach are anonymous to them',
    body: 'A coach sees their scores and what was written, with no name attached — the database gives them a view that does not contain who wrote it. The gym can see the name, because a complaint nobody can follow up is not something a gym can act on, and one member quietly rating every coach one star is something it should be able to notice.',
  },
  {
    title: '4. Where it is kept',
    body: 'In a hosted PostgreSQL database (Supabase, Singapore region) reached over HTTPS, with the app itself served from Vercel. Access is enforced per row in the database, so a screen that forgets to filter still cannot show you somebody else\'s records. Your password is never stored by the gym — it is held, hashed, by the authentication service.',
  },
  {
    title: '5. What this app does not do',
    body: [
      'No advertising, and no advertising identifiers.',
      'No analytics or usage tracking, and no third-party tracking scripts.',
      'No payment processor — payment happens in cash, at the desk.',
      'The in-app assistant answers from fixed rules, in the app, using your own data — your membership, your bookings and the gym\'s prices never leave it. If the gym switches on the optional model fallback for general fitness questions, the only thing that leaves is the question you typed.',
    ],
  },
  {
    title: '6. Your rights under RA 10173',
    body: [
      'See what is held about you: Settings → Your data downloads a copy of all of it as one file, and the front desk can give you the same file. Have anything wrong corrected — most details you can change yourself in Edit profile; ask at the desk for the rest and it is fixed the same day.',
      'Object to receiving announcements: notification preferences are yours, in Settings.',
      'Complain to the National Privacy Commission if the gym gets this wrong.',
      'Deletion has a limit worth stating plainly: an account is archived rather than erased, because attendance and payment history are the gym\'s own accounting records. Archiving ends access and hides you from the roster; the records behind it stay.',
    ],
  },
  {
    title: '7. How long it is kept',
    body: 'For as long as you are a member, and afterwards for as long as the gym needs its own financial and attendance records. What you logged for yourself — workouts, measurements, goals — is kept with your account so your history is still there if you come back.',
  },
  {
    title: '8. Under 18',
    body: 'A member under 18 needs a parent or guardian to sign them up and to agree to this policy at the desk.',
  },
  {
    title: '9. Changes to this policy',
    body: 'If this changes in a way that matters, it is announced in the app and the date above changes with it.',
  },
];

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <MobileFrame>
      <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
        <div className="flex-1 flex flex-col px-6 py-6 overflow-hidden">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 flex-shrink-0">
              <button onClick={() => navigate(-1)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <ArrowLeft size={18} />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: 'var(--color-primary)' }}>
                  <Shield size={20} className="text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Privacy Policy</h1>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3"
              style={{ color: 'var(--color-text-secondary)' }}>
              <div className="rounded-xl p-4" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Last updated: 19 September 2026</p>
                <p className="text-sm leading-relaxed">
                  This describes what the gym actually holds and who can actually reach it — not a
                  list of things a policy is expected to say. Written to the Data Privacy Act of
                  2012 (RA 10173).
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

              <GymContact lead="Something to correct, or to complain about?" accent="var(--color-primary)" />
              <div className="h-6" />
            </div>
          </motion.div>
        </div>
      </div>
    </MobileFrame>
  );
}
