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

  return [
    // `\bopen\b` deliberately, so "opening hours" matches but "opened" does not
    // pull an hours answer out of an unrelated sentence.
    { pattern: /gym hours|operating hours|opening hours|anong oras|\bbukas\b|\bopen\b/i, responses: hours },
    { pattern: /membership|\bplan\b|\bfee\b|price|magkano|presyo|bayad/i, responses: membership },
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
  en: "I don't have an answer for that. I can only report what's in the system — try asking about opening hours, membership plans, trainers, the class timetable, check-in, or the gym's contact details.",
  fil: 'Wala akong sagot diyan. Ang naiuulat ko lang ay ang nasa sistema — subukang magtanong tungkol sa oras ng pagbubukas, membership plans, trainers, iskedyul ng klase, check-in, o contact details ng gym.',
};
