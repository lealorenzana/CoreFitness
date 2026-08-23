import { useId, useMemo, useState } from 'react';

/**
 * An anatomy chart, coloured from the member's own tape-measure readings.
 *
 * ## What this replaced, and why
 *
 * The first version drew a dozen detached `<rect rx>` pills. The second merged
 * them into one continuous silhouette with four big blobs on top — chest, arms,
 * waist, legs. It was symmetric and it still read as a clip-art person: a flat
 * grey figure with no anatomy in it, and on a member who had logged nothing,
 * four grey areas over a grey body.
 *
 * This version draws **fifteen muscle groups across a front and a back view**.
 * The figure is built to eight head-heights with a real V-taper, the muscle
 * bellies are tapered rather than rounded rectangles, and every group is
 * separated by a hairline in the panel colour so it reads as a chart rather
 * than a shape.
 *
 * ## Why this is not 3D
 *
 * A rigged model with individually selectable muscles is a 3–15 MB `.glb`
 * against a ~1 MB bundle, and `vite-plugin-pwa` hard-fails the build on any
 * precache entry over 2 MB — the same limit that already excludes the gym
 * photos. It would be a runtime download on a Philippine mobile connection, on
 * mid-range Android, inside a TWA, to render nine circumference numbers that a
 * flat chart shows more legibly on a 375px screen. The front/back toggle gives
 * the part of "3D" that actually helps — seeing the other side — for nothing.
 *
 * ## Front and back are lit by the same readings, on purpose
 *
 * **A tape measure produces a circumference, and a circumference goes all the
 * way around.** One reading around the upper arm covers the biceps *and* the
 * triceps; one around the torso covers the pectorals *and* the lats. So the
 * front and back muscles share a measurement, the label changes with the view,
 * and the detail panel says which reading is behind it. Storing a separate
 * "triceps" number would be inventing a measurement nobody can take.
 *
 * ## Colour encodes magnitude, never approval
 *
 * The ramp runs violet → amber by **how far a measurement moved**, not which
 * way. Whether +2 cm on the arms is progress depends on what the member is
 * training for, and this component cannot know — the same member may be cutting
 * their waist while building their chest. Colouring "up" green and "down" red
 * would tell half of them their hard-won result is a failure. The signed number
 * is printed instead and the member reads their own meaning into it.
 *
 * ## Never measured is not zero
 *
 * A group with no reading draws as a faint dashed outline and says "Not
 * measured". It never falls back to 0 cm, which would render as a real and
 * alarming shrink.
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

/**
 * The label changes with the view; the measurement does not.
 *
 * Naming the muscle you are looking at is what makes this a chart rather than a
 * diagram of four boxes — and it is honest, because the back of your arm really
 * is your triceps even though the number came from one tape reading.
 */
const LABEL: Record<BodyView, Record<BodyRegionKey, string>> = {
  front: {
    neck: 'Neck', shoulders: 'Shoulders', chest: 'Chest', arms: 'Biceps',
    forearms: 'Forearms', core: 'Abs & obliques', hips: 'Hips',
    thighs: 'Quads', calves: 'Shins',
  },
  back: {
    neck: 'Traps', shoulders: 'Rear delts', chest: 'Back & lats', arms: 'Triceps',
    forearms: 'Forearms', core: 'Lower back', hips: 'Glutes',
    thighs: 'Hamstrings', calves: 'Calves',
  },
};

/* ── Colour ────────────────────────────────────────────────────────────────
   Mixed in JS rather than with CSS `color-mix()`: this value is written to an
   SVG `fill` attribute and also read back for the summary swatches. The two
   tokens are duplicated here as literals because `getComputedStyle` is not
   available while building an attribute string. They match --color-primary and
   --color-secondary in index.css. */
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
      out[key] = { key, latest: null, delta: null, fill: 'transparent', opacity: 1, empty: true };
      return;
    }
    if (delta == null || max === 0) {
      // Measured, but nothing to compare it against yet.
      out[key] = { key, latest, delta, fill: mix(0), opacity: 0.45, empty: false };
      return;
    }
    const intensity = Math.abs(delta) / max;
    out[key] = {
      key, latest, delta,
      fill: mix(intensity),
      // Floor of 0.5 so the least-changed group is still clearly filled —
      // "barely moved" must not read as "not measured".
      opacity: 0.5 + intensity * 0.5,
      empty: false,
    };
  });
  return out;
}

/* ── Geometry ──────────────────────────────────────────────────────────────
   A figure on a 240 × 500 canvas, centred on x = 120, built to roughly eight
   head-heights with shoulders at 104px across and a waist at 62px — the taper
   is what makes it read as a trained body rather than a gingerbread outline.

   **Every muscle is defined once, for the left side, and drawn twice.** The
   right side is the same path under `translate(240,0) scale(-1,1)`. Symmetry is
   therefore structural rather than hand-matched to the pixel, which is how the
   first version ended up symmetric and still wrong. */

const MIRROR = 'translate(240,0) scale(-1,1)';

/** The base figure: overlapping filled paths sharing one fill and no strokes,
 *  so they merge into a single continuous body instead of reading as pieces. */
const SILHOUETTE = {
  head: { cx: 120, cy: 40, rx: 21, ry: 27 },
  neck: 'M109 58 L131 58 L131 98 L109 98 Z',
  torso:
    'M108 88 C93 90 78 96 68 104 C61 111 59 122 62 136 C66 156 72 174 77 190 ' +
    'C82 203 86 210 88 220 C90 234 86 246 86 258 C87 274 96 286 110 288 L130 288 ' +
    'C144 286 153 274 154 258 C154 246 150 234 152 220 C154 210 158 203 163 190 ' +
    'C168 174 174 156 178 136 C181 122 179 111 172 104 C162 96 147 90 132 88 Z',
  arm:
    'M70 102 C58 108 51 124 49 142 C47 160 46 178 45 196 C44 214 42 236 41 254 ' +
    'C40 268 41 280 44 288 C47 295 58 295 60 288 C62 280 63 268 64 254 ' +
    'C66 236 68 214 70 196 C72 178 76 158 79 140 C81 126 79 112 77 104 Z',
  leg:
    'M84 278 C78 300 76 326 80 350 C84 370 87 390 85 410 C84 430 88 448 94 461 ' +
    'C97 469 108 469 110 461 C112 448 113 430 113 410 C113 390 113 370 113 350 ' +
    'C114 326 116 300 117 278 Z',
};

/** Left-side muscle paths. `mirror: false` would mean a true centre-line shape;
 *  nothing here is one, because the human body does not have any. */
const MUSCLES: Record<BodyView, { key: BodyRegionKey; d: string[] }[]> = {
  front: [
    { key: 'neck', d: ['M110 92 C101 94 89 98 79 104 C85 111 94 116 105 117 L110 115 Z'] },
    { key: 'shoulders', d: ['M78 103 C68 108 60 120 58 134 C57 143 59 150 63 152 C68 149 72 141 74 131 C76 120 78 110 78 103 Z'] },
    { key: 'chest', d: ['M115 116 C104 116 91 120 83 127 C77 134 77 145 82 152 C89 161 102 165 115 163 L117 160 L117 118 Z'] },
    { key: 'arms', d: ['M62 156 C57 163 54 175 53 187 C52 196 54 203 58 205 C63 203 66 195 68 184 C70 173 70 162 69 155 Z'] },
    { key: 'forearms', d: ['M55 210 C50 219 47 233 46 247 C45 257 46 265 49 268 C54 266 57 258 59 247 C61 234 62 220 61 209 Z'] },
    {
      key: 'core',
      d: [
        // Three stacked segments per side — mirrored, that is a six-pack, with
        // the gap down the middle reading as the linea alba.
        'M116 168 C109 168 103 170 100 175 C99 181 100 186 103 189 L116 190 Z',
        'M116 194 C109 194 103 196 100 201 C99 207 100 212 103 215 L116 216 Z',
        'M116 220 C109 220 103 222 100 227 C100 234 102 241 106 244 L116 244 Z',
        // Obliques, flanking.
        'M98 174 C92 178 88 187 87 199 C86 212 88 224 92 233 C96 240 100 243 103 242 C101 230 99 212 98 196 Z',
      ],
    },
    { key: 'hips', d: ['M104 248 C98 252 94 259 93 268 C92 276 96 284 101 287 L116 288 L116 249 Z'] },
    { key: 'thighs', d: ['M97 288 C90 294 86 308 84 326 C83 344 84 364 88 378 C91 388 96 393 100 391 C102 375 104 354 106 334 C108 315 109 300 108 288 Z'] },
    { key: 'calves', d: ['M97 394 C93 404 91 418 91 432 C91 443 93 451 97 455 C100 453 102 444 103 432 C104 416 101 404 99 394 Z'] },
  ],
  back: [
    { key: 'neck', d: ['M112 92 C101 95 87 100 78 107 C85 117 96 124 108 126 L112 124 Z'] },
    { key: 'shoulders', d: ['M78 105 C68 110 60 122 58 136 C57 145 59 152 63 154 C68 151 72 143 74 133 C76 122 78 112 78 105 Z'] },
    { key: 'chest', d: ['M113 130 C101 132 90 138 85 149 C81 161 82 178 88 192 C93 203 102 211 111 213 L114 211 L114 131 Z'] },
    { key: 'arms', d: ['M61 154 C56 161 53 173 52 185 C51 194 53 201 57 203 C62 201 65 193 67 182 C69 171 69 160 68 153 Z'] },
    { key: 'forearms', d: ['M55 210 C50 219 47 233 46 247 C45 257 46 265 49 268 C54 266 57 258 59 247 C61 234 62 220 61 209 Z'] },
    { key: 'core', d: ['M99 196 C94 202 92 212 92 222 C92 232 95 241 100 245 L116 246 L116 198 Z'] },
    { key: 'hips', d: ['M102 250 C96 254 92 262 91 272 C92 281 97 288 104 292 L116 293 L116 251 Z'] },
    { key: 'thighs', d: ['M97 296 C90 302 86 316 84 334 C83 352 84 370 88 382 C91 390 96 394 100 392 C102 377 104 356 106 336 C107 318 108 300 107 296 Z'] },
    { key: 'calves', d: ['M95 390 C90 400 88 414 88 428 C88 440 91 449 96 453 C100 451 102 441 103 428 C104 412 100 400 98 390 Z'] },
  ],
};

/**
 * How a group paints, given whether it is the selected one.
 *
 * The highlight is carried by three things at once, because any one alone is
 * too weak somewhere:
 *
 *  - **A white ring.** Not violet — violet is the low end of the magnitude
 *    ramp, so a violet ring would be invisible on a barely-changed group and
 *    read as a *value* on a bright one. White belongs to no part of the scale,
 *    so it can only mean "this is the one you tapped".
 *  - **A glow**, so the ring survives against a fill of any brightness.
 *  - **Dimming every other group**, which is what actually makes it pop at
 *    arm's length.
 *
 * **Nothing here is transitioned, and that is the point.** `fill` and
 * `fill-opacity` used to ease, back when they only carried the magnitude ramp.
 * Once they also carried *selection* the ease became a correctness bug: on a
 * page that is not compositing a transition never advances past its start
 * value, so tapping one group left every other sitting at full opacity — the
 * ring landed and the dimming silently did not. The moment a property encodes
 * state rather than decoration it must be written, not animated.
 */
function paint(s: RegionState, selected: boolean, anySelected: boolean) {
  const dimmed = anySelected && !selected;
  return {
    fill: s.empty ? (selected ? '#FFFFFF' : 'transparent') : s.fill,
    fillOpacity: s.empty ? (selected ? 0.12 : 0) : s.opacity * (dimmed ? 0.25 : 1),
    // The hairline separating one muscle from the next is what turns a cluster
    // of shapes into a chart. On a filled group it is the panel colour, so the
    // groups look carved apart rather than outlined.
    stroke: selected ? '#FFFFFF' : s.empty ? 'rgba(255,255,255,0.22)' : 'rgba(15,15,26,0.55)',
    strokeWidth: selected ? 2.2 : s.empty ? 1 : 1.2,
    strokeOpacity: dimmed ? 0.3 : 1,
    strokeDasharray: s.empty && !selected ? '3 4' : undefined,
    strokeLinejoin: 'round' as const,
    filter: selected ? 'drop-shadow(0 0 6px rgba(255,255,255,0.55))' : undefined,
  };
}

interface BodyMapProps {
  data: BodyMapData;
  /** Rendered under the figure. Omit to show only the diagram. */
  showLegend?: boolean;
  /**
   * Opens the logging flow for one group. Omit and the map stays read-only.
   *
   * Without this the map was a readout that *looked* interactive: tapping
   * highlighted a region, and on a member with nothing logged — every member on
   * day one — the highlight revealed "Not measured" and there was nowhere to go.
   */
  onLogRegion?: (key: BodyRegionKey) => void;
}

export default function BodyMap({ data, showLegend = true, onLogRegion }: BodyMapProps) {
  const states = useMemo(() => buildStates(data), [data]);
  const [view, setView] = useState<BodyView>('front');
  const [selected, setSelected] = useState<BodyRegionKey | null>(null);
  // Gradient ids must be unique per instance or a second map on the same screen
  // would reference the first one's defs.
  const uid = useId().replace(/:/g, '');

  const active = selected ? states[selected] : null;
  const measured = (Object.keys(states) as BodyRegionKey[]).filter((k) => !states[k].empty);

  return (
    <div>
      {/* Front / back. This is the part of "3D" that actually helps — the back
          of the body is where half the muscle groups are. */}
      <div className="flex items-center justify-center gap-1 p-1 rounded-full mx-auto mb-3"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', width: 'fit-content' }}
        role="tablist" aria-label="Body view">
        {(['front', 'back'] as BodyView[]).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className="px-5 h-8 rounded-full text-xs font-bold capitalize transition-colors"
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
        <svg viewBox="0 0 240 500" className="w-full" style={{ maxWidth: 210 }} role="img"
          aria-label={`Body measurement map, ${view} view`}>
          <defs>
            {/* Depth. A single flat fill is what made the old figure read as a
                sticker; the light falling from above-left is what makes this
                one read as a body. */}
            <radialGradient id={`body-${uid}`} cx="38%" cy="22%" r="85%">
              <stop offset="0%" stopColor="var(--color-surface-high)" />
              <stop offset="100%" stopColor="var(--color-bg)" />
            </radialGradient>
          </defs>

          <g fill={`url(#body-${uid})`} stroke="rgba(255,255,255,0.07)" strokeWidth="1">
            <ellipse cx={SILHOUETTE.head.cx} cy={SILHOUETTE.head.cy}
              rx={SILHOUETTE.head.rx} ry={SILHOUETTE.head.ry} />
            <path d={SILHOUETTE.neck} />
            <path d={SILHOUETTE.torso} />
            <path d={SILHOUETTE.arm} />
            <path d={SILHOUETTE.arm} transform={MIRROR} />
            <path d={SILHOUETTE.leg} />
            <path d={SILHOUETTE.leg} transform={MIRROR} />
          </g>

          {MUSCLES[view].map(({ key, d }) => {
            const s = states[key];
            const p = paint(s, selected === key, selected !== null);
            return (
              <g
                key={key}
                onClick={() => setSelected(selected === key ? null : key)}
                style={{ cursor: 'pointer' }}
                role="button"
                aria-label={LABEL[view][key]}
              >
                {d.map((path, i) => (
                  <path key={i} d={path} {...p} />
                ))}
                {d.map((path, i) => (
                  <path key={`m${i}`} d={path} transform={MIRROR} {...p} />
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
                    // One reading and nothing to compare it to. "No change"
                    // here would be a claim about a comparison that does not
                    // exist.
                    ? 'Your first reading, so there is nothing to compare it to yet.'
                    : active.delta === 0
                      ? 'Unchanged since your last reading.'
                      : `${active.delta > 0 ? 'Up' : 'Down'} ${Math.abs(active.delta)} cm since your last reading.`}
              </p>
              {/* Says which tape reading is behind the muscle you tapped — the
                  reason biceps and triceps show the same number. */}
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

          {/* A compact grid rather than nine full-width rows — nine stacked rows
              pushed the figure off a phone screen entirely. Only measured groups
              appear; the unmeasured ones are already visible on the figure as
              dashed outlines, and listing them twice is how the previous version
              needed a paragraph to explain itself. */}
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
                      style={{ background: s.fill, opacity: s.opacity }} />
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
