import { Ban, Download, EyeOff, Shield, UserCheck } from 'lucide-react';
import LegalPage, { type GlanceItem, type LegalSection } from '../components/legal/LegalPage';
import { prettyVersion, PRIVACY_VERSION } from '../lib/legalVersions';

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
const sections: LegalSection[] = [
  {
    id: 'holds',
    title: '1. What the gym holds about you',
    body: [
      'Your name, email, phone, address and date of birth, and an emergency contact.',
      'Your check-in code, and every check-in made with it.',
      'Payments recorded at the desk — amount, method and date. No card or bank details, because the gym does not take them.',
      'Anything you choose to log: workouts, measurements, goals, and how you rate a coach.',
      'If your gym asks you to sign its waiver: which version you signed and when, and your answers to the seven health questions that come with it. Health answers are sensitive personal information under RA 10173, and are treated as such below.',
      'If you turn on notifications, the token your phone needs to receive them. You can turn it off again in Settings.',
    ],
  },
  {
    id: 'who',
    title: '2. Who can see it',
    body: [
      'You.',
      'The gym owner and the front desk, who need it to run the gym.',
      'Your trainer sees only what you allow. Measurements, goals, and workouts with your saved routines are each a switch in Settings, and the database itself refuses a trainer the rest — it is not a hidden screen, it is a rule they cannot get around. Progress photos are private to you: only the coaches you train with can see them, and only if you switch on sharing on the Progress photos screen — the gym owner and the front desk never can, and a photo you hand in to a coach as classwork is seen by that coach alone. Your training plan — the days you mean to come in — is visible to the coaches you train with, so they can plan around it, and so is your emergency contact, so a coach can call someone if you are hurt in a session.',
      'Your answers to the health questions are seen by the gym owner and the front desk only — not by trainers, whatever your other switches say. A "yes" tells the desk to talk to you before you train hard. It does not stop you training, and nothing in the app changes your workouts because of it.',
      'Nobody else. The gym does not sell, rent or trade any of it.',
    ],
  },
  {
    id: 'ratings',
    title: '3. Ratings you give a coach are anonymous to them',
    body: 'A coach sees their scores and what was written, with no name attached — the database gives them a view that does not contain who wrote it. The gym can see the name, because a complaint nobody can follow up is not something a gym can act on, and one member quietly rating every coach one star is something it should be able to notice.',
  },
  {
    id: 'where',
    title: '4. Where it is kept',
    body: 'In a hosted PostgreSQL database (Supabase, Singapore region) reached over HTTPS, with the app itself served from Vercel. Access is enforced per row in the database, so a screen that forgets to filter still cannot show you somebody else\'s records. Your password is never stored by the gym — it is held, hashed, by the authentication service.',
  },
  {
    id: 'not',
    title: '5. What this app does not do',
    body: [
      'No advertising, and no advertising identifiers.',
      'No analytics or usage tracking, and no third-party tracking scripts.',
      'No payment processor — you pay the gym in cash at the desk or, where it offers it, from your own GCash, Maya or bank app. If you pay that way, the reference number and the screenshot you send are kept with your request, seen only by the gym\'s owner and front desk, to confirm it.',
      'The in-app assistant answers questions about your membership, bookings and the gym from fixed rules, in the app. At gyms and on plans that include the AI coach, questions the rules cannot answer are sent to Anthropic, the company that runs the model, to be answered. The coach sees your first name, goals, experience level, routines, your weekly plan and how often you have trained lately, only if you say yes when it first asks (Settings changes it); it never sees your health questionnaire (PAR-Q) or waiver answers, payments, contact details, chats with coaches or photos. What you tell the coach when it sets you up — your goal, experience, how often and how long you train, your equipment, what you enjoy or avoid, and whether something hurts (a yes or no, never the details) — is kept for the coach and sent to Anthropic with each question you ask it, even if you do not let it read your training. Your conversations are kept in the gym\'s database, visible only to you, and you can delete them. The coach can suggest changes to your routines, your weekly plan and your goals; nothing changes until you tap Apply, and you can undo a change afterwards. The gym\'s coaches and front desk can see which of your routines and plan days were made by the coach (a small mark on them), never your conversation. Meal guides were removed on 5 October 2026; one you applied before then is kept only in your own data export, and nobody else sees it.',
    ],
  },
  {
    id: 'rights',
    title: '6. Your rights under RA 10173',
    body: [
      'See what is held about you: Settings → Your data downloads a copy of all of it as one file, and the front desk can give you the same file. Have anything wrong corrected — most details you can change yourself in Edit profile; ask at the desk for the rest and it is fixed the same day.',
      'Object to receiving announcements: notification preferences are yours, in Settings.',
      'Complain to the National Privacy Commission if the gym gets this wrong.',
      'Deletion has a limit worth stating plainly: an account is archived rather than erased, because attendance and payment history are the gym\'s own accounting records. Archiving ends access and hides you from the roster; the records behind it stay.',
    ],
  },
  {
    id: 'kept',
    title: '7. How long it is kept',
    body: 'For as long as you are a member, and afterwards for as long as the gym needs its own financial and attendance records. What you logged for yourself — workouts, measurements, goals — is kept with your account so your history is still there if you come back.',
  },
  {
    id: 'minors',
    title: '8. Under 18',
    body: 'A member under 18 needs a parent or guardian to sign them up and to agree to this policy at the desk.',
  },
  {
    id: 'changes',
    title: '9. Changes to this policy',
    body: 'If this changes in a way that matters, it is announced in the app and the date above changes with it.',
  },
];

const glance: GlanceItem[] = [
  { icon: EyeOff, label: 'Never sold', detail: 'The gym does not sell, rent or trade any of it.', to: 'who' },
  { icon: UserCheck, label: 'Trainers see what you allow', detail: 'A rule in the database, not a hidden screen.', to: 'who' },
  { icon: Ban, label: 'No ads, no tracking', detail: 'No analytics and no third-party tracking scripts.', to: 'not' },
  { icon: Download, label: 'A copy is yours', detail: 'Settings → Your data downloads all of it.', to: 'rights' },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      icon={Shield}
      updated={prettyVersion(PRIVACY_VERSION)}
      agreement="member_privacy"
      framework="RA 10173"
      intro="This describes what the gym actually holds and who can actually reach it — not a list of things a policy is expected to say. Written to the Data Privacy Act of 2012 (RA 10173)."
      glance={glance}
      sections={sections}
      contactLead="Something to correct, or to complain about?"
      other={{ to: '/terms', label: 'Terms of Service', blurb: 'Freezing, refunds, bookings and your account.' }}
    />
  );
}
