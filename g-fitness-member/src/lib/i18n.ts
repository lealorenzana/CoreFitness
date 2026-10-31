import { useCallback, useSyncExternalStore } from 'react';
import { supabase } from './supabaseClient';
import { assertWrote } from './api/mutate';

/**
 * English or Filipino for the phone app's main screens (2026-09-19).
 *
 * **Keyed by the English text itself**: `t('Today')` is 'Today' in English and
 * 'Ngayon' in Filipino. A string with no entry falls back to the English, so a
 * screen not yet translated reads in English rather than breaking — the honest
 * failure. Every string the app passes through `t()` has its Filipino here
 * (`scripts/i18n-missing.py` lists any that does not).
 *
 * **The rules (guides G3, 2026-10-31): everyday Taglish**, the way members and
 * coaches actually talk at the gym — never textbook Tagalog or a word-for-word
 * machine translation. App words stay English: check in, session, workout,
 * points, coach, package, routine, program, membership, chat, classwork,
 * profile, settings, notifications, password, email, app, QR. "Mo/ko/natin"
 * over "ninyo/inyo"; short over formal ("Mamaya na" over "Hindi muna ngayon").
 *
 * The choice is `member_profiles.preferred_language` (0095) — a column, not
 * localStorage, so it follows the member to a new phone (CLAUDE.md: per-user
 * state never lives on one device). Held in memory for the session and reset to
 * English in logout(), like every other per-member cache.
 */

export type Lang = 'en' | 'fil';

const FIL: Record<string, string> = {
  "Today": "Ngayon",
  "Train": "Training",
  "You": "Ikaw",
  "More": "Iba pa",
  "Check in": "Mag-check in",
  "Checked in": "Naka-check in",
  "Your day": "Ang araw mo",
  "Your level, progress and membership": "Level, progress at membership mo",
  "Good morning": "Magandang umaga",
  "Good afternoon": "Magandang hapon",
  "Good evening": "Magandang gabi",
  "This week": "Ngayong linggo",
  "Your account": "Account mo",
  "Inbox": "Inbox",
  "Everything sent to you": "Lahat ng pinadala sa’yo",
  "Rewards": "Rewards",
  "Points, challenges, what you can get": "Points, challenges, at ano ang makukuha mo",
  "Assistant": "Assistant",
  "Questions about training and the gym": "Mga tanong tungkol sa training at sa gym",
  "Shop": "Shop",
  "What the gym sells": "Mga binebenta ng gym",
  "Equipment": "Equipment",
  "What the gym has, how to use it": "Ano ang meron sa gym, at paano gamitin",
  "Invite a friend": "Mag-invite ng kaibigan",
  "Share your gym": "I-share ang gym mo",
  "Gyms": "Mga gym",
  "Switch gym, or join another": "Lumipat ng gym, o sumali sa iba",
  "Profile": "Profile",
  "Your name, photo and details": "Pangalan, photo at details mo",
  "Settings": "Settings",
  "Alerts, privacy, sign-in, password, email": "Alerts, privacy, sign-in, password, email",
  "Help": "Tulong",
  "Contact your gym, terms and privacy": "Kontakin ang gym mo, terms at privacy",
  "Workout": "Workout",
  "Coach": "Coach",
  "Classes": "Classes",
  "Your plan": "Plan mo",
  "Library": "Library",
  "Plan your week": "I-plan ang linggo mo",
  "Your training days and reminders": "Mga training day at reminder mo",
  "Pick your training days and get a reminder": "Pumili ng training days at magpa-remind",
  "Following": "Sinusundan",
  "week": "week",
  "of": "sa",
  "every day done": "tapos na lahat ng araw",
  "A workout is under way": "May workout kang hindi pa tapos",
  "Pick up where you left off": "Ituloy kung saan ka huminto",
  "Nothing planned today": "Walang naka-plan ngayon",
  "Start one of your workouts, or an empty one": "Simulan ang isa sa workouts mo, o isang bago",
  "Next": "Susunod",
  "Week": "Week",
  "Day": "Day",
  "last time": "huling beses",
  "exercise": "exercise",
  "exercises": "exercises",
  "See workouts": "Tingnan ang workouts",
  "Continue": "Ituloy",
  "Start": "Simulan",
  "Start one": "Magsimula",
  "Starting…": "Sinisimulan…",
  "Your workouts": "Workouts mo",
  "Your saved workouts": "Mga naka-save mong workout",
  "saved": "naka-save",
  "make your own": "gumawa ng sarili mo",
  "Free workouts": "Libreng workouts",
  "No plan needed": "Kahit walang plan",
  "Programs": "Programs",
  "Multi-week plans to follow": "Mga plan na ilang linggo mong susundan",
  "Your package": "Package mo",
  "Your sessions": "Sessions mo",
  "All your sessions": "Lahat ng sessions mo",
  "Your sessions could not be loaded. Pull to try again.": "Hindi ma-load ang sessions mo. I-pull para subukan ulit.",
  "No sessions yet. Book one with any coach.": "Wala pang session. Mag-book sa kahit sinong coach.",
  "With": "Kasama si",
  "Your coach": "Coach mo",
  "Chat": "Chat",
  "done": "tapos na",
  "waiting for them to say yes": "hinihintay ang oo niya",
  "confirmed": "confirmed",
  "declined": "hindi tinanggap",
  "cancelled": "na-cancel",
  "Book a session": "Mag-book ng session",
  "Find a coach": "Maghanap ng coach",
  "Progress": "Progress",
  "Body": "Katawan",
  "Weight and measurements": "Timbang at sukat",
  "in a month": "sa isang buwan",
  "Targets": "Targets",
  "What you are working towards": "Ang pinaghihirapan mo",
  "working on": "ginagawa",
  "reached": "naabot",
  "Progress photos": "Progress photos",
  "Private": "Private",
  "Private, yours to compare": "Private, ikaw lang ang magkukumpara",
  "photo": "photo",
  "photos": "photos",
  "Membership": "Membership",
  "Membership expired": "Expired na ang membership",
  "No active membership": "Walang active na membership",
  "Scanned — you are in": "Na-scan na — pasok ka na",
  "valid to": "hanggang",
  "read the code out if the camera fails": "basahin ang code kung ayaw gumana ng camera",
  "What are you doing today?": "Ano ang gagawin mo ngayon?",
  "Make this my usual": "Gawin itong usual ko",
  "Your usual": "Usual mo",
  "Picked for you every visit": "Naka-pick na para sa’yo tuwing punta mo",
  "Not picked — the desk can tag it": "Wala pang pinili — ang desk na lang ang maglalagay",
  "The desk can still change it.": "Pwede pa itong palitan ng desk.",
  "Show the QR code bigger": "Palakihin ang QR code",
  "Alerts, privacy and your account": "Alerts, privacy at account mo",
  "Notifications": "Notifications",
  "What your trainer sees": "Ano ang nakikita ng coach mo",
  "Your data": "Data mo",
  "Account & app": "Account at app",
  "About": "Tungkol dito",
  "Language": "Wika",
  "Log out": "Mag-log out",
  "Turn on notifications": "I-on ang notifications",
  "Turn on": "I-on",
  "Turning on…": "Ino-on…",
  "Notifications are on for this phone": "Naka-on ang notifications sa phone na ’to",
  "Notifications are blocked on this phone": "Naka-block ang notifications sa phone na ’to",
  "Could not turn notifications on": "Hindi ma-on ang notifications",
  "Open your phone’s Settings → Apps → this app → Notifications, and allow them. Until then everything still arrives in the bell.": "Buksan ang Settings ng phone mo → Apps → itong app → Notifications, at i-allow. Habang wala pa, darating pa rin lahat sa bell.",
  "Bookings, payments, coach notes, messages and reminders — on your phone, even when the app is closed.": "Bookings, bayad, notes ng coach, messages at reminders — sa phone mo, kahit nakasara ang app.",
  "Not now": "Mamaya na",
  "Later": "Mamaya",
  "Got it": "Sige",
  "Assistant button": "Button ng assistant",
  "Beside the bell, or a floating bubble": "Katabi ng bell, o lumulutang na bubble",
  "Header": "Sa itaas",
  "Floating": "Lumulutang",
  "Changes from the assistant": "Mga binago ng assistant",
  "Apply": "I-apply",
  "Applied": "Na-apply",
  "Discard": "Huwag na",
  "Discarded": "Hindi na ginamit",
  "Undo": "I-undo",
  "Undone": "Na-undo",
  "Nothing changes until you tap Apply": "Walang magbabago hangga’t hindi mo pinipindot ang I-apply",
  "Nothing from the assistant yet. Ask it to build you a routine or plan your week, and its suggestion shows up here.": "Wala pang galing sa assistant. Hilingin mong gawan ka ng routine o i-plan ang linggo mo, at lalabas dito ang suggestion niya.",
  "Meal guides are no longer part of the app, so this cannot be applied.": "Wala na ang meal guides sa app, kaya hindi na ito ma-apply.",
  "Replaces:": "Papalitan:",
  "Reason:": "Dahilan:",
  "Target:": "Target:",
  "By": "Ni",
  "by": "ni",
  "a routine": "isang routine",
  "an exercise": "isang exercise",
  "Any workout": "Kahit anong workout",
  "Rest": "Pahinga",
  "Rest day": "Rest day",
  "rest": "pahinga",
  "reps": "reps",
  "set": "set",
  "sets": "sets",
  "a week": "kada linggo",
  "a lighter week every": "mas magaan na linggo kada",
  "weeks": "weeks",
  "next": "susunod",
  "reps a week": "reps kada linggo",
  "sets a week": "sets kada linggo",
  "workout a week": "workout kada linggo",
  "workouts a week": "workouts kada linggo",
  "body fat": "body fat",
  "waist": "baywang",
  "does not use": "hindi gumagamit ng",
  "Starting from": "Simula sa",
  "Set a training plan": "Gumawa ng training plan",
  "reminder": "reminder",
  "Pick a date": "Pumili ng petsa",
  "See calendar": "Tingnan ang calendar",
  "Previous month": "Nakaraang buwan",
  "Next month": "Susunod na buwan",
  "Previous page": "Nakaraang page",
  "Next page": "Susunod na page",
  "Pages": "Pages",
  "page": "page",
  "Close": "Isara",
  "Clear": "I-clear",
  "Loading…": "Naglo-load…",
  "Saving…": "Sine-save…",
  "in": "sa",
  "at": "sa",
  "visit": "punta",
  "visits": "punta",
  "of 7 days this week": "sa 7 araw ngayong linggo",
  "Send exactly": "Ipadala ang eksaktong",
  "Reference number from your receipt": "Reference number sa resibo mo",
  "Receipt screenshot": "Screenshot ng resibo",
  "Add a screenshot of the receipt (helps the desk find it)": "Maglagay ng screenshot ng resibo (para madali itong mahanap ng desk)",
  "Screenshot added — tap to change": "May screenshot na — i-tap para palitan",
  "That did not go through. Try again.": "Hindi pumasok. Subukan ulit.",
  "A cancelled booking cannot be restored here.": "Hindi na maibabalik dito ang na-cancel na booking.",
  "The gym’s booking rules still apply — some bookings wait for approval.": "Sinusunod pa rin ang rules ng gym — may mga booking na naghihintay ng approval.",
  "Not at this gym": "Wala nito sa gym na ’to",
  "Back to the app": "Bumalik sa app",
  "Nothing of yours was deleted — if they turn it back on, it is all still here.": "Walang nabura sa’yo — kapag in-on ulit nila, nandito pa rin lahat.",
  "Welcome, Coach": "Welcome, Coach",
  "A few things to set up": "Ilang bagay na ise-set up",
  "A few things to set up at": "Ilang bagay na ise-set up sa",
  "Your photo and a few words": "Photo mo at ilang salita",
  "Edit my profile": "I-edit ang profile ko",
  "Members choose a coach by face and by what you do. Add a photo, your specialty and a short bio.": "Pumipili ang members ng coach base sa mukha at sa ginagawa mo. Maglagay ng photo, specialty mo at maikling bio.",
  "Your weekly hours": "Oras mo kada linggo",
  "See my hours": "Tingnan ang oras ko",
  "Set my hours": "I-set ang oras ko",
  "Members can book you in these hours. Change them any time.": "Pwede kang i-book ng members sa mga oras na ’to. Palitan anumang oras.",
  "Set the hours you coach each week — members book 1-on-1s only inside them.": "I-set ang oras mo kada linggo — dito lang pwedeng mag-book ng 1-on-1 ang members.",
  "How 1-on-1s reach you": "Paano dumarating sa’yo ang 1-on-1",
  "Open your schedule": "Buksan ang schedule mo",
  "Check in when you arrive": "Mag-check in pagdating mo",
  "Your gym checks coaches in too. On your hub, tap the violet QR button in the bar at the bottom and hold your code up at the desk or the kiosk.": "Pinapa-check in din ng gym mo ang mga coach. Sa hub mo, i-tap ang QR button sa ibaba at ipakita ang code mo sa desk o sa kiosk.",
  "Everyone you train": "Lahat ng tine-train mo",
  "Your hub is like a chat app: Personal training lists everyone you train, and each member on a package has a photo on the rail — their chat, classwork and progress in one place.": "Parang chat app ang hub mo: nasa Personal training lahat ng tine-train mo, at bawat member na naka-package ay may photo sa rail — chat, classwork at progress nila, nasa iisang lugar.",
  "I’m set — take me to my hub": "Okay na ako — dalhin mo ako sa hub ko",
  "Members book your open hours and it is confirmed straight away — you see it on your Schedule.": "Nagbo-book ang members sa bakanteng oras mo at confirmed agad — makikita mo sa Schedule mo.",
  "A member asks for a time and you accept or decline it on Today or your Schedule. You decide your own sessions.": "Humihingi ng oras ang member at ikaw ang tatanggap o tatanggi sa Today o Schedule mo. Ikaw ang bahala sa sessions mo.",
  "A member asks for a time and the front desk confirms it. You see it on your Schedule once it is.": "Humihingi ng oras ang member at ang front desk ang magko-confirm. Makikita mo sa Schedule mo kapag confirmed na.",
  "You accept a member’s request first, then the front desk confirms it.": "Ikaw muna ang tatanggap ng request ng member, tapos ang front desk ang magko-confirm.",
  "Your gym books 1-on-1 sessions at the front desk, not in the app. They still show on your Schedule.": "Sa front desk nagbo-book ng 1-on-1 ang gym mo, hindi sa app. Lumalabas pa rin sila sa Schedule mo.",
  "Your gym": "Gym mo",
  "From Core Fitness": "Galing sa Core Fitness",
  "Ask the assistant": "Magtanong sa assistant",
  "For you": "Para sa’yo",
  "From the gym": "Galing sa gym",
  "The assistant's changes could not be loaded.": "Hindi ma-load ang mga binago ng assistant.",
  "Skip": "Laktawan",
  "Done": "Tapos",
  "Replay": "Ulitin",
  "steps": "hakbang",
  "Tours": "Mga tour",
  "Short tours of each screen, and how to reach your gym": "Maikling tour ng bawat screen, at paano kontakin ang gym mo",
  "Tours of each screen, your gym, terms and privacy": "Tour ng bawat screen, gym mo, terms at privacy",
  "Contact your gym": "Kontakin ang gym mo",
  "Hours, phone and email": "Oras, phone at email",
  "Terms of service": "Terms of service",
  "Refunds, freezes and the rest of the rules": "Refunds, freeze at iba pang rules",
  "Privacy policy": "Privacy policy",
  "How your data is handled": "Paano inaalagaan ang data mo",
  "Your workout for today": "Workout mo ngayon",
  "Tap Start and the app walks you through each set.": "I-tap ang Simulan at gagabayan ka ng app sa bawat set.",
  "What is next": "Ano ang susunod",
  "Your sessions and what the gym has for you today, in order.": "Sessions mo at ang hinanda ng gym para sa’yo ngayon, sunod-sunod.",
  "Your points": "Points mo",
  "Earned for coming in and training. Spend them in Rewards.": "Nakukuha sa pagpunta at pag-train. Gamitin sa Rewards.",
  "Check in here": "Dito mag-check in",
  "Show this code at the desk or the kiosk when you arrive.": "Ipakita ang code na ’to sa desk o sa kiosk pagdating mo.",
  "Your training days, today’s workout with one Start, and your saved workouts.": "Training days mo, workout mo ngayon na isang pindot lang, at mga naka-save mong workout.",
  "The library": "Ang library",
  "Free workouts anyone can do, and programs to follow week by week.": "Libreng workouts na kaya ng kahit sino, at programs na susundan linggo-linggo.",
  "Your coach is one tab away": "Isang tab lang ang coach mo",
  "Coach has your package, your sessions and Book a session.": "Nasa Coach ang package mo, sessions mo at Mag-book ng session.",
  "Its chat, how far through you are, and paying for it.": "Chat nito, gaano ka na kalayo, at ang pagbayad.",
  "Coming and past. Tap one to chat with that coach.": "Paparating at tapos na. I-tap ang isa para maka-chat ang coach na ’yon.",
  "Your level": "Level mo",
  "Earned by training days and steady weeks — what it takes to reach the next one.": "Nakukuha sa training days at tuloy-tuloy na linggo — at ano pa ang kailangan para sa susunod.",
  "Progress, badges, membership": "Progress, badges, membership",
  "Your body and targets, what you have earned, and your plan and payments.": "Katawan at targets mo, mga nakuha mo, at plan at bayad mo.",
  "Requests to decide, your day, and who needs you — start here.": "Mga request na dedesisyunan, ang araw mo, at sino ang nangangailangan sa’yo — dito magsimula.",
  "Personal training": "Personal training",
  "Everyone you train, with their chat.": "Lahat ng tine-train mo, kasama ang chat nila.",
  "Your status, your schedule, your hours, packages and the rest.": "Status mo, schedule, oras, packages at iba pa.",
  "On a package": "Naka-package",
  "Members on a monthly package — each has a place with chat, classwork and progress.": "Members na naka-monthly package — bawat isa may sariling lugar na may chat, classwork at progress.",
  "Single sessions": "Single sessions",
  "Members who book a session now and then. Their chat is here too.": "Members na paminsan-minsang nagbo-book ng session. Nandito rin ang chat nila.",
  "Start coaching someone": "Mag-coach ng bago",
  "Offer a member a package.": "Mag-offer ng package sa isang member.",
  "Schedule": "Schedule",
  "Requests to decide, then each day’s sessions. Cancel one here with a reason.": "Mga request na dedesisyunan, tapos ang sessions bawat araw. Dito mag-cancel, may dahilan.",
  "Your hours": "Oras mo",
  "Set the hours members can book you.": "I-set ang oras na pwede kang i-book ng members.",
};

let current: Lang = 'en';
const listeners = new Set<() => void>();

export function getLanguage(): Lang {
  return current;
}

export function setLanguage(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try { document.documentElement.lang = lang === 'fil' ? 'fil' : 'en'; } catch { /* no DOM */ }
  listeners.forEach((l) => l());
}

/** Translates one English string; unknown strings come back unchanged. */
export function tr(text: string, lang: Lang = current): string {
  return lang === 'fil' ? FIL[text] ?? text : text;
}

/** Date formatting locale to go with the language. */
export function dateLocale(lang: Lang = current): string {
  return lang === 'fil' ? 'fil-PH' : 'en-US';
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useLanguage(): Lang {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

/** `const t = useT(); t('Today')` — re-renders when the language changes. */
export function useT(): (text: string) => string {
  const lang = useLanguage();
  return useCallback((text: string) => tr(text, lang), [lang]);
}

/** Reads the member's choice. Before 0095 the column is missing and English stays. */
export async function loadLanguagePreference(memberId: string): Promise<void> {
  const { data, error } = await supabase.from('member_profiles').select('preferred_language').eq('profile_id', memberId).maybeSingle();
  if (error || !data) return;
  const lang = (data as { preferred_language?: string }).preferred_language;
  setLanguage(lang === 'fil' ? 'fil' : 'en');
}

export async function saveLanguagePreference(memberId: string, lang: Lang): Promise<void> {
  const { data, error } = await supabase.from('member_profiles').update({ preferred_language: lang })
    .eq('profile_id', memberId).select('profile_id');
  if (error) throw error;
  assertWrote(data, 'Your language could not be saved.');
  setLanguage(lang);
}
