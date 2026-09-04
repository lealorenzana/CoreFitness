import type { MembershipPlanRow } from '../types/db';
import type { PlanSpec } from '../utils/planBuilder';
import type { PlanAccess } from '../utils/planAccess';
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
 * Rule-based, not a model: a keyword match over an ordered list. It answers
 * about **you** — membership, expiry, check-in code, next session, visits — from
 * the same data Home uses.
 *
 * ## Facts about the gym come from the gym, not from this file
 *
 * Opening hours used to be the string "5:00 AM – 10:00 PM" written here, while
 * `gym_settings.opening_time` sat in the database with an admin screen to edit
 * it. Change the hours at the desk and the assistant kept telling members the
 * old ones — the same class of bug as a hardcoded fallback identity, and worse
 * for being confidently phrased. Hours, address, phone and email now come from
 * `gym_settings`, and when a value is missing the answer **says it is not on
 * record** instead of inventing one.
 *
 * ## Three kinds of answer, and the line between them
 *
 *  1. **Facts we hold** — your membership, your code, the gym's hours. Answered
 *     directly from data.
 *  2. **Policy we do not hold** — guests, parking, dress code, refunds. The gym
 *     has answers; this app does not store them. These say so and point at the
 *     front desk, which is more use than a generic "I don't know" and is not a
 *     guess.
 *  3. **Fitness questions** — technique, nutrition, pain. Routed to a human.
 *     `planBuilder.ts` draws the same line: a stated injury produces a referral,
 *     never advice.
 *
 * ## Measured, not assumed
 *
 * The table is exercised by a coverage script over realistic member questions,
 * including Taglish, because this gym is in Occidental Mindoro and members type
 * "magkano" far more often than "how much".
 */

export interface GymFacts {
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** As stored — "05:00", "22:00". Formatted for display at use. */
  openingTime: string | null;
  closingTime: string | null;
}

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
  /** From `gym_settings` (0013). Null when it could not be read. */
  gym: GymFacts | null;
  /**
   * The member's saved training plan (0047), if they have built one.
   *
   * Read here so "what is my workout today" is answered from the member's own
   * row rather than guessed. The spec is rendered straight — never reworded —
   * for the same reason `planRender` never touches the exercise table: anything
   * that can rephrase "4 x 5-6" can change it.
   */
  plan: PlanSpec | null;
  /**
   * What the member's plan includes and withholds — the booking columns from
   * 0017 *and* the feature matrix from 0049, already merged by `planAccess()`.
   *
   * Here because "what does my membership include" is the question this
   * assistant is asked most, and answering it from the plan's *name* was how
   * the Free tier's card ended up announcing only "this membership does not
   * expire". The assistant now says the same thing the membership card and the
   * upgrade screen say, because all three read this one object.
   */
  access: PlanAccess | null;
  /** CORE Points balance (0051), or null when it could not be read. */
  points: number | null;
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
  plan: null,
  access: null,
  points: null,
  gym: null,
};

/**
 * `gym_settings` row -> the facts the answers need.
 *
 * Shared by both consumers so the shape is converted once. A null row (failed
 * read, or a gym that has never filled settings in) yields null, and every
 * answer that depends on it says the value is not on record rather than
 * falling back to a number written in this file.
 */
export function toGymFacts(row: {
  gym_name?: string | null; address?: string | null; phone?: string | null;
  email?: string | null; opening_time?: string | null; closing_time?: string | null;
} | null): GymFacts | null {
  if (!row) return null;
  return {
    name: row.gym_name ?? null,
    address: row.address ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    openingTime: row.opening_time ?? null,
    closingTime: row.closing_time ?? null,
  };
}

/** Nothing loaded — say so instead of answering about a membership we can't see. */
const NO_CONTEXT =
  "I couldn't load your account details just now. Check your connection and reopen this, or ask at the front desk.";

/** Where every "the app does not know this" answer points. */
const ASK_DESK = 'The front desk can tell you — they are the ones who set it.';

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "05:00" → "5:00 AM". Returns null for anything unparseable, never a guess. */
function clockLabel(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h > 23) return null;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/**
 * What the plan covers, in the same words the membership card uses.
 *
 * Appended to the membership answers rather than living in its own rule,
 * because "when does it expire" and "what do I get" are the same question
 * asked two ways, and the free tier's honest answer to the first ("it doesn't
 * expire") is actively misleading without the second.
 *
 * Returns '' when access could not be loaded — never a guess about what a
 * membership includes.
 */
function accessLines(ctx: AssistantContext): string {
  const a = ctx.access;
  if (!a) return '';
  const parts = [`\n\n**Included:** ${a.included.join(', ')}.`];
  if (!a.isFullAccess) {
    parts.push(
      `\n**Not included:** ${a.excluded.join(', ')} — the front desk can tell you which plan adds them.`
    );
  }
  return parts.join('');
}

function membershipAnswer(ctx: AssistantContext): string {
  if (!ctx.planName) {
    return "You don't have an active membership on record yet. The front desk can set one up — it starts the moment they record your payment.";
  }
  const term = membershipTerm(ctx.daysLeft, ctx.neverExpires);
  if (term.kind === 'unlimited') {
    // The tier that never runs out is also the one that withholds the most, so
    // "it doesn't expire" alone is the single most misleading true sentence
    // this assistant can say. `accessLines` is what stops it being said alone.
    return `You're on **${ctx.planName}**, and it doesn't expire. Nothing to renew.${accessLines(ctx)}`;
  }
  if (term.kind === 'expired') {
    return `Your **${ctx.planName}** membership has run out. Pay at the front desk and it extends the moment they record it.`;
  }
  if (!ctx.expiryDate) {
    return `You're on **${ctx.planName}**. It hasn't been activated yet — that happens when the front desk records your payment.`;
  }
  return `You're on **${ctx.planName}**, valid until **${dateLabel(`${ctx.expiryDate}T00:00:00`)}** — ${term.value} ${term.unit} ${term.caption}.${accessLines(ctx)}`;
}

function hoursAnswer(ctx: AssistantContext): string {
  const open = clockLabel(ctx.gym?.openingTime ?? null);
  const close = clockLabel(ctx.gym?.closingTime ?? null);
  if (!open || !close) {
    // Never the old hardcoded "5:00 AM – 10:00 PM". If the gym has not set its
    // hours, saying so is the only honest answer available.
    return `The opening hours aren't recorded in the app yet. ${ASK_DESK}`;
  }
  return `**Opening hours**\n\nThe gym is open **${open} – ${close}**.`;
}

function locationAnswer(ctx: AssistantContext): string {
  const name = ctx.gym?.name ?? 'The gym';
  if (!ctx.gym?.address) {
    return `The address isn't recorded in the app yet. ${ASK_DESK}`;
  }
  return `**${name}**\n\n${ctx.gym.address}`;
}

function contactAnswer(ctx: AssistantContext): string {
  const bits: string[] = [];
  if (ctx.gym?.phone) bits.push(`• Phone: **${ctx.gym.phone}**`);
  if (ctx.gym?.email) bits.push(`• Email: **${ctx.gym.email}**`);
  if (bits.length === 0) {
    return `No contact details are recorded in the app yet. ${ASK_DESK}`;
  }
  return ['**Contacting the gym**', ...bits].join('\n');
}

/**
 * Ordered: the first pattern that matches wins, so specific topics have to come
 * before general ones. "How much is my plan" must hit membership before price.
 *
 * Traps learned by running the table rather than reading it:
 *
 *  - **A trailing `\b` kills prefix tokens.** `/\bamenit\b/` can never match
 *    "amenities" — the boundary needs a non-word character after "amenit" and
 *    finds "i". Prefixes use `\w*`, whole words use an explicit `s?`.
 *  - **Plurals are not free.** `/\bprice\b/` does not match "prices".
 *  - **A broad word swallows a narrow question.** "cancel" alone sent *"cancel
 *    my booking"* to the membership-freeze answer — the member asked about one
 *    session and was told how to pause their membership. Booking now wins when
 *    the sentence mentions a booking.
 */

/**
 * "What is my workout today?" — from the member's own saved plan (0047).
 *
 * The exercise lines are printed straight from the spec. Nothing here rewords a
 * set count, a rep range or a load: `planRender` has the same rule, and for the
 * same reason — a sentence that can rephrase "4 x 5-6" can change it, and the
 * member would have no way to tell.
 *
 * A member with no plan is told where to build one rather than being given a
 * generic week. Inventing a workout would be the same failure as inventing an
 * opening time.
 */
function planAnswer(ctx: AssistantContext, wantToday: boolean): string {
  const spec = ctx.plan;
  if (!spec) {
    return 'You have not built a training plan yet.\n\nOpen **Profile → Training plan** — five questions and it builds a week around your days and your goal.';
  }

  const days = spec.days;
  if (days.length === 0) {
    return 'Your saved plan has no training days in it. Rebuild it from **Profile → Training plan**.';
  }

  // "Today" is which planned day, not which calendar day: the plan is a week
  // shape ("Day 1, Day 2"), not a Monday-to-Sunday calendar, so claiming a
  // specific day is today would be making it up.
  if (wantToday) {
    return [
      `**Your ${spec.splitName}**`,
      '',
      `Your plan has ${days.length} training day${days.length === 1 ? '' : 's'} a week. Pick the next one you have not done:`,
      '',
      ...days.map((d) => `• **${d.label}** — ${d.focus} (${d.exercises.length} exercise${d.exercises.length === 1 ? '' : 's'})`),
      '',
      'Tap **Profile → Training plan** for the full sets and reps, or **Track sets** to record it as you go.',
    ].join('\n');
  }

  return [
    `**Your ${spec.splitName}**`,
    '',
    ...days.flatMap((d) => [
      `**${d.label} — ${d.focus}**`,
      ...d.exercises.map((x) => `• ${x.name} — ${x.sets} x ${x.reps}`),
      '',
    ]),
    'That is the plan as saved. Your coach can adjust any of it.',
  ].join('\n');
}


/**
 * CORE Points (0051).
 *
 * The balance is read, never computed here: a pending redemption already counts
 * against it in SQL, so a number summed on the phone would tell a member they
 * can afford something the database will refuse.
 */
function pointsAnswer(ctx: AssistantContext): string {
  const gated = ctx.access?.excluded.some((e) => /point/i.test(e)) ?? false;
  if (gated) {
    return 'CORE Points are not part of your current plan.\n\nOn a plan that includes them you earn points for checking in, logging workouts and finishing challenges, then spend them on gym rewards. The front desk can tell you which plan adds it.';
  }
  const bal = ctx.points == null
    ? "I couldn't read your balance just now — open **Profile → CORE Points** to see it."
    : `You have **${ctx.points.toLocaleString()} CORE Points**.`;
  return `**CORE Points**\n\n${bal}\n\nYou earn them by checking in, logging a workout, attending a class or session, reaching a goal and finishing a challenge — the exact amounts are listed in **Profile → CORE Points**, because the gym can change them. Rewards are claimed there and handed over at the desk once the gym approves.`;
}

/** Challenges (0052). Progress is counted, so say so — that is the selling point. */
function challengesAnswer(ctx: AssistantContext): string {
  const gated = ctx.access?.excluded.some((e) => /challenge/i.test(e)) ?? false;
  if (gated) {
    return 'Challenges are not part of your current plan. The front desk can tell you which plan includes them.';
  }
  return '**Challenges**\n\nOpen **Profile → Challenges** to see what the gym is running and join one. Your progress is counted automatically from your check-ins and logged workouts — there is nothing to tick off, and nothing you can accidentally forget to record. Finish one and the points are added for you.';
}

/** The set-by-set tracker (0050), as distinct from the quick log that predates it. */
function trackerAnswer(ctx: AssistantContext): string {
  const gated = ctx.access?.excluded.some((e) => /tracker/i.test(e)) ?? false;
  if (gated) {
    return 'Recording exercises set by set is not part of your current plan — but you can still log a session with **Progress → Workouts → Quick log** ("Weights, 45 minutes"), and that has not changed.\n\nThe front desk can tell you which plan adds the full tracker.';
  }
  return '**Tracking a workout**\n\nOpen **Progress → Workouts → Track sets**. Pick an exercise, then add each set as you finish it — reps and weight, or minutes for things like the treadmill and planks. Every set saves as you enter it, so locking your phone between sets loses nothing.\n\nFor a quick note instead of set-by-set detail, **Quick log** on the same screen still works.';
}

/** Preset goals (0055) — the five that track themselves. */
function goalsAnswer(): string {
  return '**Goals**\n\nOpen **Progress → Goals**. Alongside number goals like "get to 70 kg", there are ready-made ones that track themselves from your check-ins and logged workouts — build consistency, stay active, improve fitness, increase strength, improve endurance.\n\nEach one says exactly how it is counted, and the gym marks it reached for you; you never have to claim it.';
}

/**
 * "Why is this locked?"
 *
 * Answered from the same access object the lock card is worded from, so the
 * two can never explain one rule differently.
 */
function lockedAnswer(ctx: AssistantContext): string {
  const a = ctx.access;
  if (!a) {
    return "I couldn't read what your plan includes just now. Open **Profile → Membership** and it is listed there.";
  }
  if (a.isFullAccess) {
    return 'Your plan includes everything the app offers, so nothing should be locked. If a screen still shows a lock, tell the front desk — that is a bug, not your membership.';
  }
  return `Your plan does not include: **${a.excluded.join(', ')}**.\n\nEverything else is open to you. The front desk can tell you which plan adds them — payment is in person, in cash.`;
}

/** Trainer certificates (0054) — members never see the file, so be honest about it. */
function credentialsAnswer(): string {
  return "Coaches can upload their certificates for the gym to check, and the gym marks them verified once it has seen the document.\n\nThe certificates themselves aren't shown in the app — you'll see what a coach lists on their profile in **Book → Trainers**. Ask the front desk if you want to know more about a coach's qualifications.";
}

const RULES: { match: RegExp; reply: (ctx: AssistantContext) => string }[] = [
  {
    // Points before the generic membership rule: "how do I earn points" is not
    // a question about the subscription.
    match: /\b(?:core ?points?|points?|reward\w*|redeem\w*|puntos)\b/,
    reply: pointsAnswer,
  },
  {
    match: /\b(?:challenge\w*|hamon)\b/,
    reply: challengesAnswer,
  },
  {
    // The logging verbs the training-plan rule deliberately refuses, routed
    // here instead of being answered with the plan.
    match: /\b(?:track\s+(?:my\s+)?(?:sets?|workout|lift)|log\s+(?:my\s+)?(?:sets?|workout|exercise)|record\s+(?:my\s+)?(?:sets?|workout|reps?|weight)|sets? and reps?|how much i lifted)\b/,
    reply: trackerAnswer,
  },
  {
    match: /\b(?:preset goals?|ready-?made goals?|set a goal|my goals?|goal progress)\b/,
    reply: goalsAnswer,
  },
  {
    match: /\b(?:why (?:is|are) (?:this|it|that) locked|locked|upgrade|what (?:does|do) my plan (?:include|cover)|bakit naka-?lock)\b/,
    reply: lockedAnswer,
  },
  {
    // `certif\w*`, not `certificat\w*` — "certified" does not contain
    // "certificat", so the narrower stem missed the most common phrasing of
    // this question entirely. Same fault as `amenit` never matching
    // "amenities"; caught by running the regex, not by reading it.
    match: /\b(?:certif\w*|qualif\w*|credential\w*|licens\w*|accredit\w*)\b/,
    reply: credentialsAnswer,
  },
  {
    // Above the workout-logging rule further down: "what is my workout today"
    // asks about the member's saved plan, not for somewhere to record one.
    //
    // `my plan` is deliberately NOT in this alternation. That phrase means the
    // *membership* plan far more often, and 0047 aside, answering it here would
    // tell someone asking about their subscription to go and do squats.
    // The leading lookahead is load-bearing, and running the regex is how it
    // was found: "how do I **log** my workout" contains "my workout" and was
    // being answered with the training plan instead of the logging screen.
    // Same class as the three regexes this project has already shipped broken.
    //
    // `my training split` needed `training` in the alternation too — the word
    // after "my" is not always the noun.
    match: /^(?!.*\b(?:log|logg\w*|record|track|save)\b).*\b(?:my (?:training )?(?:workout|programme|program|routine|split|week)|workout today|training today|what (?:do|should) i (?:do|train)|ano ang workout ko|anong gagawin ko)\b/,
    reply: (ctx: AssistantContext) => planAnswer(ctx, true),
  },
  {
    match: /\b(?:exercises? in my|what exercises|my exercises|full (?:training )?plan|whole plan|buong plano)\b/,
    reply: (ctx: AssistantContext) => planAnswer(ctx, false),
  },
  {
    // Above the membership freeze rule: "cancel my booking" is a different
    // question from "cancel my membership", and answering the wrong one is
    // worse than not answering.
    match: /\b(?:cancel\w*|kansel\w*)\b.*\b(?:booking|book\w*|session|class(?:es)?|reservation|schedule)\b|\b(?:booking|session|class)\b.*\bcancel\w*\b/,
    reply: () =>
      '**Cancelling a session**\n\nOpen **Profile → My bookings**, find the session and cancel it there. If it is close to the start time, tell the front desk or your coach as well so the slot can be reused.',
  },
  {
    match: /\b(?:freeze|frozen|paus\w*|cancel\w*|hinto|tigil)\b/,
    reply: () =>
      'Freezing or cancelling your membership is a front-desk request — they can pause it so the days you already paid for are not lost.',
  },
  {
    // `when does` deliberately absent: "when does the gym open" would have been
    // answered with this member's membership expiry.
    match: /\b(?:my (?:membership|plan)|expir\w*|days? left|renew\w*|matatapos|hanggang kailan)\b/,
    reply: membershipAnswer,
  },
  {
    match: /\b(?:my code|check ?-?in code|qr|scan|check(?:ed)? ?-?in|code ko)\b/,
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
    // NOT a bare `how many`: it swallowed "how many times a week should I train
    // legs" — a programming question — and answered it with this month's
    // check-in count. The phrase has to actually be about visiting.
    match: /\b(?:visits?|attendance|been to the gym|how many times have i|ilang beses|pumunta)\b/,
    reply: (ctx) =>
      ctx.checkInsThisMonth == null
        ? NO_CONTEXT
        : ctx.checkInsThisMonth === 0
          ? 'No gym visits recorded this month yet. A visit is logged when the front desk scans you in.'
          : `You've been in **${ctx.checkInsThisMonth} ${ctx.checkInsThisMonth === 1 ? 'time' : 'times'}** this month. Your full history is under Profile → Attendance.`,
  },
  {
    // The app genuinely has these screens, so this is a real answer, not a
    // redirection to the desk.
    match: /\b(?:password|passwor\w*|forgot my|reset|change my email|update my email|log ?in again)\b/,
    reply: () =>
      '**Your account**\n\n• Change your password: **Profile → Settings → Change password**\n• Change your email: **Profile → Settings → Change email**\n\nIf you cannot sign in at all, the front desk can reset it for you.',
  },
  {
    match: /\b(?:delete my account|close my account|deactivat\w*)\b/,
    reply: () =>
      'Accounts are closed by the gym rather than from the app, so your payment and attendance history is not lost. Ask the front desk and they will handle it.',
  },
  {
    match: /\b(?:where|address|location|located|direction|saan|paano pumunta)\b/,
    reply: locationAnswer,
  },
  {
    match: /\b(?:phone|contact|number|email|message|tawag|hotline)\b/,
    reply: contactAnswer,
  },
  {
    match: /\b(?:price|pricing|cost|fee|how much|plan|tier|magkano|presyo|bayad)s?\b/,
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
    match: /\b(?:hours?|open\w*|clos\w*|what time|anong oras|bukas|sarado)\b/,
    reply: hoursAnswer,
  },
  {
    // Asked about a specific class the app cannot confirm from a keyword. Point
    // at the screen that lists what the gym actually runs, rather than claiming
    // the gym does or does not offer it.
    match: /\b(?:zumba|yoga|spin\w*|crossfit|boxing|pilates|aerobic\w*|muay ?thai)\b/,
    reply: () =>
      'Open **Book a Session** — it lists every class the gym is actually running this week, with the coach and the times. If you do not see it there, the front desk can tell you whether it is planned.',
  },
  {
    match: /\b(?:book\w*|class(?:es)?|schedul\w*|sessions?|reserv\w*|paano mag)\b/,
    reply: () =>
      '**Booking a session**\n\n• Open **Book a Session** from the bottom bar\n• Pick a class, or a 1-on-1 with a trainer\n• Your request goes to the gym for approval\n\nYou will get a notification when it is approved.',
  },
  {
    match: /\b(?:my trainer|my coach|who is my|assigned|sino.*(?:trainer|coach))\b/,
    reply: (ctx) =>
      ctx.nextBooking
        ? `Your next session is with **${ctx.nextBooking.subtitle}**. The full list of coaches is under **Trainers**, where you can see what each one specialises in.`
        : 'You do not have a coach assigned by default — you pick one when you book. Open **Trainers** to see who is available and what they specialise in.',
  },
  {
    match: /\b(?:trainers?|coach(?:es)?|pt|personal train\w*)\b/,
    reply: () =>
      'Personal training depends on your plan. Open **Book a Session** — it shows what yours includes — and **Trainers** lists every coach with their background and rating.',
  },
  {
    // Safety first, and consistent with planBuilder.ts: a stated injury gets a
    // referral, never advice. This is not a topic a keyword table should answer.
    match: /\b(?:injur\w*|hurt\w*|pain\w*|sore|sprain\w*|masakit|sakit)\b/,
    reply: () =>
      'If something hurts — sharp pain rather than normal effort — stop that movement and speak to a trainer before your next session. For anything persistent, please see a doctor or physiotherapist. This app is not the right place for that advice.',
  },
  {
    match: /\b(?:how do i do|form|technique|proper way|posture|squat|deadlift|bench|push ?-?up)\b/,
    reply: () =>
      '**Learning a movement**\n\n• **Profile → Free workouts** has routines and videos the gym recommends\n• A 1-on-1 session is the fastest way to have your form watched — book one under **Book a Session**\n\nHaving the main lifts checked once is worth more than reading about them.',
  },
  {
    match: /\b(?:eat|diet|nutrition|food|protein|meal|calorie|kain|pagkain)s?\b/,
    reply: () =>
      'General practice: get protein into every main meal, eat something with carbohydrate an hour or two before training, and drink water across the day. For anything specific to you, your health or your medication, please ask a coach or a qualified professional rather than an app.',
  },
  {
    match: /\b(?:amenit\w*|facilit\w*|equipment|shower|locker|parking|wifi|wi-?fi|aircon|banyo)s?\b/,
    reply: () =>
      '**On site**\n\n• Free weights and cardio machines\n• Locker rooms and showers\n• Group classes and personal training\n\nFor anything else — parking, wifi, and the like — the front desk can confirm what is available.',
  },
  {
    match: /\b(?:guest|friend|bring\w*|walk ?-?in|trial|kasama|isama)\b/,
    reply: () =>
      `Guest and trial visits are a gym policy rather than something the app decides. ${ASK_DESK}`,
  },
  {
    match: /\b(?:dress code|attire|wear|shoes|age limit|minor|rules?|policy|policies|bawal|pwede ba)\b/,
    reply: () =>
      `That is a gym policy and is not stored in the app, so I would rather not guess. ${ASK_DESK}`,
  },
  {
    match: /\b(?:refund|reimburs\w*|money back|sauli)\b/,
    reply: () =>
      'Refunds are handled case by case by the gym, so please ask at the front desk. Your payment history is under **Profile → Payments** if you need the dates and amounts.',
  },
  {
    // An honest "we do not measure that" beats a confident guess about how busy
    // the gym is right now.
    match: /\b(?:busy|crowded|peak|how many people|traffic|matao|madami)\b/,
    reply: () =>
      'The app does not track how busy the gym is right now — check-ins are recorded, but not live occupancy. The front desk can tell you which hours are usually quietest.',
  },
  {
    match: /\b(?:pay\w*|paid|cash|gcash|card|receipt|invoice)s?\b/,
    reply: () =>
      'Core Fitness takes **cash at the front desk**. Your membership extends the moment staff record the payment, and the receipt appears under Profile → Payments.',
  },
  {
    // NOT a bare `weights`: "should I do cardio before or after weights" is a
    // programming question, not a request to open the logging screen.
    match: /\b(?:progress|my weight|weigh ?-?ins?|measurement|body ?map|log my|goals?)s?\b/,
    reply: () =>
      '**Tracking progress**\n\n• Log measurements, workouts and goals under **Progress**\n• Build a training week under **Profile → Training plan**\n• Your trainer can leave recommendations there too\n\nCharts fill in as you add entries.',
  },
  {
    match: /\b(?:event|announce\w*)s?\b/,
    reply: () => 'Anything the gym has coming up shows under **Book**, and in full under **Events**.',
  },
  { match: /\b(?:thanks?|thank you|salamat)\b/, reply: () => 'Anytime. Enjoy your session.' },
  {
    match: /\b(?:hello|hi|hey|kumusta|kamusta|good (?:morning|afternoon|evening))\b/,
    reply: (ctx) => (ctx.firstName ? `Hello ${ctx.firstName}. What do you need?` : 'Hello. What do you need?'),
  },
];

const FALLBACK =
  "I don't have an answer for that one. I can help with:\n\n• Your membership, days left and payments\n• Your check-in code and visits\n• Booking classes and trainers\n• Prices, opening hours and where the gym is\n• Tracking your progress\n\nFor anything else, the front desk is the fastest route.";

/**
 * True when `answerFor` had nothing and returned the catch-all.
 *
 * Compared against the constant rather than sniffing for a phrase, so editing
 * the fallback's wording cannot silently stop the model fallback from firing.
 */
export function isRuleFallback(answer: string): boolean {
  return answer === FALLBACK;
}

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
  if (ctx.planName) personal.push('What does my membership include?');
  if (ctx.memberId) personal.push('What is my check-in code?');
  if (ctx.nextBooking) personal.push('What is my next session?');
  // Only offered when the plan actually includes them — a chip that leads
  // straight to a lock card is a worse first impression than no chip at all.
  const includes = (re: RegExp) =>
    ctx.access != null && !ctx.access.excluded.some((e) => re.test(e));
  const extras: string[] = [];
  if (includes(/point/i)) extras.push('How do I earn CORE Points?');
  if (includes(/challenge/i)) extras.push('What challenges are running?');
  if (ctx.plan) extras.push('What is my workout today?');
  return [...personal, ...extras, 'How do I book a class?', 'Opening hours', 'Prices'].slice(0, 5);
}
