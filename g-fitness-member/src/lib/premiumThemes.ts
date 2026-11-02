/**
 * Premium themes (0233, 2026-11-02) — a gym's whole look beyond its two colours:
 * the ground and surfaces, and a two-colour gradient on the main buttons,
 * progress bars and the member card. Bought once with the custom-colours unlock
 * (₱499); the gym's accent pair still colours everything else.
 *
 * Each theme is a set of colour ROLES per mode. Only `dark` exists today; when
 * light mode comes, a theme gains `light` with the same roles and nothing that
 * reads these variables changes. The keys must match `premium_theme_keys()` in
 * SQL. This file is copied byte for byte to g-fitness-admin/src/lib/premiumThemes.ts.
 */
export interface ThemeRoles {
  bg: string; surface: string; raised: string; high: string;
  /** The gradient's two ends, start → end. */
  grad: [string, string];
}
export interface PremiumTheme { key: string; name: string; blurb: string; dark: ThemeRoles; light?: ThemeRoles }

export const PREMIUM_THEMES: PremiumTheme[] = [
  { key: 'midnight_gold', name: 'Midnight Gold', blurb: 'Deep navy, gold', dark: { bg: '#07080F', surface: '#10121D', raised: '#151827', high: '#1D2133', grad: ['#F5C451', '#D98E04'] } },
  { key: 'ocean_steel', name: 'Ocean Steel', blurb: 'Blue steel, sky', dark: { bg: '#061018', surface: '#0D1A24', raised: '#11212E', high: '#182B3A', grad: ['#38BDF8', '#2563EB'] } },
  { key: 'ember', name: 'Ember', blurb: 'Warm char, fire', dark: { bg: '#0F0807', surface: '#1A0F0D', raised: '#221411', high: '#2C1A16', grad: ['#FB923C', '#E11D48'] } },
  { key: 'forest', name: 'Forest', blurb: 'Pine, mint', dark: { bg: '#060D0A', surface: '#0D1813', raised: '#12201A', high: '#182A22', grad: ['#34D399', '#059669'] } },
  { key: 'royal', name: 'Royal', blurb: 'Plum, lavender', dark: { bg: '#0B0716', surface: '#140E24', raised: '#1A132F', high: '#22193D', grad: ['#A78BFA', '#6D28D9'] } },
  { key: 'mono', name: 'Mono', blurb: 'Pure greys', dark: { bg: '#0A0A0A', surface: '#141414', raised: '#1A1A1A', high: '#232323', grad: ['#E5E5E5', '#8A8A8A'] } },
  { key: 'oled', name: 'True Black', blurb: 'OLED black, electric', dark: { bg: '#000000', surface: '#0B0B0D', raised: '#111114', high: '#18181C', grad: ['#22D3EE', '#6366F1'] } },
  { key: 'sakura', name: 'Sakura', blurb: 'Night plum, blossom', dark: { bg: '#100A0E', surface: '#1B1118', raised: '#23161F', high: '#2D1D28', grad: ['#F9A8D4', '#DB2777'] } },
  { key: 'volt', name: 'Volt', blurb: 'Olive night, lime', dark: { bg: '#080B05', surface: '#11160C', raised: '#172011', high: '#1E2A17', grad: ['#D9F99D', '#65A30D'] } },
  { key: 'arctic', name: 'Arctic', blurb: 'Ice blue', dark: { bg: '#070C12', surface: '#0F1720', raised: '#141F2B', high: '#1B2836', grad: ['#E0F2FE', '#38BDF8'] } },
  { key: 'sunset', name: 'Sunset', blurb: 'Dusk, peach to magenta', dark: { bg: '#110A10', surface: '#1C1119', raised: '#251722', high: '#301E2C', grad: ['#FDBA74', '#C026D3'] } },
  { key: 'teal_graphite', name: 'Teal Graphite', blurb: 'Graphite, teal', dark: { bg: '#0A0D0E', surface: '#121719', raised: '#172022', high: '#1E292C', grad: ['#5EEAD4', '#0D9488'] } },
];

const VARS = ['--color-bg', '--color-surface', '--color-surface-raised', '--color-surface-high', '--grad-primary', '--grad-action'] as const;

/**
 * Put a premium theme on the page (or take it off with null). `mode` is for
 * light mode later: a theme without that mode falls back to no theme.
 */
export function applyPremiumTheme(key: string | null | undefined, mode: 'dark' | 'light' = 'dark'): void {
  const root = document.documentElement;
  const t = PREMIUM_THEMES.find((x) => x.key === key);
  const roles = t ? t[mode] : undefined;
  if (!roles) {
    VARS.forEach((v) => root.style.removeProperty(v));
    delete root.dataset.premiumTheme;
    return;
  }
  root.style.setProperty('--color-bg', roles.bg);
  root.style.setProperty('--color-surface', roles.surface);
  root.style.setProperty('--color-surface-raised', roles.raised);
  root.style.setProperty('--color-surface-high', roles.high);
  root.style.setProperty('--grad-primary', `linear-gradient(90deg, ${roles.grad[0]}, ${roles.grad[1]})`);
  root.style.setProperty('--grad-action', `linear-gradient(135deg, ${roles.grad[0]}, ${roles.grad[1]})`);
  root.dataset.premiumTheme = t!.key;
}
