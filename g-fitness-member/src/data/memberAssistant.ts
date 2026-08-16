import type { MembershipPlanRow } from '../types/db';
import { formatCheckInCode } from '../utils/checkInCode';
import { membershipTerm } from '../utils/membershipTerm';

/**
 * The member assistant's answers — one source, used by the full screen and the
 * floating popup.
 *
 * The same `getBotResponse` was copy-pasted into three components. They had
 * already drifted: two of them still quoted ₱800/₱1,500/₱2,500 plans that exist
 * nowhere in the database. A single table is the fix.
 *
 * The bigger change is that it can now answer about **you**. It used to be a
 * gym FAQ that happened to live inside your account — it could recite opening
 * hours but not tell you when your own membership ran out, which is the first
 * thing anyone would ask it. `AssistantContext` carries the handful of facts
 * the app already loads for the home screen, so "how many days do I have left"
 * gets a real answer instead of a pointer to another screen.
 *
 * Rule-based, not a model: a keyword match over an ordered list. Personal
 * answers are still bound by the honesty rule — when the context failed to
 * load, they say so rather than filling in a plausible number.
 */

export interface AssistantContext {
  firstName: string;
  planName: string | null;
  expiryDate: string | null;
  daysLeft: number | null;
  neverExpires: boolean;
  /** The six-character desk fallback. Derived from the member id, never stored. */
  memberId: string | null;
  nextBooking: { title: string; startsAt: string | null; subtitle: string } | null;
  checkInsThisMonth: number | null;
  plans: MembershipPlanRow[];
}

export const EMPTY_CONTEXT: AssistantContext = {
  firstName: '',
  planName: null,
  expiryDate: null,
  daysLeft: null,
  neverExpires: false,
  memberId: null,
  nextBooking: null,
  checkInsThisMonth: null,
  plans: [],
};

/** Nothing loaded — say so instead of answering about a membership we can't see. */
const NO_CONTEXT =
  "I couldn't load your account details just now. Check your connection and reopen this, or ask at the front desk.";

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function membershipAnswer(ctx: AssistantContext): string {
  if (!ctx.planName) {
    return "You don't have an active membership on record yet. The front desk can set one up — it starts the moment they record your payment.";
  }
  const term = membershipTerm(ctx.daysLeft, ctx.neverExpires);
  if (term.kind === 'unlimited') {
    return `You're on **${ctx.planName}**, and it doesn't expire. Nothing to renew.`;
  }
  if (term.kind === 'expired') {
    return `Your **${ctx.planName}** membership has run out. Pay at the front desk and it extends the moment they record it.`;
  }
  if (!ctx.expiryDate) {
    return `You're on **${ctx.planName}**. It hasn't been activated yet — that happens when the front desk records your payment.`;
  }
  return `You're on **${ctx.planName}**, valid until **${dateLabel(`${ctx.expiryDate}T00:00:00`)}** — ${term.value} ${term.unit} ${term.caption}.`;
}

/**
 * Ordered: the first pattern that matches wins, so specific topics have to come
 * before general ones. "How much is my plan" must hit membership before price.
 *
 * Two things learned the hard way by running the table rather than reading it:
 *
 *  - **A trailing `\b` kills prefix tokens.** `/\bamenit\b/` can never match
 *    "amenities" — the boundary needs a non-word character after "amenit" and
 *    finds "i". Facilities and amenities were both unreachable. Prefixes use
 *    `\w*`, whole words use an explicit `s?`.
 *  - **Plurals are not free.** `/\bprice\b/` does not match "prices", so the
 *    single most likely way to ask about cost fell through to the fallback.
 */
const RULES: { match: RegExp; reply: (ctx: AssistantContext) => string }[] = [
  {
    // Above the membership rule on purpose. "Can I freeze my membership"
    // contains "my membership", so with the general rule first it was answered
    // with an expiry date and never mentioned freezing at all.
    match: /\b(?:freeze|frozen|paus\w*|cancel\w*)\b/,
    reply: () =>
      'Freezing or cancelling is a front-desk request — they can pause your membership so the days you already paid for are not lost.',
  },
  {
    // `when does` deliberately absent: "when does the gym open" would have been
    // answered with this member's membership expiry.
    match: /\b(?:my (?:membership|plan)|expir\w*|days? left|renew\w*)\b/,
    reply: membershipAnswer,
  },
  {
    match: /\b(?:my code|check ?-?in code|qr|scan|check(?:ed)? ?-?in)\b/,
    reply: (ctx) =>
      ctx.memberId
        ? `Your check-in code is **${formatCheckInCode(ctx.memberId)}**.\n\nTap the QR button in the middle of the bottom bar to show your code at the desk. If the scanner won't read it, read those six characters out instead.`
        : NO_CONTEXT,
  },
  {
    match: /\b(?:next (?:session|class|booking)|upcoming|booked|my bookings?)\b/,
    reply: (ctx) =>
      ctx.nextBooking && ctx.nextBooking.startsAt
        ? `Your next session is **${ctx.nextBooking.title}** on ${dateLabel(ctx.nextBooking.startsAt)} at ${timeLabel(ctx.nextBooking.startsAt)}.\n\n${ctx.nextBooking.subtitle}`
        : "You've got nothing booked at the moment. Open **Book a Session** to pick a class or a 1-on-1.",
  },
  {
    match: /\b(?:how many|visits?|attendance|been to the gym)\b/,
    reply: (ctx) =>
      ctx.checkInsThisMonth == null
        ? NO_CONTEXT
        : ctx.checkInsThisMonth === 0
          ? 'No gym visits recorded this month yet. A visit is logged when the front desk scans you in.'
          : `You've been in **${ctx.checkInsThisMonth} ${ctx.checkInsThisMonth === 1 ? 'time' : 'times'}** this month. Your full history is under Profile → Attendance.`,
  },
  {
    match: /\b(?:price|pricing|cost|fee|how much|plan|tier)s?\b/,
    reply: (ctx) =>
      ctx.plans.length === 0
        ? 'I could not load the current plans. Ask at the front desk, or open Membership from your profile.'
        : ['**Current plans:**']
            .concat(
              ctx.plans.map(
                (p) =>
                  `• ${p.name} — ₱${Number(p.price).toLocaleString()}${
                    p.duration_days == null ? ', no expiry' : ` for ${p.duration_days} days`
                  }`
              )
            )
            .concat(['', 'Cash at the front desk — nothing is charged through the app.'])
            .join('\n'),
  },
  {
    match: /\b(?:hours?|open\w*|clos\w*|what time)\b/,
    reply: () => '**Opening hours**\n\nThe gym is open 5:00 AM – 10:00 PM, Monday to Sunday.',
  },
  {
    match: /\b(?:book\w*|class(?:es)?|schedul\w*|sessions?|reserv\w*)\b/,
    reply: () =>
      '**Booking a session**\n\n• Open **Book a Session** from Home\n• Pick a class, or a 1-on-1 with a trainer\n• Your request goes to the gym for approval\n\nYou will get a notification when it is approved.',
  },
  {
    match: /\b(?:trainers?|coach(?:es)?|pt|personal train\w*)\b/,
    reply: () =>
      'Personal training depends on your plan. Open **Book a Session** — it shows what yours includes, and the front desk can explain your options.',
  },
  {
    match: /\b(?:amenit\w*|facilit\w*|equipment|shower|locker)s?\b/,
    reply: () =>
      '**What is on site**\n\n• Free weights and cardio machines\n• Locker rooms and showers\n• Group classes\n• Personal training',
  },
  {
    match: /\b(?:pay\w*|paid|cash|gcash|card|receipt)s?\b/,
    reply: () =>
      'Core Fitness takes **cash at the front desk**. Your membership extends the moment staff record the payment, and the receipt appears under Profile → Payments.',
  },
  {
    match: /\b(?:progress|weights?|measurement|goal|log)s?\b/,
    reply: () =>
      '**Tracking progress**\n\n• Log measurements, workouts and goals under **Progress**\n• Your trainer can leave recommendations there too\n• Charts fill in as you add entries',
  },
  {
    match: /\b(?:event|announce\w*)s?\b/,
    reply: () => 'Anything the gym has coming up shows on Home and under **Events**.',
  },
  { match: /\b(?:thanks?|salamat)\b/, reply: () => 'Anytime. Enjoy your session.' },
  {
    match: /\b(?:hello|hi|hey|kumusta|good (?:morning|afternoon|evening))\b/,
    reply: (ctx) => (ctx.firstName ? `Hello ${ctx.firstName}. What do you need?` : 'Hello. What do you need?'),
  },
];

const FALLBACK =
  "I don't have an answer for that one. I can help with:\n\n• Your membership and days left\n• Your check-in code\n• Booking a class or a trainer\n• Prices and payment\n• Opening hours and facilities\n• Tracking your progress\n\nTry one of those.";

export function answerFor(question: string, ctx: AssistantContext): string {
  const q = question.toLowerCase();
  for (const rule of RULES) {
    if (rule.match.test(q)) return rule.reply(ctx);
  }
  return FALLBACK;
}

/** Starter chips. The personal ones only appear when we actually have the data. */
export function suggestionsFor(ctx: AssistantContext): string[] {
  const personal: string[] = [];
  if (ctx.planName) personal.push('When does my membership expire?');
  if (ctx.memberId) personal.push('What is my check-in code?');
  if (ctx.nextBooking) personal.push('What is my next session?');
  return [...personal, 'How do I book a class?', 'Opening hours', 'Prices'].slice(0, 5);
}
