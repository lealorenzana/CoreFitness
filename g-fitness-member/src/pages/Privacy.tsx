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
      'Your login: the email and, if you choose one, a username you sign in with. The front desk may make your login for you — with an email or, if you have none, a username — and hand you a one-time password on a printed slip; you choose your own password the first time you sign in, and only then does the slip stop working. The password you choose is never shown to the gym: only a scrambled form of it is kept.',
      'Your profile photo, if you add one — at sign-up or later. The desk and your coach see it, so they know you at the door. You can change or remove it in Profile.',
      'Your check-in code, and every check-in made with it.',
      'Payments — amount, method and date, whether recorded at the desk or paid in the app. No card or bank details: the gym never receives them.',
      'Anything you choose to log: workouts, measurements, goals, and how you rate a coach.',
      'If your gym asks you to sign its waiver: which version you signed and when, and your answers to the seven health questions that come with it. Health answers are sensitive personal information under RA 10173, and are treated as such below.',
      'If your gym runs a gym chat: the messages and photos you post there, your reactions, and any message you report. If it posts reels: which ones you liked.',
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
      'The coaches you train with now — a coaching term, a 1-on-1 or a class of theirs in the last 60 days — are told when you make a streak milestone or finish a challenge, and when you set a record or reach a target if you share workouts or goals with trainers, so they can congratulate you. They see what you reached, never more than your switches already allow.',
      'Your answers to the health questions are seen by the gym owner and the front desk only — not by trainers, whatever your other switches say. A "yes" tells the desk to talk to you before you train hard. It does not stop you training, and nothing in the app changes your workouts because of it.',
      'If you switch gyms (Gyms → Switch gym), and only once you agree on that screen, your workouts and sets, records, routines, weekly plan, body readings, targets, progress photos, earned level and training badges move to the new gym when it accepts you — each gym keeps its own records, so the new gym then holds them. Your payments, visits, points and visit badges stay with the old gym, which is told only that you switched to another gym, never which.',
      'The gym chat, if your gym runs one, is a group: everyone in it — the gym\'s active members, its coaches, the front desk and the owner — sees your name, your photo, what you post, your reactions and that you have seen the newest message. Photos posted there open only for people in the chat. A message you report is seen with your name by the owner and the front desk only. When you remove a message, or the gym removes one, its words and photo are erased and only "Message removed" stays in its place. A like on a reel is counted for everyone; who liked it is not shown.',
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
    body: 'In a hosted PostgreSQL database (Supabase, Singapore region) reached over HTTPS, with the app itself served from Vercel. Access is enforced per row in the database, so a screen that forgets to filter still cannot show you somebody else\'s records. Your password is never stored by the gym — it is held, hashed, by the authentication service. If you sign up or sign in with Google, Google tells us your name, email address and profile picture, and nothing else; there is then no password with us at all, and the rest of your details are the ones you type in. So the app still works with no signal, your phone also keeps a copy of what your screens last showed, and anything you saved or sent offline until it reaches the database. That copy is filed under your account, is never shown to anyone else who signs in on the same phone, and the saved screens are erased when you log out; anything you saved offline and had not yet sent stays on the phone, still yours, and goes the next time you sign in there.',
  },
  {
    id: 'not',
    title: '5. What this app does not do',
    body: [
      'No advertising, and no advertising identifiers.',
      'No analytics or usage tracking, and no third-party tracking scripts.',
      'Paying in the app — only where your gym has connected PayMongo, a licensed payment company. PayMongo then receives what the payment needs: your name, email, the amount and how you pay (card details go to PayMongo only, never to the gym or this app). Otherwise you pay the gym in cash at the desk or, where it offers it, from your own GCash, Maya or bank app; if you pay that way, the reference number and the screenshot you send are kept with your payment record.',
      'The in-app assistant answers questions about your membership, bookings and the gym from fixed rules, in the app. At gyms and on plans that include the AI assistant, questions the rules cannot answer are sent to Anthropic, the company that runs the model, to be answered. The assistant sees your first name, goals, how much you train, routines, your weekly plan and how often you have trained lately, only if you say yes when it first asks (Settings changes it); it never sees your health questionnaire (PAR-Q) or waiver answers, payments, contact details, chats with coaches or photos. What you tell the assistant when it sets you up — your goal, experience, how often and how long you train, your equipment, what you enjoy or avoid, and whether something hurts (a yes or no, never the details) — is kept for the assistant and sent to Anthropic with each question you ask it, even if you do not let it read your training. Your conversations are kept in the gym\'s database, visible only to you, and you can delete them. The assistant can suggest changes to your routines, your weekly plan and your goals; nothing changes until you tap Apply, and you can undo a change afterwards. The gym\'s coaches and front desk can see which of your routines and plan days were made by the assistant (a small mark on them), never your conversation. Meal guides were removed on 5 October 2026; one you applied before then is kept only in your own data export, and nobody else sees it.',
    ],
  },
  {
    id: 'rights',
    title: '6. Your rights under RA 10173',
    body: [
      'See what is held about you: Settings → Your data downloads a copy of all of it as one file, and the front desk can give you the same file. Have anything wrong corrected — most details you can change yourself in Edit profile; ask at the desk for the rest and it is fixed the same day.',
      'Object to receiving announcements: notification preferences are yours, in Settings.',
      'Complain to the National Privacy Commission if the gym gets this wrong.',
      'Delete your account: Settings → Your data → Delete my account. It is locked at once and erased after 7 days — sign back in within them to keep it. Erasing removes your name, email, phone, photo, address, birthday, emergency contact, workouts, routines, programs, plans, measurements, targets, records, progress photos, chats, assistant conversations, health (PAR-Q) answers, badges and notifications, and closes your sign-in. One limit, stated plainly: your payments, receipts, memberships and visits are the gym\'s own accounting records, so they stay — under the name "Deleted member", with nothing left that says who you were. When the gym itself closes your account, it is archived instead: access ends, you leave the roster, and the records behind it stay.',
    ],
  },
  {
    id: 'kept',
    title: '7. How long it is kept',
    body: 'For as long as you are a member, and afterwards for as long as the gym needs its own financial and attendance records. What you logged for yourself — workouts, measurements, goals — is kept with your account so your history is still there if you come back — until you delete your account, when it is erased 7 days later (section 6). That includes what you posted in the gym chat and any reels you posted: they are erased with the account.',
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
