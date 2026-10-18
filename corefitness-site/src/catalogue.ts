import type { IconName } from './Icon';

/**
 * Everything inside Core Fitness, by who it serves — the list a gym owner reads
 * to see what they get. Each line is something the apps do today (CLAUDE.md
 * and docs/MIGRATION_STATUS.md are the record); nothing here is a roadmap.
 * When a feature ships, add its line here in the same commit.
 */
export interface CatalogueGroup { id: string; icon: IconName; title: string; lede: string; items: [string, string][] }

export const CATALOGUE: CatalogueGroup[] = [
  {
    id: 'desk', icon: 'desk', title: 'Front desk and money',
    lede: 'The counter, the drawer and the rules behind them.',
    items: [
      ['Members and memberships', 'Plans you price, renewals that run on from the end date, and members archived — never deleted.'],
      ['Payments with receipts', 'Cash at the desk with a receipt number that can never repeat, and a drawer that closes out each day.'],
      ['Paid in the app', 'QRPh, GCash, Maya or card through your own PayMongo account — renewals and coaching recorded the moment they are paid.'],
      ['Reference payments', 'Members can also send a GCash or bank reference with a screenshot; the desk confirms it, and a reference is claimed only once.'],
      ['Freeze, cancel and refunds', 'Members ask with a reason; refunds follow your tiers and never fall below pro-rata for the unused term.'],
      ['Walk-ins and day passes', 'Guests pay for a day or a 5- or 10-visit pack by phone number, or buy a day pass in the app — never counted as members.'],
      ['The shop', 'Products and prices you set, stock that only moves through sales and counts, same-day voids before the drawer closes.'],
      ['Waivers and health check', 'Waivers signed in the app — every signature points at the exact words shown — and a fixed PAR-Q that refers, never blocks.'],
    ],
  },
  {
    id: 'door', icon: 'qr', title: 'At the door',
    lede: 'Getting people in, fast, and knowing who came.',
    items: [
      ['QR check-in', 'Members show a code; the desk scans it with any camera, even on a Windows laptop.'],
      ['A self-service kiosk', 'A tablet by the door where members check themselves in, under the same rules as the desk.'],
      ['Members pick their activity', 'Gym floor, a class, cardio — members tap it on their QR screen, can make it their usual, and the desk’s own tag still wins.'],
      ['Coaches check in too', 'If you switch it on, each coach gets a QR in their app; you see who came in and when — never counted as a member visit.'],
      ['The lobby TV', 'Today’s classes and announcements on a screen in the gym — never anyone’s private messages.'],
      ['Attendance history', 'Every visit, searchable by day and member, with who is at risk of drifting away.'],
    ],
  },
  {
    id: 'classes', icon: 'calendar', title: 'Classes and bookings',
    lede: 'A timetable that runs itself, decided the way your gym decides.',
    items: [
      ['A timetable that generates itself', 'Weekly classes from templates, with clashes reported instead of silently double-booked.'],
      ['Approvals your way', 'Instant, the coach, the desk, both, or switched off — separately for classes and 1-on-1.'],
      ['Waitlists', 'When a seat frees, everyone waiting is told at once.'],
      ['1-on-1 sessions', 'Booked against each coach’s own hours, with clash checks on both sides.'],
      ['Cancellations with reasons', 'Your reasons, your limits, and a record of who cancelled and why.'],
    ],
  },
  {
    id: 'coaches', icon: 'message', title: 'Coaches',
    lede: 'A coach’s app that feels like their own space — built like a chat app, made for training.',
    items: [
      ['A chat-style coach app', 'Messages with each trainee, a room for every class and group, and the coach’s status — Available, Away or On leave.'],
      ['Coaching rooms', 'Posts, workouts and check-ins members turn in, a grade book, and a queue of what is waiting for a comment.'],
      ['Coaching terms', 'Included in a plan, priced by the gym, or paid straight to the coach — each term with a start and an end.'],
      ['Programs that build', 'Weeks that get harder on their own — more weight, reps, sets or seconds — with a lighter week every few.'],
      ['Routines a coach can edit', 'Every edit keeps the earlier version, and the member can restore it.'],
      ['Stand-ins', 'When a coach is on leave, their members pick who covers.'],
      ['Credentials checked', 'Certificates with issuer and dates; only ones still in date are shown to members.'],
    ],
  },
  {
    id: 'members', icon: 'phone', title: 'The member’s app',
    lede: 'An app members actually install — Android, and from the browser on iPhone.',
    items: [
      ['Today', 'Their membership, next class, streak and what the gym wants them to know, on one screen.'],
      ['Workouts, routines and programs', 'A player that logs every set — even with no signal — and finds their personal records itself.'],
      ['Progress', 'Body readings, goals with numbers, records and a weekly streak that counts training days.'],
      ['Private progress photos', 'Only the member, and the coaches they choose, can ever see them — not even the gym owner.'],
      ['Where it is in the gym', 'Your equipment list, and each exercise saying where in the gym to find its machine.'],
      ['Find a gym on a map', 'New members find your gym by distance, see how it lets people join, and get directions.'],
      ['Sign in with Google', 'For members and coaches, linked to the account the gym made.'],
      ['English and Filipino', 'Every screen, in the language each member picks.'],
    ],
  },
  {
    id: 'ai', icon: 'sparkle', title: 'The AI coach',
    lede: 'A real Claude model, on the plans you choose — careful by design.',
    items: [
      ['Builds and adjusts training', 'Routines, multi-week programs, weekly schedules, goals, bookings and logged workouts.'],
      ['Nothing changes until Apply', 'Every proposal is a card the member accepts or discards, and every change can be undone.'],
      ['Knows your gym', 'Hours, plans, classes and house rules come only from your settings — never guessed.'],
      ['Safe on purpose', 'A stated injury gets a referral to a person, never a changed exercise; no calorie or macro targets.'],
      ['Limits you set', 'Daily and monthly limits, an estimate of the cost, and top-ups when you need more.'],
    ],
  },
  {
    id: 'loyalty', icon: 'star', title: 'Keeping them coming',
    lede: 'Reasons to come back, with rules nobody can fake from a phone.',
    items: [
      ['Points and rewards', 'Earned for visits and records, spent on rewards your desk hands over.'],
      ['Badges and streaks', 'Milestones the database decides, and a weekly streak with a frozen week that never breaks it.'],
      ['Challenges, quests and seasons', 'Monthly challenges, weekly quests, and a season board members opt into.'],
      ['Squads', '2–5 friends who train toward a weekly target together.'],
      ['Invite a friend', 'Both sides are rewarded only when the friend actually pays.'],
      ['Win-back messages', 'Members drifting away are spotted early — at most one automatic message a month.'],
    ],
  },
  {
    id: 'owner', icon: 'brush', title: 'For the owner',
    lede: 'Your gym, your rules, your look — and the numbers to run it.',
    items: [
      ['Dashboard and reports', 'Revenue, attendance, retention and who is at risk — zero when there is nothing, never a guess.'],
      ['Notifications in one place', 'What needs you now, and every message sent to you, read and unread.'],
      ['Announcements', 'To everyone, the free tier, paying members or chosen plans.'],
      ['Staff permissions', 'Choose which areas each front-desk account may touch, enforced by the database.'],
      ['Activity log', 'Everything staff did, and when, written by the system itself.'],
      ['Your brand', 'Your logo, your two colours, even your own words for members, coaches and classes.'],
      ['Switch off what you don’t run', '19 switches — no shop, no classes? Members never see them.'],
      ['Joining rules', 'Open, by code or link, or desk-only; a minimum age, with guardian consent under 18, and a printable join poster.'],
      ['Equipment register', 'What you have, where it is, and members reporting what needs repair.'],
    ],
  },
  {
    id: 'trust', icon: 'shield', title: 'Trust and privacy',
    lede: 'Built for the Data Privacy Act from the database up.',
    items: [
      ['Every gym walled off', 'One gym can never see another’s members — enforced in the database and tested on every change.'],
      ['Support only when you say', 'Core Fitness looks inside only when you grant access — read-only, for a few hours.'],
      ['A data processing agreement', 'You are the controller under RA 10173; Core Fitness is your processor, in writing.'],
      ['Versioned terms', 'Members agree to dated Terms, Privacy and house rules, and you can see which version each signed.'],
      ['Their data, theirs to take', 'Members can export what the gym holds about them.'],
    ],
  },
];

export const FEATURE_COUNT = CATALOGUE.reduce((n, g) => n + g.items.length, 0);
