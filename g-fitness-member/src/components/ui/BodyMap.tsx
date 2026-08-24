import { useMemo, useState } from 'react';
import {
  ART_WIDTH, ART_HEIGHT, BODY_ART, SHARED_REGIONS, TORSO_REGIONS,
} from './bodyRegions';

/**
 * An anatomy chart, tinted from the member's own tape-measure readings.
 *
 * ## Three versions to get here
 *
 * The first drew a dozen detached `<rect rx>` pills — symmetric to a tenth of a
 * pixel and reading as nothing, because disconnected capsules never merge into a
 * figure. The second joined them into a silhouette with four blobs on it, which
 * was still a grey clip-art person. The third hand-drew nine muscle groups in
 * SVG; better, but a hand-drawn body is only ever as good as the hand.
 *
 * This one uses **rendered anatomical artwork** as the base and overlays the
 * interactive regions on top. The muscle definition, the shading and the
 * proportions come from the illustration; this component supplies the data.
 *
 * ## Why the tint is an overlay rather than the fill
 *
 * The art is raster, so there is no "the biceps path" to recolour. Each region
 * is instead a transparent shape sitting over the artwork, painted with
 * `mix-blend-mode: screen` — which *adds* light rather than covering. The
 * muscle's own shading stays visible through the colour, so a tinted biceps
 * still looks like a biceps rather than a flat coloured patch. A plain alpha
 * fill over this dark art turns amber into mud.
 *
 * ## Why not 3D
 *
 * A rigged model with individually selectable muscles is a 3–15 MB `.glb`
 * against a ~1 MB bundle, and workbox hard-fails on any precache entry over
 * 2 MB. The two WebP illustrations together are **76 KB**. The front/back toggle
 * gives the part of 3D that actually helps — seeing the other side — and a flat
 * chart is more legible at 375px than a rotatable body.
 *
 * ## Front and back are lit by the same readings, on purpose
 *
 * **A tape measure produces a circumference, and a circumference goes all the
 * way around.** One reading around the upper arm covers biceps *and* triceps;
 * one around the torso covers pectorals *and* lats. So both views share a
 * measurement, the label changes with the view, and the detail panel names the
 * site. Storing a separate "triceps" number would invent a measurement nobody
 * can take.
 *
 * ## Colour encodes magnitude, never approval
 *
 * The ramp runs violet → amber by **how far a measurement moved**, not which
 * way. Whether +2 cm on the arms is progress depends on what the member trains
 * for, and this component cannot know — the same member may be cutting their
 * waist while building their chest. Colouring "up" green and "down" red would
 * tell half of them their hard-won result is a failure.
 *
 * ## Never measured is not zero
 *
 * A group with no reading gets a faint dashed outline and says "Not measured".
 * It never falls back to 0 cm, which would render as a real and alarming shrink.
 */

export type BodyRegionKey =
  | 'neck' | 'shoulders' | 'chest' | 'arms' | 'forearms'
  | 'core' | 'hips' | 'thighs' | 'calves';

export type BodyView = 'front' | 'back';

export interface BodyRegionInput {
  /** Most recent reading in cm, or null when this was never measured. */
  latest: number | null;
  /** The reading before it, or null when there is only one. */
  previous: number | null;
}

export type BodyMapData = Record<BodyRegionKey, BodyRegionInput>;

/** What the tape actually went around — shown in the detail panel. */
const SITE_NOTE: Record<BodyRegionKey, string> = {
  neck: 'Measured around the neck.',
  shoulders: 'Measured around the widest point of the shoulders.',
  chest: 'One reading around your torso — it covers your chest and your back.',
  arms: 'One reading around your upper arm — it covers biceps and triceps.',
  forearms: 'Measured at the widest point of the forearm.',
  core: 'One reading around your waist — it covers your abs and your lower back.',
  hips: 'Measured around the widest point of the hips.',
  thighs: 'One reading around your thigh — it covers quads and hamstrings.',
  calves: 'Measured at the widest point of the calf.',
};

/** The label changes with the view; the measurement behind it does not. */
const LABEL: Record<BodyView, Record<BodyRegionKey, string>> = {
  front: {
    neck: 'Neck', shoulders: 'Shoulders', chest: 'Chest', arms: 'Biceps',
    forearms: 'Forearms', core: 'Abs & obliques', hips: 'Hips',
    thighs: 'Quads', calves: 'Calves',
  },
  back: {
    neck: 'Traps', shoulders: 'Rear delts', chest: 'Back & lats', arms: 'Triceps',
    forearms: 'Forearms', core: 'Lower back', hips: 'Glutes',
    thighs: 'Hamstrings', calves: 'Calves',
  },
};

/** Draw order, so a smaller region is never buried under a larger neighbour. */
const ORDER: BodyRegionKey[] = [
  'chest', 'core', 'hips', 'thighs', 'calves', 'shoulders', 'arms', 'forearms', 'neck',
];

function pathsFor(view: BodyView, key: BodyRegionKey): readonly string[] {
  if (key === 'chest' || key === 'core') return TORSO_REGIONS[view][key];
  return SHARED_REGIONS[key];
}

/* ── Colour ────────────────────────────────────────────────────────────────
   Mixed in JS rather than with CSS `color-mix()`: the value goes into an SVG
   `fill` attribute and is also read back for the summary swatches. Both tokens
   are duplicated as literals because `getComputedStyle` is not available while
   building an attribute string. They match --color-primary / --color-secondary. */
const VIOLET = [124, 58, 237] as const;
const AMBER = [245, 158, 11] as const;

function mix(t: number): string {
  const c = VIOLET.map((v, i) => Math.round(v + (AMBER[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

interface RegionState {
  key: BodyRegionKey;
  latest: number | null;
  delta: number | null;
  fill: string;
  opacity: number;
  empty: boolean;
}

function buildStates(data: BodyMapData): Record<BodyRegionKey, RegionState> {
  const keys = Object.keys(SITE_NOTE) as BodyRegionKey[];

  const deltas = keys.map((k) => {
    const { latest, previous } = data[k];
    return latest != null && previous != null ? Number((latest - previous).toFixed(1)) : null;
  });

  // Scaled against this member's own largest movement, not a fixed centimetre
  // range. Someone whose readings all moved under a centimetre should still see
  // which moved most; a fixed scale would render them identical.
  const max = Math.max(0, ...deltas.map((d) => (d == null ? 0 : Math.abs(d))));

  const out = {} as Record<BodyRegionKey, RegionState>;
  keys.forEach((key, i) => {
    const delta = deltas[i];
    const latest = data[key].latest;

    if (latest == null) {
      out[key] = { key, latest: null, delta: null, fill: 'transparent', opacity: 0, empty: true };
      return;
    }
    if (delta == null || max === 0) {
      out[key] = { key, latest, delta, fill: mix(0), opacity: 0.3, empty: false };
      return;
    }
    const intensity = Math.abs(delta) / max;
    out[key] = {
      key, latest, delta,
      fill: mix(intensity),
      // Floor of 0.3 so the least-changed group still reads as lit —
      // "barely moved" must not look like "not measured".
      opacity: 0.3 + intensity * 0.45,
      empty: false,
    };
  });
  return out;
}

interface BodyMapProps {
  data: BodyMapData;
  /** Rendered under the figure. Omit to show only the diagram. */
  showLegend?: boolean;
  /**
   * Opens the logging flow for one group. Omit and the map stays read-only.
   *
   * Without this the map was a readout that only *looked* interactive: tapping
   * highlighted a region, and on a member with nothing logged the highlight
   * revealed "Not measured" and there was nowhere to go.
   */
  onLogRegion?: (key: BodyRegionKey) => void;
}

export default function BodyMap({ data, showLegend = true, onLogRegion }: BodyMapProps) {
  const states = useMemo(() => buildStates(data), [data]);
  const [view, setView] = useState<BodyView>('front');
  const [selected, setSelected] = useState<BodyRegionKey | null>(null);

  const active = selected ? states[selected] : null;
  const measured = (Object.keys(states) as BodyRegionKey[]).filter((k) => !states[k].empty);

  return (
    <div>
      {/* Front / back — the part of "3D" that actually helps, since half the
          muscle groups are on the back. */}
      <div className="flex items-center justify-center gap-1 p-1 rounded-full mx-auto mb-2"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', width: 'fit-content' }}
        role="tablist" aria-label="Body view">
        {(['front', 'back'] as BodyView[]).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className="px-5 h-8 rounded-full text-xs font-bold capitalize"
            style={{
              background: view === v ? 'var(--color-primary)' : 'transparent',
              color: view === v ? '#FFFFFF' : 'var(--color-text-muted)',
            }}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <svg
          viewBox={`0 0 ${ART_WIDTH} ${ART_HEIGHT}`}
          className="w-full"
          // `isolation: isolate` is load-bearing, not tidiness. The region tints
          // use `mix-blend-mode: screen`, and without an isolated stacking
          // context they blend against whatever sits behind the SVG — the panel,
          // and on some stacking arrangements the page itself. Isolating keeps
          // the blend between the tint and the artwork, which is the only pair
          // it is supposed to involve.
          style={{ maxWidth: 250, isolation: 'isolate' }}
          role="img"
          aria-label={`Body measurement map, ${view} view`}
        >
          {/* Both views are rendered and toggled by opacity rather than swapping
              one `href`, so switching does not wait on a network round trip the
              first time. 76 KB for the pair makes that affordable.

              `opacity` is set as an attribute, never transitioned: on a page
              that is not compositing a CSS transition never advances past its
              start value, which would leave both figures stacked at once. */}
          {(['front', 'back'] as BodyView[]).map((v) => (
            <image
              key={v}
              href={BODY_ART[v]}
              x="0" y="0" width={ART_WIDTH} height={ART_HEIGHT}
              opacity={view === v ? 1 : 0}
              style={{ pointerEvents: 'none' }}
            />
          ))}

          {ORDER.map((key) => {
            const s = states[key];
            const isSel = selected === key;
            const dimmed = selected !== null && !isSel;
            return (
              <g
                key={key}
                onClick={() => setSelected(isSel ? null : key)}
                style={{ cursor: 'pointer' }}
                role="button"
                aria-label={LABEL[view][key]}
              >
                {pathsFor(view, key).map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    // `screen` adds light instead of covering, so the muscle's
                    // own shading survives the tint. A flat alpha fill over art
                    // this dark turns amber into mud.
                    style={{ mixBlendMode: s.empty ? 'normal' : 'screen' }}
                    fill={s.empty ? (isSel ? '#FFFFFF' : 'transparent') : s.fill}
                    fillOpacity={s.empty ? (isSel ? 0.14 : 0) : s.opacity * (dimmed ? 0.25 : 1)}
                    stroke={isSel ? '#FFFFFF' : s.empty ? 'rgba(255,255,255,0.20)' : 'none'}
                    strokeWidth={isSel ? 3 : 1.5}
                    strokeOpacity={dimmed ? 0.3 : 1}
                    strokeDasharray={s.empty && !isSel ? '5 7' : undefined}
                    strokeLinejoin="round"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {showLegend && (
        <>
          {!active && (
            <p className="text-xs mt-1 px-1 leading-relaxed text-center"
              style={{ color: 'var(--color-text-muted)' }}>
              {measured.length === 0
                ? onLogRegion
                  ? 'Tap a muscle to log it.'
                  : 'Log a measurement to light up the map.'
                : 'Brighter means that measurement moved more than your others — not that it moved the right way.'}
            </p>
          )}

          {active && (
            <div className="mt-2 p-3 rounded-xl"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-white">{LABEL[view][active.key]}</p>
                {active.latest != null && (
                  <p className="text-sm font-bold" style={{ color: 'var(--color-secondary)' }}>
                    {active.latest} cm
                  </p>
                )}
              </div>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                {active.latest == null
                  ? 'Not measured yet.'
                  : active.delta == null
                    ? 'Your first reading, so there is nothing to compare it to yet.'
                    : active.delta === 0
                      ? 'Unchanged since your last reading.'
                      : `${active.delta > 0 ? 'Up' : 'Down'} ${Math.abs(active.delta)} cm since your last reading.`}
              </p>
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {SITE_NOTE[active.key]}
              </p>
              {onLogRegion && (
                <button
                  onClick={() => onLogRegion(active.key)}
                  className="mt-2.5 w-full h-9 rounded-full text-xs font-bold text-black"
                  style={{ background: 'var(--color-secondary)' }}
                >
                  {active.latest == null
                    ? `Log ${LABEL[view][active.key].toLowerCase()}`
                    : `Update ${LABEL[view][active.key].toLowerCase()}`}
                </button>
              )}
            </div>
          )}

          {/* Only measured groups are listed. The unmeasured ones already show
              on the figure as dashed outlines, and listing all nine twice is how
              an earlier version ended up needing a paragraph to explain itself. */}
          {measured.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 mt-2.5">
              {measured.map((key) => {
                const s = states[key];
                const on = selected === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(on ? null : key)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-left"
                    style={{
                      background: on ? 'var(--color-surface-high)' : 'var(--color-bg)',
                      border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: s.fill }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-white truncate">
                        {LABEL[view][key]}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {s.latest} cm{s.delta != null && s.delta !== 0
                          ? ` · ${s.delta > 0 ? '+' : ''}${s.delta}`
                          : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
