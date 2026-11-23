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
  /** 0253: the gym switched Points off — nothing about earning or balances may be promised. */
  pointsOff?: boolean;
  /** How this gym runs (its settings, switches and booking modes). Null when it could not be read. */
  setup?: GymSetup | null;
}

/** 0180: who confirms a member's booking. `off` = the front desk books it, not the app. */
export type BookingMode = 'instant' | 'coach' | 'desk' | 'coach_desk' | 'off';

/**
 * How this gym runs, read from `gym_settings`, its module switches and `my_booking_modes()`.
 * Every answer about booking, packages, freezing, day passes and closed days is worded from
 * this, so two gyms set up differently get two different, true answers.
 */
export interface GymSetup {
  /** Train shows Classes (module on and classes not booked at the desk only). */
  classesOn: boolean;
  /** Train shows Coach (personal training). */
  coachingOn: boolean;
  classMode: BookingMode | null;
  ptMode: BookingMode | null;
  /** 0181: the ways a package starts (pick_pt, pick_group, desk_assigns, coach_invites). */
  coachingModes: string[];
  /** 0258: who approves a member's pick of a coach. */
  packageApproval: string | null;
  /** Package lengths in months. */
  packageMonths: number[];
  /** included · gym_priced · trainer_direct */
  packageFee: string | null;
  /** 0 Sunday … 6 Saturday. */
  closedDays: number[];
  dayPass: { price: number | null; pack5: number | null; pack10: number | null } | null;
  freezePerYear: number | null;
  freezeAtOnce: number | null;
  refundFee: number | null;
  refundFeeReason: string | null;
  /** You → Membership → Pause or cancel exists (module `requests`). */
  requestsOn: boolean;
  equipmentOn: boolean;
  /** Today → Book a time (0259). */
  slotsOn: boolean;
  ptCancelMinutes: number | null;
  classCancelMinutes: number | null;
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Settings row + the gym's switches + booking modes → GymSetup. Null when the row could not be read. */
export function toGymSetup(
  row: Record<string, unknown> | null,
  moduleOn: (key: string) => boolean,
  modes: { classMode: BookingMode; ptMode: BookingMode } | null,
): GymSetup | null {
  if (!row) return null;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    classesOn: moduleOn('classes') && modes?.classMode !== 'off',
    coachingOn: moduleOn('coaching'),
    classMode: modes?.classMode ?? null,
    ptMode: modes?.ptMode ?? null,
    coachingModes: arr<string>(row.coaching_modes),
    packageApproval: (row.coaching_approval as string) ?? null,
    packageMonths: arr<number>(row.coaching_lengths),
    packageFee: (row.coaching_fee_mode as string) ?? null,
    closedDays: arr<number>(row.closed_days),
    dayPass: row.day_pass_on ? { price: num(row.day_pass_price), pack5: num(row.pack5_price), pack10: num(row.pack10_price) } : null,
    freezePerYear: num(row.max_freeze_days_per_year),
    freezeAtOnce: num(row.max_freeze_days_at_once),
    refundFee: num(row.refund_processing_fee),
    refundFeeReason: (row.refund_fee_reason as string) || null,
    requestsOn: moduleOn('requests'),
    equipmentOn: moduleOn('equipment'),
    slotsOn: moduleOn('slots'),
    ptCancelMinutes: num(row.pt_cancel_minutes),
    classCancelMinutes: num(row.class_cancel_minutes),
  };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const peso = (n: number) => `₱${n.toLocaleString()}`;
const listWords = (xs: string[], conj = 'or') => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${conj} ${xs[xs.length - 1]}`);

/** Who confirms a booking, in one clause. */
export function approvalWords(mode: BookingMode | string | null): string {
  switch (mode) {
    case 'instant': return 'it is confirmed straight away';
    case 'coach': return 'the coach says yes or no';
    case 'desk': return 'the front desk confirms it';
    case 'coach_desk': return 'the coach says yes first, then the front desk confirms it';
    default: return 'the gym confirms it';
  }
}

const cancelWords = (mins: number | null) =>
  mins && mins > 0
    ? `You can cancel up to ${mins >= 60 && mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? '' : 's'}` : `${mins} minutes`} before it starts.`
    : 'You can cancel it there before it starts.';

/**
 * Sessions, packages, classes and bookings at THIS gym, from its own settings, naming the real
 * screens (Train → Coach, Train → Classes). The screenshot that started this (2026-11-23): a
 * fixed "Open Book a Session from the bottom bar · Pick a class" card, for screens that do not
 * exist under those names.
 */
function bookingAnswer(ctx: AssistantContext): string {
  const s = ctx.setup;
  if (!s) {
    return '**Booking**\n\nOpen **Train** in the bottom bar. **Coach** has your package, your sessions and **Ask for a session**; if your gym runs group classes, **Classes** is there too.\n\nEvery session is asked for first, and you get a notification when it is confirmed.';
  }
  const name = ctx.gym?.name ? ` at ${ctx.gym.name}` : '';
  const lines: string[] = [`**How booking works${name}**`, ''];
  if (s.coachingOn) {
    lines.push(s.ptMode === 'off'
      ? '• **A session** is one 1-on-1 time with a coach. Your gym books these at the front desk, not in the app.'
      : `• **A session** is one 1-on-1 time with a coach. Ask for one on **Train → Coach** (with a package, the button **Ask your coach for a session** is on your package card); ${approvalWords(s.ptMode)}.`);
    const ways = s.coachingModes;
    if (ways.some((w) => ['pick_pt', 'pick_group', 'desk_assigns', 'coach_invites'].includes(w))) {
      const months = s.packageMonths.length ? ` for ${listWords(s.packageMonths.map(String))} month${s.packageMonths.length === 1 && s.packageMonths[0] === 1 ? '' : 's'}` : '';
      const start: string[] = [];
      if (ways.includes('pick_pt')) start.push(`pick a coach on **Train → Coach → Find a coach**${s.packageApproval ? ` (${approvalWords(s.packageApproval)})` : ''}`);
      if (ways.includes('coach_invites')) start.push('a coach can invite you');
      if (ways.includes('desk_assigns')) start.push('the front desk can assign you one');
      const fee = s.packageFee === 'included' ? ' It comes with your plan, with nothing extra to pay.'
        : s.packageFee === 'gym_priced' ? ' The gym sets its price, and you pay the gym.'
        : s.packageFee === 'trainer_direct' ? ' You pay the coach directly.' : '';
      lines.push(`• **A package** is coaching with one coach${months}: a chat with them, your sessions with them, and how far through you are. ${start.length ? `To start one, ${listWords(start)}.` : ''}${fee} It shows on **Train → Coach** under Your package.`);
    }
  } else {
    lines.push('• Your gym does not run personal training in the app. The front desk can tell you about coaching.');
  }
  if (s.classesOn) {
    lines.push(`• **A class** is a group class on the gym's timetable. Join one on **Train → Classes**; ${approvalWords(s.classMode)}.`);
  }
  lines.push(`• **A booking** is your request for one ${s.classesOn ? 'session or class' : 'session'}. The app does not use the word: a session shows *Asked* until it is approved, then *Confirmed*, and you get a notification. All of them are on **Train → Coach → All your sessions**. ${cancelWords(s.ptCancelMinutes)}`);
  if (s.slotsOn) lines.push('• To keep a place on the gym floor, use **Book a time** on **Today**.');
  return lines.join('\n');
}

/** Pausing or ending a membership: the gym's limits, and the screen that asks. */
function freezeAnswer(ctx: AssistantContext): string {
  const s = ctx.setup;
  const where = s?.requestsOn
    ? 'Open **You → Membership → Pause or cancel**. You pick a reason and the dates; the front desk makes the change, and the days you paid for are not lost while it is frozen.'
    : 'Ask the front desk. They make the change, and the days you paid for are not lost while it is frozen.';
  const limits: string[] = [];
  if (s?.freezeAtOnce) limits.push(`up to **${s.freezeAtOnce} days** at a time`);
  if (s?.freezePerYear) limits.push(`about **${s.freezePerYear} days** a year`);
  const freeze = limits.length ? `\n\nYour gym's guideline for freezing: ${limits.join(', ')}.` : '';
  return `**Pausing or cancelling your membership**\n\n${where}${freeze}\n\nWhile frozen you cannot check in or book. Refunds when you cancel are explained in **More → Help → Terms of service**.`;
}

function refundAnswer(ctx: AssistantContext): string {
  const s = ctx.setup;
  const fee = s?.refundFee && s.refundFee > 0
    ? ` The gym takes a fee of **${peso(s.refundFee)}**${s.refundFeeReason ? ` (${s.refundFeeReason})` : ''}.`
    : '';
  const ask = s?.requestsOn ? '**You → Membership → Pause or cancel** shows what you would get back before you ask.' : 'The front desk can tell you what you would get back.';
  return `**Refunds**\n\nIf you cancel, you get back at least the unused part of what you paid.${fee} ${ask} The full rules are in **More → Help → Terms of service**.\n\nYour payments are under **You → Membership → Payments**.`;
}

function dayPassAnswer(ctx: AssistantContext): string {
  const d = ctx.setup?.dayPass;
  if (ctx.setup && !d) return `Your gym does not sell day passes in the app. ${ASK_DESK}`;
  if (!d) return `Guest and walk-in visits are the gym's call. ${ASK_DESK}`;
  const bits: string[] = [];
  if (d.price != null) bits.push(`• One day: **${peso(d.price)}**`);
  if (d.pack5 != null) bits.push(`• 5 days: **${peso(d.pack5)}**`);
  if (d.pack10 != null) bits.push(`• 10 days: **${peso(d.pack10)}**`);
  return ['**Day passes**', '', ...(bits.length ? bits : ['Your gym sells day passes; the front desk has the price.']), '', 'Bought and paid at the front desk.'].join('\n');
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
  setup: null,
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

function visitsAnswer(ctx: AssistantContext): string {
  if (ctx.checkInsThisMonth == null) return NO_CONTEXT;
  if (ctx.checkInsThisMonth === 0) return 'No gym visits recorded this month yet. A visit is logged when the front desk scans you in.';
  return `You've been in **${ctx.checkInsThisMonth} ${ctx.checkInsThisMonth === 1 ? 'time' : 'times'}** this month. Your full history is under **You → Membership → Attendance**.`;
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
    return `Your **${ctx.planName}** membership has run out. Open **You → Membership → Renew membership**, then pay at the front desk; it extends the moment they record it.`;
  }
  if (!ctx.expiryDate) {
    return `You're on **${ctx.planName}**. It hasn't been activated yet — that happens when the front desk records your payment.`;
  }
  return `You're on **${ctx.planName}**, valid until **${dateLabel(`${ctx.expiryDate}T00:00:00`)}**: ${term.value} ${term.unit} ${term.caption}.${accessLines(ctx)}\n\nTo renew or change plan: **You → Membership → Renew or change plan**.${ctx.setup?.requestsOn ? ' To freeze or end it: **You → Membership → Pause or cancel**.' : ''}`;
}

function hoursAnswer(ctx: AssistantContext): string {
  const open = clockLabel(ctx.gym?.openingTime ?? null);
  const close = clockLabel(ctx.gym?.closingTime ?? null);
  if (!open || !close) {
    // Never the old hardcoded "5:00 AM – 10:00 PM". If the gym has not set its
    // hours, saying so is the only honest answer available.
    return `The opening hours aren't recorded in the app yet. ${ASK_DESK}`;
  }
  const closed = ctx.setup?.closedDays.length
    ? `\n\nClosed on ${listWords(ctx.setup.closedDays.filter((d) => d >= 0 && d <= 6).map((d) => `**${DAY_NAMES[d]}**`), 'and')}.`
    : '';
  return `**Opening hours**\n\nThe gym is open **${open} to ${close}**.${closed}`;
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
    return 'You have not built a training plan yet.\n\nOpen **Train → Workout**: your workouts, your week and the library are there.';
  }

  const days = spec.days;
  if (days.length === 0) {
    return 'Your saved plan has no training days in it. Open **Train → Workout** to set your week again.';
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
      'Open **Train → Workout** to start one and record each set as you go.',
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
  if (ctx.pointsOff) {
    return 'Your gym does not use points.\n\nBadges, streaks and challenges still count your progress, and the front desk can tell you about any rewards the gym gives.';
  }
  const gated = ctx.access?.excluded.some((e) => /point/i.test(e)) ?? false;
  if (gated) {
    return 'CORE Points are not part of your current plan.\n\nOn a plan that includes them you earn points for checking in, logging workouts and finishing challenges, then spend them on gym rewards. The front desk can tell you which plan adds it.';
  }
  const bal = ctx.points == null
    ? "I couldn't read your balance just now — open **More → Rewards** to see it."
    : `You have **${ctx.points.toLocaleString()} CORE Points**.`;
  return `**CORE Points**\n\n${bal}\n\nYou earn them by checking in, logging a workout, attending a class or session, reaching a goal and finishing a challenge — the exact amounts are listed in **More → Rewards**, because the gym can change them. Rewards are claimed there and handed over at the desk once the gym approves.`;
}

/** Challenges (0052). Progress is counted, so say so — that is the selling point. */
function challengesAnswer(ctx: AssistantContext): string {
  const gated = ctx.access?.excluded.some((e) => /challenge/i.test(e)) ?? false;
  if (gated) {
    return 'Challenges are not part of your current plan. The front desk can tell you which plan includes them.';
  }
  return '**Challenges**\n\nOpen **More → Rewards → Challenges** to see what the gym is running and join one. Your progress is counted automatically from your check-ins and logged workouts — there is nothing to tick off, and nothing you can accidentally forget to record. Finish one and the points are added for you.';
}

/** The set-by-set tracker (0050), as distinct from the quick log that predates it. */
function trackerAnswer(ctx: AssistantContext): string {
  const gated = ctx.access?.excluded.some((e) => /tracker/i.test(e)) ?? false;
  if (gated) {
    return 'Recording exercises set by set is not part of your current plan — but you can still start an empty workout on **Train → Workout** and save it, and that has not changed.\n\nThe front desk can tell you which plan adds the full tracker.';
  }
  return '**Tracking a workout**\n\nOpen **Train → Workout** and start one of your workouts, or an empty one. Add each set as you finish it: reps and weight, or time for things like planks. Every set saves as you enter it, so locking your phone between sets loses nothing.';
}

/** Preset goals (0055) — the five that track themselves. */
function goalsAnswer(): string {
  return '**Goals**\n\nOpen **You → Progress → Targets**. Alongside number goals like "get to 70 kg", there are ready-made ones that track themselves from your check-ins and logged workouts — build consistency, stay active, improve fitness, increase strength, improve endurance.\n\nEach one says exactly how it is counted, and the gym marks it reached for you; you never have to claim it.';
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
    return "I couldn't read what your plan includes just now. Open **You → Membership** and it is listed there.";
  }
  if (a.isFullAccess) {
    return 'Your plan includes everything the app offers, so nothing should be locked. If a screen still shows a lock, tell the front desk — that is a bug, not your membership.';
  }
  return `Your plan does not include: **${a.excluded.join(', ')}**.\n\nEverything else is open to you. The front desk can tell you which plan adds them — payment is in person, in cash.`;
}

/** Trainer certificates (0054) — members never see the file, so be honest about it. */
function credentialsAnswer(): string {
  return "Coaches can upload their certificates for the gym to check, and the gym marks them verified once it has seen the document.\n\nThe certificates themselves aren't shown in the app — you'll see what a coach lists on their profile in **Train → Coach → Find a coach**. Ask the front desk if you want to know more about a coach's qualifications.";
}

/**
 * What a rule answers, for routing while the AI coach can take the message.
 * `fact` (the default) — this gym, this member, where a screen is: always the rules' call.
 * `general` — fitness advice the coach answers better; skipped while it can talk.
 * `injury` — the referral; checked before anything else while it can talk.
 */
type RuleKind = 'fact' | 'general' | 'injury';

const RULES: { match: RegExp; reply: (ctx: AssistantContext) => string; kind?: RuleKind }[] = [
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
    kind: 'general',
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
      '**Cancelling a session**\n\nOpen **Train → Coach → All your sessions**, find it and cancel it there. If it is close to the start time, tell the front desk or your coach as well so the slot can be reused.',
  },
  {
    match: /\b(?:refund|reimburs\w*|money back|sauli)\b/,
    reply: refundAnswer,
  },
  {
    match: /\b(?:freeze|frozen|paus\w*|cancel\w*|hinto|tigil)\b/,
    reply: freezeAnswer,
  },
  {
    // `when does` deliberately absent: "when does the gym open" would have been
    // answered with this member's membership expiry.
    match: /\b(?:my (?:membership|plan)|expir\w*|days? left|renew\w*|matatapos|hanggang kailan)\b/,
    reply: membershipAnswer,
  },
  {
    // Before the check-in code rule: "How many times did I check in this month?" matched
    // its bare `check in` and was answered with the code (staging QA, AST-VISITS, 2026-11-13).
    match: /\b(?:how many (?:times )?(?:did|have) i|how many check ?-?ins?|check(?:ed)? ?-?ins? (?:this|last) (?:month|week))\b/,
    reply: visitsAnswer,
  },
  {
    match: /\b(?:my code|check ?-?in code|qr|scan|check(?:ed)? ?-?in|code ko)\b/,
    reply: (ctx) =>
      ctx.memberId
        ? `Your check-in code is **${formatCheckInCode(ctx.memberId)}**.\n\nTap the check-in block at the right end of the bottom bar to show your code at the desk. If the scanner won't read it, read those six characters out instead.`
        : NO_CONTEXT,
  },
  {
    match: /\b(?:next (?:session|class|booking)|upcoming|booked|my bookings?)\b/,
    reply: (ctx) =>
      ctx.nextBooking && ctx.nextBooking.startsAt
        ? `Your next session is **${ctx.nextBooking.title}** on ${dateLabel(ctx.nextBooking.startsAt)} at ${timeLabel(ctx.nextBooking.startsAt)}.\n\n${ctx.nextBooking.subtitle}`
        : `You have nothing booked at the moment. ${ctx.setup?.classesOn ? 'Ask for a 1-on-1 on **Train → Coach**, or join a class on **Train → Classes**.' : 'Ask for a 1-on-1 on **Train → Coach**.'}`,
  },
  {
    // NOT a bare `how many`: it swallowed "how many times a week should I train
    // legs" — a programming question — and answered it with this month's
    // check-in count. The phrase has to actually be about visiting.
    match: /\b(?:visits?|attendance|been to the gym|how many times have i|ilang beses|pumunta)\b/,
    reply: visitsAnswer,
  },
  {
    // The app genuinely has these screens, so this is a real answer, not a
    // redirection to the desk.
    match: /\b(?:password|passwor\w*|forgot my|reset|change my email|update my email|log ?in again)\b/,
    reply: () =>
      '**Your account**\n\n• Change your password or email: **More → Settings**\n\nIf you cannot sign in at all, the front desk can reset it for you.',
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
    // Before prices: "how much is a package" and "the difference between a session and a
    // package" are about how this gym runs coaching, not the membership price list.
    match: /\b(?:packages?|pakete|differen\w*|pagkakaiba)\b/,
    reply: bookingAnswer,
  },
  {
    // Before prices too: "how much is a day pass" is not a membership plan.
    match: /\b(?:day ?pass\w*|walk ?-?ins?|drop ?-?ins?)\b/,
    reply: dayPassAnswer,
  },
  {
    match: /\b(?:price|pricing|cost|fee|how much|plan|tier|magkano|presyo|bayad)s?\b/,
    reply: (ctx) =>
      ctx.plans.length === 0
        ? 'I could not load the current plans. Ask at the front desk, or open **You → Membership**.'
        : ['**Current plans:**']
            .concat(
              ctx.plans.map(
                (p) =>
                  `• ${p.name} — ₱${Number(p.price).toLocaleString()}${
                    p.duration_days == null ? ', no expiry' : ` for ${p.duration_days} days`
                  }`
              )
            )
            .concat(['', 'To renew or change plan: **You → Membership → Renew or change plan**.'])
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
    reply: (ctx) =>
      ctx.setup && !ctx.setup.classesOn
        ? `Your gym does not run group classes in the app. ${ASK_DESK}`
        : 'Open **Train → Classes**. It lists every class the gym is actually running, with the coach and the times. If you do not see it there, the front desk can tell you whether it is planned.',
  },
  {
    match: /\b(?:book\w*|class(?:es)?|schedul\w*|sessions?|reserv\w*|paano mag)\b/,
    reply: bookingAnswer,
  },
  {
    match: /\b(?:my trainer|my coach|who is my|assigned|sino.*(?:trainer|coach))\b/,
    reply: (ctx) =>
      ctx.nextBooking
        ? `Your next session is with **${ctx.nextBooking.subtitle}**. Every coach is on **Train → Coach → Find a coach**, with what each one specialises in.`
        : 'You do not have a coach yet. **Train → Coach → Find a coach** lists every coach and what they specialise in.',
  },
  {
    match: /\b(?:trainers?|coach(?:es)?|pt|personal train\w*)\b/,
    reply: bookingAnswer,
  },
  {
    // Safety first, and consistent with planBuilder.ts: a stated injury gets a
    // referral, never advice. This is not a topic a keyword table should answer.
    match: /\b(?:injur\w*|hurt\w*|pain\w*|sore|sprain\w*|masakit|sakit)\b/,
    kind: 'injury',
    reply: () =>
      'If something hurts — sharp pain rather than normal effort — stop that movement and speak to a trainer before your next session. For anything persistent, please see a doctor or physiotherapist. This app is not the right place for that advice.',
  },
  {
    match: /\b(?:how do i do|form|technique|proper way|posture|squat|deadlift|bench|push ?-?up)\b/,
    kind: 'general',
    reply: () =>
      '**Learning a movement**\n\n• **Train → Workout → Library** has workouts and videos the gym recommends\n• A 1-on-1 session is the fastest way to have your form watched: **Train → Coach**\n\nHaving the main lifts checked once is worth more than reading about them.',
  },
  {
    match: /\b(?:eat|diet|nutrition|food|protein|meal|calorie|kain|pagkain)s?\b/,
    kind: 'general',
    reply: () =>
      'General practice: get protein into every main meal, eat something with carbohydrate an hour or two before training, and drink water across the day. For anything specific to you, your health or your medication, please ask a coach or a qualified professional rather than an app.',
  },
  {
    match: /\b(?:amenit\w*|facilit\w*|equipment|shower|locker|parking|wifi|wi-?fi|aircon|banyo)s?\b/,
    // Never a list typed here: it once promised lockers, showers and classes at every gym.
    reply: (ctx) =>
      ctx.setup?.equipmentOn
        ? '**More → Equipment** lists what your gym has and where it is. For parking, wifi and the like, the front desk can tell you.'
        : `What the gym has on site is not listed in the app. ${ASK_DESK}`,
  },
  {
    match: /\b(?:guest|friend|bring\w*|walk ?-?in|trial|day ?pass\w*|drop ?-?ins?|kasama|isama)\b/,
    reply: dayPassAnswer,
  },
  {
    match: /\b(?:dress code|attire|wear|shoes|age limit|minor|rules?|policy|policies|bawal|pwede ba)\b/,
    reply: () =>
      `Your gym's house rules are in **More → Help → Terms of service**. For anything not written there, the front desk can tell you.`,
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
      'Your gym takes **cash at the front desk**. Your membership extends the moment staff record the payment, and the receipt appears under **You → Membership → Payments**.',
  },
  {
    // NOT a bare `weights`: "should I do cardio before or after weights" is a
    // programming question, not a request to open the logging screen.
    match: /\b(?:progress|my weight|weigh ?-?ins?|measurement|body ?map|log my|goals?)s?\b/,
    reply: () =>
      '**Tracking progress**\n\n• Weight and measurements: **You → Progress → Body**\n• Targets: **You → Progress → Targets**\n• Workouts: **Train → Workout**\n\nYou can also just tell me, for example *log my weight 72 kg*, and I will save it after you tap Save.',
  },
  {
    match: /\b(?:event|announce\w*)s?\b/,
    reply: () => 'Anything the gym has coming up is in **More → Inbox → From the gym**.',
  },
  { match: /\b(?:thanks?|thank you|salamat)\b/, reply: () => 'Anytime. Enjoy your session.' },
  {
    match: /\b(?:hello|hi|hey|kumusta|kamusta|good (?:morning|afternoon|evening))\b/,
    reply: (ctx) => (ctx.firstName ? `Hello ${ctx.firstName}. What do you need?` : 'Hello. What do you need?'),
  },
];

const FALLBACK =
  "I don't have an answer for that one. I can help with:\n\n• Your membership, days left and payments\n• Your check-in code and visits\n• How sessions, packages and bookings work here\n• Prices, opening hours, day passes and where the gym is\n• Freezing, cancelling and refunds\n• Logging your weight and measurements\n\nFor anything else, the front desk is the fastest route.";

/**
 * True when `answerFor` had nothing and returned the catch-all.
 *
 * Compared against the constant rather than sniffing for a phrase, so editing
 * the fallback's wording cannot silently stop the model fallback from firing.
 */
export const RULE_FALLBACK = FALLBACK;

export function isRuleFallback(answer: string): boolean {
  return answer === FALLBACK;
}

/**
 * A request for the coach to make or change something: a request verb, then a
 * training or eating object. "Propose a Mon/Wed/Fri schedule", "set a goal to
 * work out 3 times a week", "make me a meal plan" were each caught by a keyword
 * (`schedul`, `set a goal`, `plan`, `meal`) and answered with a canned help
 * text. The verb must come before the object, so in "how much is the premium
 * plan" `plan` cannot be both; the membership plans are refused as objects.
 */
const COACH_REQUEST =
  /\b(?:propose|suggest|recommend|make|create|build|design|plan|set(?: up)?|change|update|adjust|swap|give me|help me|can you|could you|write|add)\b.*?\b(?:routines?|workouts?|programs?|programmes?|(?<!(?:premium|free|membership|trial|gym) )plans?|schedules?|weeks?|days|split|goals?|meals?|diet|food|eating|nutrition|exercises?|training|reminders?)\b/;

/**
 * A question that wants an explanation, not a fact or a screen: "what's the difference between
 * a session, a booking and a package", "explain how freezing works". A keyword card answers one
 * word of it (the 2026-11-23 screenshot answered "session" with a booking card); the coach reads
 * the gym's own setup (get_gym_info) and explains the whole question.
 */
const EXPLAIN = /\b(?:differen\w*|pagkakaiba|explain\w*|ipaliwanag|compare|versus|vs\.?|how does (?:it|this|the|a|an|booking|freezing|coaching)\b.*\bwork|what(?:'s| is| are) (?:a |an |the )?(?:package|session|booking|class)e?s?\b(?! today))\b/;

/**
 * `opts.coach`: the AI coach can take this message. Only then does a request
 * to make or change something, or a general form/eating/goals question, fall
 * through to the coach — every fact stays the rules'. Without it (the popup,
 * a member without the coach, a coach at its limit) nothing changes.
 */
export function answerFor(
  question: string,
  ctx: AssistantContext,
  opts?: { coach?: boolean },
): string {
  const q = question.toLowerCase();
  if (opts?.coach) {
    // The referral always wins: a stated injury is never the coach's to plan around.
    for (const rule of RULES) {
      if (rule.kind === 'injury' && rule.match.test(q)) return rule.reply(ctx);
    }
    if (COACH_REQUEST.test(q) || EXPLAIN.test(q)) return FALLBACK;
    for (const rule of RULES) {
      if (rule.kind === 'general' || rule.kind === 'injury') continue;
      if (rule.match.test(q)) return rule.reply(ctx);
    }
    return FALLBACK;
  }
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
  const book = ctx.setup?.classesOn === false ? 'How do I book a session?' : 'How do I book a class?';
  return [...personal, ...extras, book, 'Opening hours', 'Prices'].slice(0, 5);
}

/** Every reading the Progress → Body screen takes (`body_measurements`), with the words members use. */
export const READING_FIELDS = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', words: 'weight|weigh|weighed|timbang', min: 20, max: 400 },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%', words: 'body ?fat|bf', min: 2, max: 75 },
  { key: 'height_cm', label: 'Height', unit: 'cm', words: 'height|tangkad', min: 50, max: 250 },
  { key: 'waist_cm', label: 'Waist', unit: 'cm', words: 'waist|baywang', min: 30, max: 250 },
  { key: 'chest_cm', label: 'Chest', unit: 'cm', words: 'chest|dibdib', min: 40, max: 250 },
  { key: 'hips_cm', label: 'Hips', unit: 'cm', words: 'hips?|balakang', min: 40, max: 250 },
  { key: 'arms_cm', label: 'Arms', unit: 'cm', words: 'arms?|biceps?|braso', min: 10, max: 100 },
  { key: 'thighs_cm', label: 'Thighs', unit: 'cm', words: 'thighs?|hita', min: 20, max: 150 },
  { key: 'neck_cm', label: 'Neck', unit: 'cm', words: 'neck|leeg', min: 20, max: 80 },
  { key: 'shoulders_cm', label: 'Shoulders', unit: 'cm', words: 'shoulders?|balikat', min: 60, max: 200 },
  { key: 'forearm_cm', label: 'Forearms', unit: 'cm', words: 'forearms?', min: 10, max: 80 },
  { key: 'calf_cm', label: 'Calves', unit: 'cm', words: 'calf|calves|binti', min: 15, max: 80 },
] as const;
export type ReadingKey = typeof READING_FIELDS[number]['key'];
export interface Reading { measuredOn: 'today' | 'yesterday'; values: Partial<Record<ReadingKey, number>> }

/** The card's lines, e.g. "Weight 72 kg". */
export function readingLines(r: Reading): string[] {
  return READING_FIELDS.filter((f) => r.values[f.key] != null).map((f) => `${f.label} ${r.values[f.key]}${f.unit === '%' ? '%' : ` ${f.unit}`}`);
}

/** The coach's propose_reading values → a Reading, keeping only known fields inside Progress's ranges. */
export function readingFromValues(raw: Record<string, unknown>, measuredOn: Reading['measuredOn']): Reading | null {
  const values: Reading['values'] = {};
  for (const f of READING_FIELDS) {
    const v = raw[f.key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= f.min && v <= f.max) values[f.key] = v;
  }
  return Object.keys(values).length ? { measuredOn, values } : null;
}

const LOG_INTENT = /\b(?:log|record|save|add|update|put|enter|i-?log|ilagay|i weigh|weighed|i'?m|i am|my [a-z ]{2,20} (?:is|was|are|were|now))\b/;

/**
 * "Log my weight 72 kg", "waist 80 cm and chest 100", "I weigh 68.5 today" → a reading to confirm,
 * or null. Needs a logging intent and a number beside a known reading; a question about how to
 * log ("how do I log my weight") has no number and stays a question. Out-of-range values are
 * dropped (Progress refuses them too), and pounds or inches are never converted: a guess at a unit
 * would be a made-up reading.
 */
export function readingFrom(question: string): Reading | null {
  const q = question.toLowerCase();
  if (!LOG_INTENT.test(q) || /\b(?:lbs?|pounds?|inch\w*|in\.)\b/.test(q)) return null;
  const values: Reading['values'] = {};
  // Longest words first, so "forearm" is not read as "arm" and "body fat" not as nothing.
  const fields = [...READING_FIELDS].sort((a, b) => b.words.length - a.words.length);
  let rest = q;
  for (const f of fields) {
    const m = new RegExp(`\\b(?:${f.words})\\b[^\\d]{0,20}?(\\d{1,3}(?:[.,]\\d{1,2})?)(?![\\d.]|\\s*(?:mins?|minutes?|reps?|sets?|times?|days?|weeks?|secs?|seconds?|hours?|hrs?|x)\\b)`).exec(rest);
    if (!m) continue;
    const v = Number(m[1].replace(',', '.'));
    if (v >= f.min && v <= f.max) values[f.key] = v;
    rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  if (Object.keys(values).length === 0) return null;
  return { measuredOn: /\b(?:yesterday|kahapon)\b/.test(q) ? 'yesterday' : 'today', values };
}
