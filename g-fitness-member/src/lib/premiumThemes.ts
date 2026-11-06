/**
 * Premium themes (0233, 2026-11-02) — a gym's whole look beyond its two colours:
 * the ground and surfaces, and a two-colour gradient on the main buttons,
 * progress bars and the member card. Bought once with the custom-colours unlock
 * (₱499); the gym's accent pair still colours everything else.
 *
 * Each theme is a set of colour ROLES per mode — `dark` and `light` (0234) — so
 * the light/dark switch changes the values and nothing that reads them. The keys must match `premium_theme_keys()` in
 * SQL. This file is copied byte for byte to g-fitness-admin/src/lib/premiumThemes.ts.
 */
export interface ThemeRoles {
  bg: string; surface: string; raised: string; high: string;
  /** The gradient's two ends, start → end. */
  grad: [string, string];
}
export interface PremiumTheme { key: string; name: string; blurb: string; dark: ThemeRoles; light?: ThemeRoles }

export const PREMIUM_THEMES: PremiumTheme[] = [
  { key: 'midnight_gold', name: 'Midnight Gold', blurb: 'Deep navy, gold', dark: { bg: '#07080F', surface: '#10121D', raised: '#151827', high: '#1D2133', grad: ['#F5C451', '#D98E04'] } , light: { bg: '#F8F6EF', surface: '#FFFFFF', raised: '#F3EFE2', high: '#E9E3CF', grad: ['#E0A800', '#B45309'] } },
  { key: 'ocean_steel', name: 'Ocean Steel', blurb: 'Blue steel, sky', dark: { bg: '#061018', surface: '#0D1A24', raised: '#11212E', high: '#182B3A', grad: ['#38BDF8', '#2563EB'] } , light: { bg: '#F2F6FA', surface: '#FFFFFF', raised: '#E8EFF6', high: '#DAE5F0', grad: ['#0EA5E9', '#1D4ED8'] } },
  { key: 'ember', name: 'Ember', blurb: 'Warm char, fire', dark: { bg: '#0F0807', surface: '#1A0F0D', raised: '#221411', high: '#2C1A16', grad: ['#FB923C', '#E11D48'] } , light: { bg: '#FAF4F2', surface: '#FFFFFF', raised: '#F5E9E5', high: '#EDDAD3', grad: ['#F97316', '#BE123C'] } },
  { key: 'forest', name: 'Forest', blurb: 'Pine, mint', dark: { bg: '#060D0A', surface: '#0D1813', raised: '#12201A', high: '#182A22', grad: ['#34D399', '#059669'] } , light: { bg: '#F1F7F3', surface: '#FFFFFF', raised: '#E5F0E9', high: '#D5E7DB', grad: ['#10B981', '#047857'] } },
  { key: 'royal', name: 'Royal', blurb: 'Plum, lavender', dark: { bg: '#0B0716', surface: '#140E24', raised: '#1A132F', high: '#22193D', grad: ['#A78BFA', '#6D28D9'] } , light: { bg: '#F5F2FB', surface: '#FFFFFF', raised: '#EDE7F8', high: '#E0D7F2', grad: ['#8B5CF6', '#5B21B6'] } },
  { key: 'mono', name: 'Mono', blurb: 'Pure greys', dark: { bg: '#0A0A0A', surface: '#141414', raised: '#1A1A1A', high: '#232323', grad: ['#E5E5E5', '#8A8A8A'] } , light: { bg: '#F5F5F5', surface: '#FFFFFF', raised: '#EDEDED', high: '#E0E0E0', grad: ['#525252', '#171717'] } },
  { key: 'oled', name: 'True Black', blurb: 'OLED black, electric', dark: { bg: '#000000', surface: '#0B0B0D', raised: '#111114', high: '#18181C', grad: ['#22D3EE', '#6366F1'] } , light: { bg: '#FAFAFA', surface: '#FFFFFF', raised: '#F0F0F2', high: '#E4E4E8', grad: ['#06B6D4', '#4F46E5'] } },
  { key: 'sakura', name: 'Sakura', blurb: 'Night plum, blossom', dark: { bg: '#100A0E', surface: '#1B1118', raised: '#23161F', high: '#2D1D28', grad: ['#F9A8D4', '#DB2777'] } , light: { bg: '#FBF3F7', surface: '#FFFFFF', raised: '#F6E7EF', high: '#EED7E3', grad: ['#EC4899', '#9D174D'] } },
  { key: 'volt', name: 'Volt', blurb: 'Olive night, lime', dark: { bg: '#080B05', surface: '#11160C', raised: '#172011', high: '#1E2A17', grad: ['#D9F99D', '#65A30D'] } , light: { bg: '#F5F8EF', surface: '#FFFFFF', raised: '#ECF2E0', high: '#DFE9CC', grad: ['#84CC16', '#3F6212'] } },
  { key: 'arctic', name: 'Arctic', blurb: 'Ice blue', dark: { bg: '#070C12', surface: '#0F1720', raised: '#141F2B', high: '#1B2836', grad: ['#E0F2FE', '#38BDF8'] } , light: { bg: '#F1F7FB', surface: '#FFFFFF', raised: '#E6F1F8', high: '#D6E8F3', grad: ['#38BDF8', '#0369A1'] } },
  { key: 'sunset', name: 'Sunset', blurb: 'Dusk, peach to magenta', dark: { bg: '#110A10', surface: '#1C1119', raised: '#251722', high: '#301E2C', grad: ['#FDBA74', '#C026D3'] } , light: { bg: '#FBF3F2', surface: '#FFFFFF', raised: '#F6E6E9', high: '#EED6DE', grad: ['#F97316', '#A21CAF'] } },
  { key: 'teal_graphite', name: 'Teal Graphite', blurb: 'Graphite, teal', dark: { bg: '#0A0D0E', surface: '#121719', raised: '#172022', high: '#1E292C', grad: ['#5EEAD4', '#0D9488'] } , light: { bg: '#F1F6F6', surface: '#FFFFFF', raised: '#E5EEEE', high: '#D5E4E4', grad: ['#14B8A6', '#0F766E'] } },
];

const VARS = ['--color-bg', '--color-surface', '--color-surface-raised', '--color-surface-high', '--grad-primary', '--grad-action'] as const;

/**
 * Put a premium theme on the page (or take it off with null). `mode` is for
 * light mode later: a theme without that mode falls back to no theme.
 */
let lastKey: string | null | undefined = null;

/** Put the last theme back in the current mode — after light/dark changes (lib/colorMode.ts). */
export function reapplyPremiumTheme(): void {
  applyPremiumTheme(lastKey);
}

export function applyPremiumTheme(key: string | null | undefined, mode?: 'dark' | 'light'): void {
  lastKey = key;
  const root = document.documentElement;
  mode = mode ?? (root.dataset.mode === 'light' ? 'light' : 'dark');
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
  // Light mode is solid fills only (the owner, 2026-11-03): no gradient — buttons and bars fall back
  // to the theme's own solid colours. Dark keeps the theme's two-colour gradient.
  if (mode === 'light') {
    root.style.removeProperty('--grad-primary');
    root.style.removeProperty('--grad-action');
  } else {
    root.style.setProperty('--grad-primary', `linear-gradient(90deg, ${roles.grad[0]}, ${roles.grad[1]})`);
    root.style.setProperty('--grad-action', `linear-gradient(135deg, ${roles.grad[0]}, ${roles.grad[1]})`);
  }
  root.dataset.premiumTheme = t!.key;
}
