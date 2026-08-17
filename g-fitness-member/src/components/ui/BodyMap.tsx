import { useMemo, useState, type ReactElement } from 'react';

/**
 * A body diagram coloured from the member's own tape-measure readings.
 *
 * The four highlightable regions are exactly the four circumference columns
 * that `body_measurements` already stores — chest, arms, waist, legs. Nothing
 * here is derived from training volume, because nothing in this app records a
 * set or an exercise; a map shaded by "sets this week" would be an invention.
 *
 * ## Colour encodes magnitude, never approval
 *
 * The ramp runs violet → amber by **how far a measurement moved**, not by which
 * way it moved. That is deliberate. Whether +2 cm on the arms is progress
 * depends entirely on what the member is training for, and this component
 * cannot know: the same member may be cutting their waist while building their
 * chest. Colouring "up" green and "down" red would tell half of them that their
 * hard-won result is a failure. The signed number is printed instead, with an
 * arrow, and the member reads their own meaning into it.
 *
 * ## Never measured is not zero
 *
 * A region with no reading draws as a faint outline and says "Not measured".
 * It never falls back to 0 cm, which would render as a real, alarming shrink —
 * the same class of bug as the profile that showed one person's photo to
 * everybody.
 *
 * ## Why the geometry is what it is
 *
 * The first version drew the figure as a dozen detached `<rect rx>` pills —
 * two circles for the chest, floating bars for the arms. It was symmetric to a
 * tenth of a pixel and still looked nothing like a body, because disconnected
 * capsules never read as one. The base is now a **continuous silhouette**:
 * overlapping filled paths sharing one colour with no strokes, so they merge
 * into a single figure. The four regions are drawn *on top of* that silhouette
 * and shaped to sit inside it.
 */

export type BodyRegionKey = 'chest' | 'arms' | 'waist' | 'legs';

export interface BodyRegionInput {
  /** Most recent reading in cm, or null when this was never measured. */
  latest: number | null;
  /** The reading before it, or null when there is only one. */
  previous: number | null;
}

export type BodyMapData = Record<BodyRegionKey, BodyRegionInput>;

const REGION_LABEL: Record<BodyRegionKey, string> = {
  chest: 'Chest',
  arms: 'Arms',
  waist: 'Waist',
  legs: 'Legs',
};

/* ── Colour ────────────────────────────────────────────────────────────────
   Mixed in JS rather than with CSS `color-mix()`: this fill is written to an
   SVG `fill` attribute, and the value also has to be readable back for the
   legend swatch. Both tokens are duplicated here as literals because
   `getComputedStyle` is not available while building an attribute string. They
   match --color-primary and --color-secondary in index.css. */
const VIOLET = [124, 58, 237] as const;
const AMBER = [245, 158, 11] as const;

function mix(t: number): string {
  const c = VIOLET.map((v, i) => Math.round(v + (AMBER[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

interface RegionState {
  key: BodyRegionKey;
  label: string;
  latest: number | null;
  delta: number | null;
  /** 0–1 within this member's own readings, or null when there is no delta. */
  intensity: number | null;
  fill: string;
  opacity: number;
  empty: boolean;
}

function buildStates(data: BodyMapData): RegionState[] {
  const keys = Object.keys(REGION_LABEL) as BodyRegionKey[];

  const deltas = keys.map((k) => {
    const { latest, previous } = data[k];
    return latest != null && previous != null
      ? Number((latest - previous).toFixed(1))
      : null;
  });

  // Scaled against this member's own largest movement, not a fixed centimetre
  // range. A member whose readings all moved under a centimetre should still
  // see which one moved most; a fixed scale would render them all identical.
  const max = Math.max(0, ...deltas.map((d) => (d == null ? 0 : Math.abs(d))));

  return keys.map((key, i) => {
    const delta = deltas[i];
    const latest = data[key].latest;

    if (latest == null) {
      return {
        key, label: REGION_LABEL[key], latest: null, delta: null, intensity: null,
        fill: 'transparent', opacity: 1, empty: true,
      };
    }
    if (delta == null || max === 0) {
      // Measured, but there is nothing to compare it against yet.
      return {
        key, label: REGION_LABEL[key], latest, delta, intensity: null,
        fill: mix(0), opacity: 0.4, empty: false,
      };
    }
    const intensity = Math.abs(delta) / max;
    return {
      key, label: REGION_LABEL[key], latest, delta, intensity,
      fill: mix(intensity),
      // Floor of 0.45 so the least-changed region is still clearly filled —
      // "barely moved" must not read as "not measured".
      opacity: 0.45 + intensity * 0.55,
      empty: false,
    };
  });
}

/* ── Geometry ──────────────────────────────────────────────────────────────
   A front-facing figure on a 240 × 470 canvas, centred on x = 120 and built to
   roughly 7.5 head-heights so the proportions read as human. Every path is
   mirrored about 120 by construction. */

interface ShapeProps {
  state: RegionState;
  selected: boolean;
  /** True when *some* region is selected — the others dim. */
  anySelected: boolean;
  onSelect: () => void;
}

/**
 * How a region paints, given whether it is the selected one.
 *
 * The highlight is carried by three things at once, because any one of them
 * alone is too weak somewhere:
 *
 *  - **A white ring.** Not violet — violet is the low end of the magnitude
 *    ramp, so a violet ring on a barely-changed region would be invisible, and
 *    on a bright one would read as a *value*. White belongs to no part of the
 *    scale, so it can only mean "this is the one you tapped".
 *  - **A glow**, so the ring survives against a filled region of any brightness.
 *  - **Dimming every other region**, which is what actually makes it pop. A
 *    ring alone barely registers on a phone at arm's length.
 *
 * A region with no reading gets a solid white ring and a faint white wash when
 * selected — otherwise tapping the empty map would appear to do nothing, since
 * its normal state is a transparent fill and a dashed hairline.
 *
 * Empty regions stay tappable on `fill="transparent"` alone; verified in the
 * browser rather than assumed, because `fill="none"` would silently swallow
 * every tap on the empty state.
 */
function regionProps(s: RegionState, selected: boolean, anySelected: boolean) {
  const dimmed = anySelected && !selected;
  return {
    fill: s.empty ? (selected ? '#FFFFFF' : 'transparent') : s.fill,
    fillOpacity: s.empty ? (selected ? 0.1 : 0) : s.opacity * (dimmed ? 0.28 : 1),
    stroke: selected ? '#FFFFFF' : s.empty ? 'var(--color-border)' : s.fill,
    // Not transitioned. The ring is the only feedback for a tap, and a CSS
    // transition cannot be trusted to run: measured on a hidden page, a 200ms
    // opacity transition sat at its start value forever with playState
    // "running" and currentTime 0. Only `fill` eases, and only as decoration.
    strokeWidth: selected ? 2.5 : 1,
    strokeOpacity: dimmed ? 0.3 : 1,
    // The dash marks "no reading". A selected empty region goes solid so the
    // ring is unambiguous.
    strokeDasharray: s.empty && !selected ? '3 4' : undefined,
    strokeLinejoin: 'round' as const,
    filter: selected ? 'drop-shadow(0 0 5px rgba(255,255,255,0.5))' : undefined,
    // NOTHING here is transitioned, and that is the whole point.
    //
    // `fill` and `fill-opacity` used to ease over 240ms, back when they only
    // carried the magnitude ramp. Once they also carried *selection* — the
    // dimming of every unpicked region — the ease became a correctness bug:
    // measured on a hidden page, tapping Waist left Chest sitting at
    // fill-opacity 1.000 instead of 0.28, because a frozen transition never
    // advances past its start value. The ring and glow landed, the dimming
    // silently did not, and dimming is what makes the highlight readable at
    // arm's length.
    //
    // The rule this keeps re-teaching: the moment a property encodes state
    // rather than decoration, it must be written, not animated.
  };
}

function Chest({ state, selected, anySelected, onSelect }: ShapeProps) {
  const p = regionProps(state, selected, anySelected);
  return (
    <g onClick={onSelect} style={{ cursor: 'pointer' }} aria-label={REGION_LABEL.chest}>
      <path d="M118 99 C104 99 91 103 84 111 C78 119 78 130 84 138 C91 146 104 149 118 147 Z" {...p} />
      <path d="M122 99 C136 99 149 103 156 111 C162 119 162 130 156 138 C149 146 136 149 122 147 Z" {...p} />
    </g>
  );
}

function Arms({ state, selected, anySelected, onSelect }: ShapeProps) {
  const p = regionProps(state, selected, anySelected);
  return (
    <g onClick={onSelect} style={{ cursor: 'pointer' }} aria-label={REGION_LABEL.arms}>
      <path d="M71 114 C63 122 58 140 56 159 C54 175 53 185 53 193 C57 197 66 197 69 193
               C70 183 72 169 74 154 C76 136 78 123 78 116 Z" {...p} />
      <path d="M169 114 C177 122 182 140 184 159 C186 175 187 185 187 193 C183 197 174 197 171 193
               C170 183 168 169 166 154 C164 136 162 123 162 116 Z" {...p} />
    </g>
  );
}

function Waist({ state, selected, anySelected, onSelect }: ShapeProps) {
  const p = regionProps(state, selected, anySelected);
  return (
    <g onClick={onSelect} style={{ cursor: 'pointer' }} aria-label={REGION_LABEL.waist}>
      <path d="M120 152 C106 152 95 156 91 166 C87 180 87 197 89 213 C91 227 97 235 107 237
               L133 237 C143 235 149 227 151 213 C153 197 153 180 149 166 C145 156 134 152 120 152 Z"
        {...p} />
    </g>
  );
}

function Legs({ state, selected, anySelected, onSelect }: ShapeProps) {
  const p = regionProps(state, selected, anySelected);
  return (
    <g onClick={onSelect} style={{ cursor: 'pointer' }} aria-label={REGION_LABEL.legs}>
      <path d="M87 267 C85 289 87 313 91 335 C93 345 97 351 103 351 C109 351 113 345 114 335
               C115 313 116 289 116 267 Z" {...p} />
      <path d="M153 267 C155 289 153 313 149 335 C147 345 143 351 137 351 C131 351 127 345 126 335
               C125 313 124 289 124 267 Z" {...p} />
    </g>
  );
}

const SHAPES: Record<BodyRegionKey, (p: ShapeProps) => ReactElement> = {
  chest: Chest, arms: Arms, waist: Waist, legs: Legs,
};

/** The base figure. One fill, no strokes, overlapping on purpose so the parts
 *  merge into a single continuous silhouette instead of reading as pieces. */
function Silhouette() {
  return (
    <g fill="var(--color-surface-high)">
      {/* head + neck */}
      <ellipse cx="120" cy="45" rx="21" ry="28" />
      <path d="M108 64 L132 64 L132 88 L108 88 Z" />
      {/* torso: traps → deltoids → lats → waist → pelvis */}
      <path d="M108 84 C96 86 84 92 74 100 C68 106 66 116 68 128 C70 146 74 168 80 188
               C84 200 86 210 84 222 C82 236 80 248 82 258 C84 266 92 270 102 270
               L138 270 C148 270 156 266 158 258 C160 248 158 236 156 222
               C154 210 156 200 160 188 C166 168 170 146 172 128 C174 116 172 106 166 100
               C156 92 144 86 132 84 Z" />
      {/* arms: shoulder → elbow → wrist, one taper each */}
      <path d="M70 106 C60 112 54 128 52 148 C50 168 48 190 47 208 C46 226 44 248 43 266
               C42 280 42 290 44 296 C46 302 56 302 58 296 C60 288 61 276 62 264
               C64 244 66 224 68 206 C70 186 74 164 78 144 C80 132 80 118 78 108 Z" />
      <path d="M170 106 C180 112 186 128 188 148 C190 168 192 190 193 208 C194 226 196 248 197 266
               C198 280 198 290 196 296 C194 302 184 302 182 296 C180 288 179 276 178 264
               C176 244 174 224 172 206 C170 186 166 164 162 144 C160 132 160 118 162 108 Z" />
      {/* legs: hip → knee → ankle */}
      <path d="M84 262 C82 284 84 310 88 334 C92 356 96 384 98 406 C99 420 100 432 102 440
               C104 446 114 446 115 440 C116 430 116 418 116 404 C116 380 116 352 116 330
               C116 306 118 282 118 262 Z" />
      <path d="M156 262 C158 284 156 310 152 334 C148 356 144 384 142 406 C141 420 140 432 138 440
               C136 446 126 446 125 440 C124 430 124 418 124 404 C124 380 124 352 124 330
               C124 306 122 282 122 262 Z" />
    </g>
  );
}

interface BodyMapProps {
  data: BodyMapData;
  /** Rendered under the figure. Omit to show only the diagram. */
  showLegend?: boolean;
}

export default function BodyMap({ data, showLegend = true }: BodyMapProps) {
  const states = useMemo(() => buildStates(data), [data]);
  const [selected, setSelected] = useState<BodyRegionKey | null>(null);

  const active = states.find((s) => s.key === selected) ?? null;
  const measured = states.filter((s) => s.latest != null).length;

  return (
    <div>
      <div className="flex justify-center">
        <svg viewBox="0 0 240 470" className="w-full" style={{ maxWidth: 168 }} role="img"
          aria-label="Body measurement map">
          <Silhouette />
          {(Object.keys(SHAPES) as BodyRegionKey[]).map((key) => {
            const Shape = SHAPES[key];
            const state = states.find((s) => s.key === key)!;
            return (
              <Shape key={key} state={state} selected={selected === key}
                anySelected={selected !== null}
                onSelect={() => setSelected(selected === key ? null : key)} />
            );
          })}
        </svg>
      </div>

      {showLegend && (
        <>
          {/* Tappable rows rather than a colour-dot legend plus a separate
              readout: the old version repeated the four names twice and still
              needed a paragraph to explain itself. */}
          <div className="mt-2 space-y-1">
            {states.map((s) => {
              const on = selected === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSelected(on ? null : s.key)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left"
                  style={{
                    background: on ? 'var(--color-surface-high)' : 'transparent',
                    border: `1px solid ${on ? 'var(--color-border)' : 'transparent'}`,
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{
                      background: s.empty ? 'transparent' : s.fill,
                      opacity: s.empty ? 1 : s.opacity,
                      border: s.empty ? '1px dashed var(--color-text-muted)' : 'none',
                    }} />
                  <span className="text-xs font-semibold flex-1"
                    style={{ color: s.empty ? 'var(--color-text-muted)' : '#FFFFFF' }}>
                    {s.label}
                  </span>
                  <span className="text-xs font-semibold flex-shrink-0"
                    style={{ color: 'var(--color-text-muted)' }}>
                    {s.latest == null
                      ? 'Not measured'
                      : s.delta == null
                        ? `${s.latest} cm`
                        : `${s.latest} cm · ${s.delta > 0 ? '+' : ''}${s.delta}`}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-xs mt-2.5 px-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {measured === 0
              ? 'Log a measurement to light up the map.'
              : 'Brighter means that measurement moved more than your others — not that it moved the right way.'}
          </p>

          {active && active.delta != null && (
            <p className="text-xs mt-1 px-1 font-semibold" style={{ color: 'var(--color-secondary)' }}>
              {active.label}{' '}
              {active.delta === 0
                ? 'has not changed since your last reading.'
                : `${active.delta > 0 ? 'up' : 'down'} ${Math.abs(active.delta)} cm since your last reading.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
