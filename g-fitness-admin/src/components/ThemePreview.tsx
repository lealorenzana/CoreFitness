import { rampFor } from '../lib/gymTheme';

/**
 * The two colour roles as one package: ready-made pairs that go together, and
 * a preview of what the members' app draws with them — the gradient ring, a
 * progress bar, a selected tab and a button.
 *
 * The member app builds every gradient from these two colours (its glows, the
 * assistant's ring, progress fills), so what is drawn here is what members get.
 * Nothing here is stored: a pair just fills both pickers above, and Save saves.
 */
/**
 * Ready-made pairs, grouped. A pair can name a preset or carry an exact colour
 * code; `rampFor()` keeps either readable (its text shade is lifted to 4.5:1,
 * proven over 2,160 codes by scripts/accent-contrast.mjs).
 */
const PAIRS: { name: string; accent: string; action: string; group: string }[] = [
  { group: 'Classic', name: 'Core Fitness', accent: 'violet', action: 'amber' },
  { group: 'Classic', name: 'Forest', accent: 'emerald', action: 'lime' },
  { group: 'Classic', name: 'Ocean', accent: 'blue', action: 'sky' },
  { group: 'Classic', name: 'Lagoon', accent: 'teal', action: 'cyan' },
  { group: 'Classic', name: 'Sunset', accent: 'rose', action: 'orange' },
  { group: 'Classic', name: 'Ember', accent: 'red', action: 'amber' },
  { group: 'Classic', name: 'Neon', accent: 'indigo', action: 'fuchsia' },
  { group: 'Classic', name: 'Steel', accent: 'slate', action: 'lime' },
  { group: 'Bold', name: 'Royal', accent: '#4338CA', action: '#EAB308' },
  { group: 'Bold', name: 'Lava', accent: '#B91C1C', action: '#F97316' },
  { group: 'Bold', name: 'Berry', accent: 'fuchsia', action: 'rose' },
  { group: 'Bold', name: 'Electric', accent: '#2563EB', action: '#22D3EE' },
  { group: 'Bold', name: 'Volt', accent: '#7C3AED', action: '#A3E635' },
  { group: 'Bold', name: 'Inferno', accent: '#DC2626', action: '#FACC15' },
  { group: 'Bold', name: 'Grape', accent: '#7E22CE', action: '#F472B6' },
  { group: 'Bold', name: 'Citrus', accent: 'orange', action: 'lime' },
  { group: 'Calm', name: 'Matcha', accent: '#4D7C0F', action: '#84CC16' },
  { group: 'Calm', name: 'Mint', accent: '#0F766E', action: '#34D399' },
  { group: 'Calm', name: 'Midnight', accent: '#1E3A8A', action: '#38BDF8' },
  { group: 'Calm', name: 'Coffee', accent: '#8B5E3C', action: '#D4A373' },
  { group: 'Calm', name: 'Sand', accent: '#A16207', action: '#FBBF24' },
  { group: 'Calm', name: 'Stone', accent: 'slate', action: 'sky' },
  { group: 'Pinoy', name: 'Bandila', accent: '#0038A8', action: '#FCD116' },
  { group: 'Pinoy', name: 'Mayon', accent: '#CE1126', action: '#FCD116' },
  { group: 'Pinoy', name: 'Palawan', accent: '#0E7490', action: '#2DD4BF' },
  { group: 'Pinoy', name: 'Mangga', accent: '#C2410C', action: '#FDE047' },
];
const GROUPS = ['Classic', 'Bold', 'Calm', 'Pinoy'];

function gradientOf(accent: string, action: string | null): string {
  const a = rampFor(accent, 'violet');
  const b = rampFor(action || null, 'amber');
  return `linear-gradient(90deg, ${a.base}, ${a.c300} 55%, ${b.base})`;
}

export default function ThemePreview({ accent, action, onPick }: {
  accent: string;
  action: string;
  onPick: (accent: string, action: string) => void;
}) {
  const a = rampFor(accent, 'violet');
  const b = rampFor(action || null, 'amber');
  const same = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();
  const current = PAIRS.find((p) => same(p.accent, accent) && same(p.action, action || 'amber'));

  return (
    <div className="mt-5">
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        Pairs that go together — one tap sets both
      </p>
      {GROUPS.map((g) => (
      <div key={g} className="mb-3">
      <p className="text-[11px] font-semibold uppercase mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{g}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2">
        {PAIRS.filter((p) => p.group === g).map((p) => {
          const on = current?.name === p.name;
          return (
            <button key={p.name} type="button" onClick={() => onPick(p.accent, p.action)}
              className="rounded-lg border p-2 text-left transition-colors"
              style={{
                borderColor: on ? 'var(--color-primary)' : 'var(--color-border)',
                background: on ? 'var(--color-primary-light, transparent)' : 'transparent',
              }}
              aria-pressed={on}>
              <span className="block h-6 rounded-md" style={{ background: gradientOf(p.accent, p.action) }} />
              <span className="mt-1.5 block text-xs" style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
            </button>
          );
        })}
      </div>
      </div>
      ))}

      <p className="text-xs font-medium mt-4 mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        How your members' app will look
      </p>
      <div className="rounded-xl p-4" style={{ background: '#0B0B12', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <span className="grid place-items-center rounded-full shrink-0"
            style={{ width: 44, height: 44, padding: 2, background: `conic-gradient(${a.base}, ${a.c300}, ${b.base}, ${a.base})` }}>
            <span className="block rounded-full" style={{ width: 40, height: 40, background: `radial-gradient(120% 120% at 30% 20%, ${a.c400}, ${a.c700} 55%, ${a.c900})` }} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold" style={{ color: '#e9e9ed' }}>Today</span>
            <span className="block text-xs" style={{ color: a.c300 }}>3 of 4 workouts this week</span>
          </span>
          <span className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: b.base, color: '#0B0B12' }}>Book</span>
        </div>
        <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: '#1E1D2B' }}>
          <div className="h-full rounded-full" style={{ width: '72%', background: `linear-gradient(90deg, ${a.base}, ${a.c300} 60%, ${b.base})` }} />
        </div>
        <div className="mt-3 flex gap-4 text-xs">
          <span style={{ color: a.c300, borderBottom: `2px solid ${a.base}`, paddingBottom: 2 }}>Today</span>
          <span style={{ color: '#9397ab' }}>Train</span>
          <span style={{ color: '#9397ab' }}>You</span>
        </div>
      </div>
    </div>
  );
}
