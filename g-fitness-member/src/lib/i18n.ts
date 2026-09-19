import { useCallback, useSyncExternalStore } from 'react';
import { supabase } from './supabaseClient';
import { assertWrote } from './api/mutate';

/**
 * English or Filipino for the phone app's main screens (2026-09-19).
 *
 * **Keyed by the English text itself**: `t('Today')` is 'Today' in English and
 * 'Ngayon' in Filipino. A string with no entry falls back to the English, so a
 * screen not yet translated reads in English rather than breaking — the honest
 * failure. Translated so far: the tab bar, the tab headers and rails, the More
 * sheet, the check-in sheet, and Settings' headings. Everything else is English.
 *
 * The choice is `member_profiles.preferred_language` (0095) — a column, not
 * localStorage, so it follows the member to a new phone (CLAUDE.md: per-user
 * state never lives on one device). Held in memory for the session and reset to
 * English in logout(), like every other per-member cache.
 */

export type Lang = 'en' | 'fil';

const FIL: Record<string, string> = {
  // The tab bar and headers
  'Today': 'Ngayon',
  'Train': 'Ensayo',
  'You': 'Ikaw',
  'More': 'Iba pa',
  'Check in': 'Mag-check in',
  'Checked in': 'Naka-check in',
  'Your day': 'Ang araw mo',
  'Classes and 1-on-1': 'Mga klase at 1-on-1',
  'Membership and points': 'Membership at puntos',
  'Good morning': 'Magandang umaga',
  'Good afternoon': 'Magandang hapon',
  'Good evening': 'Magandang gabi',
  'This week': 'Ngayong linggo',
  'Your account': 'Ang account mo',
  // Rails and the More sheet
  'Updates': 'Mga update',
  'Announcements': 'Mga anunsyo',
  'Events and announcements': 'Mga event at anunsyo',
  'Ask the assistant': 'Magtanong sa assistant',
  'Log a reading': 'Magtala ng sukat',
  'My routines': 'Aking mga routine',
  'Progress': 'Progreso',
  'My bookings': 'Aking mga booking',
  'Book a session': 'Mag-book ng session',
  'Training plan': 'Plano sa pag-eensayo',
  'Rebuild my plan': 'Buuin muli ang plano ko',
  'Free workouts': 'Libreng workout',
  'Coaches': 'Mga coach',
  'Challenges': 'Mga hamon',
  'Achievements': 'Mga nakamit',
  'Achievements and level': 'Mga nakamit at level',
  'Goals': 'Mga layunin',
  'Body': 'Katawan',
  'Coach notes': 'Mga tala ng coach',
  'Account': 'Account',
  'Membership': 'Membership',
  'Renew': 'Mag-renew',
  'Payments': 'Mga bayad',
  'Attendance': 'Pagdalo',
  'Spend points': 'Gamitin ang puntos',
  'Profile': 'Profile',
  'Edit profile': 'I-edit ang profile',
  'Settings': 'Mga setting',
  'Change password': 'Palitan ang password',
  'Change email': 'Palitan ang email',
  'Everything': 'Lahat',
  // Check-in sheet
  'Membership expired': 'Nag-expire na ang membership',
  'No active membership': 'Walang aktibong membership',
  'Scanned — you are in': 'Na-scan na — nakapasok ka na',
  'valid to': 'hanggang',
  'read the code out if the camera fails': 'basahin nang malakas ang code kung ayaw gumana ng camera',
  // Settings
  'Alerts, privacy and your account': 'Mga alerto, privacy at ang account mo',
  'Notifications': 'Mga notification',
  'What your trainer sees': 'Nakikita ng trainer mo',
  'Your data': 'Ang data mo',
  'Account & app': 'Account at app',
  'About': 'Tungkol dito',
  'Language': 'Wika',
  'Log out': 'Mag-log out',
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
