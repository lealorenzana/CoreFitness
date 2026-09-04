import type { ChatbotResponse } from '../types';
import { DAY_NAMES } from '../lib/api/classTemplates';
import type { ChatbotContext } from '../services/chatbotService';

/**
 * The admin assistant's answers, assembled from live data.
 *
 * Rule-based and deterministic — a regex table, not a model call. What changed is
 * where the *answers* come from: every one of them used to be a string literal,
 * and most of those literals were fiction (see `chatbotService.ts` for the list).
 *
 * Two rules for anything added here:
 *  - **Never invent a fallback.** If the data is missing, say it is missing and
 *    name the page that sets it. A confident wrong answer about the gym's phone
 *    number is worse than "not set yet".
 *  - **Run the regex before trusting it.** `/hi/` matched "this", "which" and
 *    "hindi", so "What is this?" was answered with a greeting. Every pattern here
 *    that is a short word is `\b`-anchored for that reason.
 */

/** 'HH:MM:SS' → '5:00 AM'. Wall-clock only — never routed through a Date. */
function timeLabel(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function planLine(name: string, price: number, durationDays: number | null): string {
  const amount = `₱${price.toLocaleString()}`;
  if (durationDays === null) return `${name} — ${amount} (does not expire)`;
  if (durationDays === 30) return `${name} — ${amount}/month`;
  return `${name} — ${amount} / ${durationDays} days`;
}

/** A bilingual answer built from whatever the database actually holds. */
function say(en: string, fil: string) {
  return { en, fil };
}

/**
 * The opening line, which names the gym from its own record.
 *
 * Exported because the chat window shows it before any question is asked — and
 * because pulling it out of the rules array by index would break the first time
 * a rule is reordered.
 */
export function buildGreeting(ctx: ChatbotContext) {
  const name = ctx.gym?.gym_name ?? 'Core Fitness';
  return say(
    `Hello! I'm the ${name} admin assistant. Ask me about opening hours, membership plans, trainers, the class timetable, or how check-in works.`,
    `Kumusta! Ako ang admin assistant ng ${name}. Magtanong tungkol sa oras ng pagbubukas, membership plans, trainers, iskedyul ng klase, o paano mag-check in.`
  );
}

export function buildChatbotResponses(ctx: ChatbotContext): ChatbotResponse[] {
  const { gym, plans, trainers, templates } = ctx;

  // ---- Opening hours -------------------------------------------------------
  const hours =
    gym?.opening_time && gym?.closing_time
      ? say(
          `${gym.gym_name} is open ${timeLabel(gym.opening_time)} to ${timeLabel(gym.closing_time)}. Classes scheduled outside those hours are flagged on the Schedule page.`,
          `Bukas ang ${gym.gym_name} mula ${timeLabel(gym.opening_time)} hanggang ${timeLabel(gym.closing_time)}. Ang mga klaseng labas sa oras na ito ay minamarkahan sa Schedule page.`
        )
      : say(
          'The opening hours have not been set yet. You can set them in Settings → Gym Information.',
          'Wala pang nakatakdang oras ng pagbubukas. Maaari itong itakda sa Settings → Gym Information.'
        );

  // ---- Membership plans ----------------------------------------------------
  const membership =
    plans.length > 0
      ? say(
          `Active membership plans:\n${plans.map((p) => `• ${planLine(p.name, p.price, p.duration_days)}`).join('\n')}`,
          `Mga aktibong membership plan:\n${plans.map((p) => `• ${planLine(p.name, p.price, p.duration_days)}`).join('\n')}`
        )
      : say(
          'No active membership plans are set up yet. Add them on the Membership Plans page.',
          'Wala pang aktibong membership plan. Maaari kayong magdagdag sa Membership Plans page.'
        );

  // ---- Location ------------------------------------------------------------
  const location = gym?.address?.trim()
    ? say(
        `${gym.gym_name} is at ${gym.address.trim()}.`,
        `Ang ${gym.gym_name} ay matatagpuan sa ${gym.address.trim()}.`
      )
    : say(
        'The gym address has not been set yet. You can set it in Settings → Gym Information.',
        'Wala pang nakatakdang address ng gym. Maaari itong itakda sa Settings → Gym Information.'
      );

  // ---- Contact -------------------------------------------------------------
  const contactBits = [gym?.phone?.trim(), gym?.email?.trim()].filter(Boolean) as string[];
  const contact =
    contactBits.length > 0
      ? say(
          `${gym?.gym_name ?? 'The gym'} — ${contactBits.join(' · ')}. These are the details printed on member receipts.`,
          `${gym?.gym_name ?? 'Ang gym'} — ${contactBits.join(' · ')}. Ito rin ang nakalimbag sa mga resibo ng miyembro.`
        )
      : say(
          'No contact number or email has been set yet. Add them in Settings → Gym Information — they also appear on member receipts.',
          'Wala pang nakatakdang numero o email. Idagdag ito sa Settings → Gym Information — lumalabas din ito sa mga resibo.'
        );

  // ---- Trainers ------------------------------------------------------------
  const trainerLines = trainers.map((t) =>
    t.specialization?.trim() ? `• ${t.name} — ${t.specialization.trim()}` : `• ${t.name}`
  );
  const trainerAnswer =
    trainers.length > 0
      ? say(
          `${trainers.length} trainer${trainers.length === 1 ? '' : 's'} on the roster:\n${trainerLines.join('\n')}`,
          `${trainers.length} trainer${trainers.length === 1 ? '' : 's'} sa roster:\n${trainerLines.join('\n')}`
        )
      : say(
          'There are no trainers on the roster yet. You can add one from the Trainers page.',
          'Wala pang trainer sa roster. Maaari kayong magdagdag sa Trainers page.'
        );

  // ---- Weekly class plan ---------------------------------------------------
  // Sorted by day then start time so the answer reads like the timetable does.
  const sorted = [...templates].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)
  );
  const shown = sorted.slice(0, 8);
  const classLines = shown.map(
    (t) => `• ${DAY_NAMES[t.day_of_week]} ${timeLabel(t.start_time)} — ${t.name}`
  );
  const more = sorted.length - shown.length;
  const classAnswer =
    sorted.length > 0
      ? say(
          `The weekly plan has ${sorted.length} recurring class${sorted.length === 1 ? '' : 'es'}:\n${classLines.join('\n')}${more > 0 ? `\n…and ${more} more on the Schedule page.` : ''}`,
          `May ${sorted.length} regular na klase ang lingguhang plano:\n${classLines.join('\n')}${more > 0 ? `\n…at ${more} pa sa Schedule page.` : ''}`
        )
      : say(
          'No recurring classes are set up yet. Add them on the Schedule page, then generate the dated sessions members book against.',
          'Wala pang regular na klase. Idagdag ito sa Schedule page, pagkatapos ay i-generate ang mga session na bino-book ng miyembro.'
        );

  // ---- Check-in activities -------------------------------------------------
  // `activity_options` is the gym's own list (0018). There is no equipment or
  // facilities inventory in this system, and the answer says so rather than
  // listing a boxing ring and a yoga studio nobody recorded.
  const activities = gym?.activity_options ?? [];
  const activityAnswer =
    activities.length > 0
      ? say(
          `Members pick from these activities at check-in: ${activities.join(', ')}. Edit the list in Settings → Check-in activities. The system does not keep an equipment inventory.`,
          `Ito ang mga aktibidad na pinipili sa check-in: ${activities.join(', ')}. Baguhin ang listahan sa Settings → Check-in activities. Walang talaan ng kagamitan ang sistema.`
        )
      : say(
          'No check-in activities have been configured yet — set them in Settings. The system does not keep an equipment inventory.',
          'Wala pang nakatakdang check-in activities — itakda ito sa Settings. Walang talaan ng kagamitan ang sistema.'
        );

  // ---- How check-in works --------------------------------------------------
  const checkIn = say(
    'A member checks in by showing their QR code, or by reading out the 6-character code in their app if the camera fails. Both are on the Attendance page. A check-in recorded today can be undone there; older ones cannot.',
    'Nagche-check in ang miyembro gamit ang QR code, o sa pamamagitan ng 6-character na code sa app kung hindi gumana ang camera. Nasa Attendance page ang dalawa. Ang check-in ngayong araw ay maaaring bawiin doon; ang mas luma ay hindi.'
  );

  // ---- What a plan unlocks (0049) -----------------------------------------
  // Describes where the control is rather than listing the current settings:
  // the matrix is per plan and the admin is looking at it on the next screen,
  // so repeating a snapshot here is how the two start disagreeing.
  const gating = say(
    'Each plan controls which parts of the member app it unlocks. Open **Membership Plans** and scroll to **What each plan unlocks** — one row per feature, one checkbox per plan.\n\nMembers on a plan without a tick see the feature explained and locked, not hidden, so they can see what upgrading gets them. Class and personal-training limits are separate, in the plan\'s own form above that table.',
    'Kinokontrol ng bawat plan kung aling bahagi ng member app ang bukas. Buksan ang **Membership Plans** at hanapin ang **What each plan unlocks**.\n\nAng members na walang tsek ay nakakakita ng paliwanag at naka-lock — hindi nakatago — para malaman nila kung ano ang makukuha sa pag-upgrade.'
  );

  // ---- CORE Points (0051) --------------------------------------------------
  const points = say(
    'Members earn CORE Points for checking in, logging workouts, attending sessions, reaching goals and finishing challenges. You set what each is worth, and you approve every reward claim.\n\nOpen **Rewards** to add rewards and to work the approval queue. Points cannot be created by hand — not by staff, not by you — because they are only ever awarded for something a member actually did. To be generous, add a cheaper reward.',
    'Kumikita ang members ng CORE Points sa pag-check in, pag-log ng workout, pagdalo, at pagtapos ng challenge. Ikaw ang nag-a-approve ng bawat reward.\n\nBuksan ang **Rewards**. Hindi puwedeng magbigay ng points nang manu-mano — para sa aktuwal na ginawa lang ito.'
  );

  // ---- Challenges (0052) ---------------------------------------------------
  const challenges = say(
    'Open **Challenges** to run one: a title, what is counted, a target, a date range and a points reward.\n\nProgress is counted from real check-ins and logged workouts inside that date range — members cannot self-report it, and there is no mark-complete button for you either, because whoever could hand out a completion could hand out its points. Only metrics that can be counted inside a window are offered; streaks and days-since-joining are left out because a windowed target for them would be meaningless.',
    'Buksan ang **Challenges**. Ang progress ay binibilang mula sa totoong check-ins at workouts sa loob ng petsa — hindi ito puwedeng i-report ng member, at wala ring mark-complete button para sa iyo.'
  );

  // ---- Exercises (0050) ----------------------------------------------------
  const exercises = say(
    'The exercise list members choose from when tracking a workout lives in **Exercises**.\n\nAn exercise that members have already logged cannot be deleted — that would rewrite their training history — so hide it instead and every past set stays intact. Names are matched ignoring case, so "Bench Press" and "bench press" cannot both exist and split the history.',
    'Ang listahan ng exercises ay nasa **Exercises**. Hindi puwedeng burahin ang exercise na may naka-log na set — itago na lang, at mananatili ang lahat ng dating record.'
  );

  // ---- Trainer credentials (0054) ------------------------------------------
  const credentials = say(
    'Trainers upload their certificates from their own profile in the phone app; you review them in **Credentials**.\n\nFiles open through a link that expires after five minutes, and only you and the trainer who uploaded it can open them — not staff, not members. A trainer cannot mark their own document verified. Rejecting one requires a reason, which the trainer sees.',
    'Nag-a-upload ang mga trainer ng sertipiko mula sa kanilang profile; sinusuri mo ito sa **Credentials**.\n\nLimang minuto lang bago mag-expire ang link, at ikaw at ang trainer lang ang makakabukas. Hindi puwedeng i-verify ng trainer ang sarili niyang dokumento.'
  );

  return [
    // 0049-0055, above the older patterns they would otherwise be swallowed by:
    // `membership|\bplan\b` catches "what does each plan unlock", and
    // `/trainer|coach/` catches "trainer certificates".
    { pattern: /unlock|gat(?:e|ing)|feature matrix|what does each plan|locked for members|restrict/i, responses: gating },
    { pattern: /core ?points?|\bpoints?\b|reward|redeem|redemption/i, responses: points },
    { pattern: /challenge/i, responses: challenges },
    { pattern: /exercise|movement|lift list|catalogue|catalog/i, responses: exercises },
    { pattern: /certif|qualif|credential|licens|accredit/i, responses: credentials },
    // `\bopen\b` deliberately, so "opening hours" matches but "opened" does not
    // pull an hours answer out of an unrelated sentence.
    { pattern: /gym hours|operating hours|opening hours|anong oras|\bbukas\b|\bopen\b/i, responses: hours },
    // `\bplans?\b`, not `\bplan\b` — the trailing `\b` meant "what plans do you
    // have" matched nothing and fell through to the fallback, which is the same
    // shape as `amenit` never matching "amenities". Found by running the
    // patterns rather than reading them.
    { pattern: /membership|\bplans?\b|\bfees?\b|price|magkano|presyo|bayad/i, responses: membership },
    // `locat`, not `location` — "Where are you located?" contains neither
    // "location" nor "address", and fell through to the fallback.
    { pattern: /locat|address|nasaan|\bsaan\b|where is the gym|where are you/i, responses: location },
    { pattern: /contact|phone|number|email|tawag/i, responses: contact },
    { pattern: /trainer|coach|instructor/i, responses: trainerAnswer },
    { pattern: /class|schedule|timetable|klase|iskedyul/i, responses: classAnswer },
    { pattern: /activit|facilit|equipment|kagamitan/i, responses: activityAnswer },
    { pattern: /check.?in|attendance|\bqr\b|pumasok/i, responses: checkIn },
    { pattern: /\bhello\b|\bhi\b|\bhey\b|kumusta/i, responses: buildGreeting(ctx) },
    {
      pattern: /thank|salamat/i,
      responses: say(
        "You're welcome. Ask away if anything else comes up.",
        'Walang anuman. Magtanong lang kung may iba pa.'
      ),
    },
  ];
}

export const FALLBACK_RESPONSE = {
  en: "I don't have an answer for that. I can only report what's in the system — try asking about opening hours, membership plans, what each plan unlocks, trainers and their certificates, the class timetable, exercises, CORE Points and rewards, challenges, check-in, or the gym's contact details.",
  fil: 'Wala akong sagot diyan. Ang naiuulat ko lang ay ang nasa sistema — subukang magtanong tungkol sa oras ng pagbubukas, membership plans, kung ano ang bukas sa bawat plan, trainers at sertipiko nila, iskedyul ng klase, exercises, CORE Points at rewards, challenges, check-in, o contact details ng gym.',
};
