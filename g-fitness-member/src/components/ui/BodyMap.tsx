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
 * A region with no reading draws as a dashed outline and says "Not measured".
 * It never falls back to 0 cm, which would render as a real, alarming shrink —
 * the same class of bug as the profile that showed one person's photo to
 * everybody.
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
  dashed: boolean;
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
        fill: 'transparent', opacity: 1, dashed: true,
      };
    }
    if (delta == null || max === 0) {
      // Measured, but there is nothing to compare it against yet.
      return {
        key, label: REGION_LABEL[key], latest, delta, intensity: null,
        fill: mix(0), opacity: 0.38, dashed: false,
      };
    }
    const intensity = Math.abs(delta) / max;
    return {
      key, label: REGION_LABEL[key], latest, delta, intensity,
      fill: mix(intensity),
      // Floor of 0.45 so the least-changed region is still clearly filled —
      // "barely moved" must not read as "not measured".
      opacity: 0.45 + intensity * 0.55,
      dashed: false,
    };
  });
}

/* ── Geometry ──────────────────────────────────────────────────────────────
   A deliberately stylised figure rather than an anatomical drawing: it is
   built from rounded primitives so every shape is symmetric about x = 110 by
   construction, and it reads clearly at the ~180px width a phone gives it. */

const BASE = 'var(--color-surface-high)';

interface ShapeProps {
  state: RegionState;
  selected: boolean;
  onSelect: () => void;
}

/** Shared presentation for a tappable region group. */
function regionProps(s: RegionState, selected: boolean) {
  return {
    fill: s.fill,
    fillOpacity: s.dashed ? 0 : s.opacity,
    stroke: s.dashed ? 'var(--color-text-muted)' : s.fill,
    strokeWidth: selected ? 2.5 : s.dashed ? 1.25 : 1,
    strokeDasharray: s.dashed ? '4 3' : undefined,
    // `stroke-width` is deliberately NOT transitioned. It is the only visual
    // feedback for a tap, and a transition cannot be trusted to run: measured
    // on a hidden page, a 200ms opacity transition sat at its start value with
    // `playState: "running"` and `currentTime: 0` indefinitely. CSS transitions
    // freeze exactly like requestAnimationFrame does — so the selection ring
    // snaps, and only the decorative fill is allowed to ease.
    style: { transition: 'fill 240ms ease, fill-opacity 240ms ease' },
  };
}

function Chest({ state, selected, onSelect }: ShapeProps) {
  const p = regionProps(state, selected);
  return (
    <g onClick={onSelect} style={{ cursor: 'pointer' }} aria-label={REGION_LABEL.chest}>
      <rect x="76" y="86" width="30" height="34" rx="11" transform="rotate(-8 91 103)" {...p} />
      <rect x="114" y="86" width="30" height="34" rx="11" transform="rotate(8 129 103)" {...p} />
    </g>
  );
}

function Arms({ state, selected, onSelect }: ShapeProps) {
  const p = regionProps(state, selected);
  return (
    <g onClick={onSelect} style={{ cursor: 'pointer' }} aria-label={REGION_LABEL.arms}>
      <rect x="52" y="106" width="21" height="62" rx="10" transform="rotate(-6 62 137)" {...p} />
      <rect x="147" y="106" width="21" height="62" rx="10" transform="rotate(6 158 137)" {...p} />
    </g>
  );
}

function Waist({ state, selected, onSelect }: ShapeProps) {
  const p = regionProps(state, selected);
  return (
    <g onClick={onSelect} style={{ cursor: 'pointer' }} aria-label={REGION_LABEL.waist}>
      <rect x="88" y="124" width="44" height="64" rx="14" {...p} />
      <rect x="76" y="128" width="10" height="48" rx="5" {...p} />
      <rect x="134" y="128" width="10" height="48" rx="5" {...p} />
    </g>
  );
}

function Legs({ state, selected, onSelect }: ShapeProps) {
  const p = regionProps(state, selected);
  return (
    <g onClick={onSelect} style={{ cursor: 'pointer' }} aria-label={REGION_LABEL.legs}>
      <rect x="82" y="210" width="24" height="82" rx="12" transform="rotate(-2 94 251)" {...p} />
      <rect x="114" y="210" width="24" height="82" rx="12" transform="rotate(2 126 251)" {...p} />
    </g>
  );
}

const SHAPES: Record<BodyRegionKey, (p: ShapeProps) => ReactElement> = {
  chest: Chest, arms: Arms, waist: Waist, legs: Legs,
};

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
        <svg viewBox="0 0 220 390" className="w-full" style={{ maxWidth: 210 }} role="img"
          aria-label="Body measurement map">
          {/* Base figure — the parts no tape measure in this app records. */}
          <g fill={BASE}>
            <ellipse cx="110" cy="34" rx="19" ry="23" />
            <rect x="101" y="52" width="18" height="18" rx="6" />
            <rect x="66" y="70" width="88" height="20" rx="10" />
            <ellipse cx="72" cy="94" rx="16" ry="17" />
            <ellipse cx="148" cy="94" rx="16" ry="17" />
            <rect x="50" y="170" width="18" height="56" rx="9" />
            <rect x="152" y="170" width="18" height="56" rx="9" />
            <rect x="84" y="188" width="52" height="28" rx="13" />
            <rect x="85" y="294" width="19" height="76" rx="9" />
            <rect x="116" y="294" width="19" height="76" rx="9" />
          </g>

          {(Object.keys(SHAPES) as BodyRegionKey[]).map((key) => {
            const Shape = SHAPES[key];
            const state = states.find((s) => s.key === key)!;
            return (
              <Shape key={key} state={state} selected={selected === key}
                onSelect={() => setSelected(selected === key ? null : key)} />
            );
          })}
        </svg>
      </div>

      {showLegend && (
        <>
          {/* The selected region's own numbers, or a prompt to tap one. */}
          <div className="rounded-2xl p-3 mt-1"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            {active ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{active.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {active.latest == null
                      ? 'Not measured yet'
                      : active.delta == null
                        ? 'First reading — log another to see the change'
                        : active.delta === 0
                          ? 'No change since your last reading'
                          : `${active.delta > 0 ? '+' : ''}${active.delta} cm since your last reading`}
                  </p>
                </div>
                {active.latest != null && (
                  <span className="text-lg font-bold text-white flex-shrink-0">
                    {active.latest}<span className="text-xs font-semibold"
                      style={{ color: 'var(--color-text-muted)' }}> cm</span>
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {measured === 0
                  ? 'Log a measurement to light up the map.'
                  : 'Tap a highlighted area to see its numbers.'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2 px-1">
            {states.map((s) => (
              <button key={s.key} onClick={() => setSelected(selected === s.key ? null : s.key)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: selected === s.key ? '#FFFFFF' : 'var(--color-text-muted)' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    background: s.dashed ? 'transparent' : s.fill,
                    opacity: s.dashed ? 1 : s.opacity,
                    border: s.dashed ? '1px dashed var(--color-text-muted)' : 'none',
                  }} />
                {s.label}
              </button>
            ))}
          </div>

          <p className="text-xs mt-2 px-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Brighter means that measurement moved more than your others — not that
            it moved the right way. Only you know which direction you are training for.
          </p>
        </>
      )}
    </div>
  );
}
