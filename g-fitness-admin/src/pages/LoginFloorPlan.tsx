import type { ReactNode } from 'react';

/**
 * The sign-in's backdrop (2026-11-22): a gym's floor plan in the website hero's style (thick walls, windows,
 * rooms with door swings) with the door where the form is, so signing in reads as walking into your gym.
 * Decorative only (aria-hidden), not interactive. The plan draws itself once; people move through it,
 * drawn the way a plan draws people (a head over shoulders, from above): two members walk in through the
 * door to the desk, the kiosk, the treadmills, the lockers and the studio; others run, squat, curl, and
 * follow a class. Faint enough that the form always reads first. With reduced motion, everyone stands still.
 *
 * The middle third (x 576 to 1026) is kept clear for the form; the top wall is open there.
 */
const L = 1;
type Pt = [number, number];

const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A walk along straight lines at a steady pace, pausing at some corners: SMIL motion with matching key times. */
function route(points: Pt[], pauses: Record<number, number>, speed = 70) {
  const seg = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]));
  const total = seg.reduce((a, b) => a + b, 0);
  const keyPoints: number[] = [0], keyTimes: number[] = [0];
  let len = 0, t = 0;
  const marks: { p: number; t: number }[] = [{ p: 0, t: 0 }];
  points.forEach((_, i) => {
    if (i > 0) { len += seg[i - 1]!; t += seg[i - 1]! / speed; marks.push({ p: len / total, t }); }
    if (pauses[i]) { t += pauses[i]!; marks.push({ p: len / total, t }); }
  });
  marks.slice(1).forEach((m) => { keyPoints.push(m.p); keyTimes.push(m.t / t); });
  return {
    path: `M${points.map((p) => p.join(' ')).join(' L')}`,
    keyPoints: keyPoints.map((v) => v.toFixed(4)).join(';'),
    keyTimes: keyTimes.map((v) => v.toFixed(4)).join(';'),
    dur: `${t.toFixed(1)}s`,
    start: points[0]!,
  };
}

/** A member in a plan: shoulders and a head, seen from above. */
const Person = ({ x, y, cls = '', children }: { x: number; y: number; cls?: string; children?: ReactNode }) => (
  <g transform={`translate(${x} ${y})`}>
    <g className={`pl-person ${cls}`}>
      <ellipse rx={11} ry={6.5} />
      <circle r={5.5} />
      {children}
    </g>
  </g>
);

/** Someone walking a route, fading in through the door and out again. */
function Walker({ r, begin }: { r: ReturnType<typeof route>; begin: string }) {
  if (still) return null;
  return (
    <g className="pl-walker" opacity={0}>
      <g className="pl-person"><ellipse rx={11} ry={6.5} /><circle r={5.5} /></g>
      <animateMotion path={r.path} keyPoints={r.keyPoints} keyTimes={r.keyTimes} calcMode="linear" dur={r.dur} begin={begin} repeatCount="indefinite" />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.03;0.97;1" dur={r.dur} begin={begin} repeatCount="indefinite" />
    </g>
  );
}

// Routes keep to the aisles and go through real door gaps, never through furniture or behind the form.
// In at the door, to the front desk, round the counter, up the aisle to the treadmills, and out again.
const WALK_A = route([[800, 880], [800, 825], [600, 825], [460, 760], [340, 760], [340, 620], [545, 560], [545, 295], [330, 295],
  [545, 295], [545, 620], [570, 690], [570, 805], [620, 830], [800, 880]], { 3: 2.5, 8: 3 });
// In at the door, the kiosk, into the lockers, into the studio, and out again.
const WALK_B = route([[800, 880], [800, 825], [1030, 830], [1100, 800], [1150, 750], [1240, 750], [1150, 750], [1050, 640], [1050, 500],
  [1090, 500], [1090, 550], [1200, 550], [1090, 550], [1090, 500], [1050, 500], [1050, 640], [1120, 700], [1120, 800], [1030, 830], [800, 880]],
{ 3: 2, 5: 3, 11: 4 });

export default function LoginFloorPlan() {
  const treadmills = [0, 1, 2, 3, 4, 5].map((i) => 150 + i * 66);
  const racks = [0, 1, 2].map((i) => 1080 + i * 130);
  const lockers = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 1210 + i * 36);
  const mats: Pt[] = [0, 1, 2].flatMap((c) => [0, 1].map((r) => [1200 + c * 110, 420 + r * 70] as Pt));
  return (
    <svg className="al-plan" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      {/* Walls: the shell (open at the top where the form stands, the entrance at the bottom), the studio, the lockers. */}
      <g className="pl-wall" style={{ ['--s' as string]: 0 }}>
        <path pathLength={L} d="M740 840 H80 V70 H560" />
        <path pathLength={L} d="M1040 70 H1520 V840 H860" />
        <path pathLength={L} d="M1520 330 H1080 V470 M1080 530 V600 H1520" />
        <path pathLength={L} d="M1520 650 H1180 V720 M1180 780 V840" />
      </g>
      {/* Windows on the side walls, and the door swings. */}
      <g className="pl-thin" style={{ ['--s' as string]: 0.5 }}>
        {[150, 400].map((y) => <path pathLength={L} key={`l${y}`} d={`M76 ${y} V${y + 110} M84 ${y} V${y + 110}`} />)}
        <path pathLength={L} d="M1516 120 V230 M1524 120 V230" />
        {/* Entrance (gap 740 to 860): double doors, a 60 leaf from each jamb, meeting in the middle. */}
        <path pathLength={L} d="M740 840 V780 A60 60 0 0 1 800 840 M860 840 V780 A60 60 0 0 0 800 840" />
        {/* Studio (gap 470 to 530 on x 1080): hinged at the top jamb, opening into the room. */}
        <path pathLength={L} d="M1080 470 H1140 A60 60 0 0 1 1080 530" />
        {/* Lockers (gap 720 to 780 on x 1180): hinged at the top jamb, opening into the lobby. */}
        <path pathLength={L} d="M1180 720 H1120 A60 60 0 0 0 1180 780" />
      </g>

      <g style={{ ['--s' as string]: 1 }}>{/* Cardio */}
        {treadmills.map((x) => <g key={x}><rect pathLength={L} x={x} y={140} width={44} height={120} rx={6} /><path pathLength={L} d={`M${x + 10} 158 V242`} className="pl-thin" /></g>)}
        <text x={150} y={118}>CARDIO</text>
      </g>
      <g style={{ ['--s' as string]: 2 }}>{/* Free weights */}
        <rect pathLength={L} x={150} y={380} width={370} height={26} rx={6} />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <circle pathLength={L} key={i} cx={176 + i * 46} cy={393} r={7} />)}
        {[0, 1, 2].map((i) => <rect pathLength={L} key={i} x={170 + i * 120} y={460} width={80} height={30} rx={8} />)}
        <text x={150} y={358}>FREE WEIGHTS</text>
      </g>
      <g style={{ ['--s' as string]: 2.75 }}>{/* Stretching corner: mats, foam rollers, a water station */}
        {[0, 1].flatMap((c) => [0, 1].map((r) => <rect pathLength={L} key={`m${c}${r}`} x={130 + c * 100} y={630 + r * 70} width={80} height={36} rx={6} />))}
        {[0, 1, 2].map((i) => <rect pathLength={L} key={`f${i}`} x={130 + i * 34} y={790} width={24} height={30} rx={12} className="pl-thin" />)}
        <rect pathLength={L} x={270} y={792} width={36} height={26} rx={4} />
        <circle pathLength={L} cx={288} cy={805} r={6} className="pl-thin" />
        <text x={130} y={612}>STRETCHING</text>
      </g>
      <g style={{ ['--s' as string]: 3 }}>{/* Front desk */}
        <path pathLength={L} d="M360 700 H560 V790" />
        <rect pathLength={L} x={440} y={710} width={40} height={18} rx={3} className="pl-thin" />
        <text x={360} y={678}>FRONT DESK</text>
      </g>
      <g style={{ ['--s' as string]: 1.5 }}>{/* Racks */}
        {racks.map((x) => <g key={x}><rect pathLength={L} x={x} y={140} width={100} height={100} rx={6} /><path pathLength={L} d={`M${x + 12} 190 H${x + 88}`} className="pl-thin" /></g>)}
        <text x={1080} y={118}>RACKS</text>
      </g>
      <g style={{ ['--s' as string]: 2.5 }}>{/* Studio */}
        <path pathLength={L} d="M1500 360 V580" className="pl-thin" />
        {mats.map(([x, y]) => <rect pathLength={L} key={`${x}${y}`} x={x - 40} y={y - 15} width={80} height={30} rx={6} />)}
        <text x={1100} y={362}>STUDIO</text>
      </g>
      <g style={{ ['--s' as string]: 3.5 }}>{/* Lockers and kiosk */}
        {lockers.map((x) => <rect pathLength={L} key={x} x={x} y={690} width={30} height={56} rx={3} />)}
        <rect pathLength={L} x={1230} y={790} width={250} height={16} rx={5} className="pl-thin" />
        <text x={1210} y={676}>LOCKERS</text>
        <rect pathLength={L} x={1040} y={770} width={30} height={46} rx={5} />
        <text x={1040} y={760}>KIOSK</text>
      </g>

      {/* People. */}
      <g className="pl-people">
        {/* Runners: three treadmills in use, each at its own pace. */}
        {[0, 2, 5].map((i, k) => <Person key={i} x={treadmills[i]! + 22} y={205} cls={`run run-${k}`} />)}
        {/* Squats in two racks: the bar dips with them. */}
        {[0, 2].map((i, k) => (
          <Person key={i} x={racks[i]! + 50} y={190} cls={`squat squat-${k}`}><rect x={-34} y={-1.5} width={68} height={3} rx={1.5} className="pl-bar" /></Person>
        ))}
        {/* A bench, with a dumbbell curl. */}
        <Person x={330} y={520} cls="curl" />
        {/* The studio: an instructor facing the class, the class in time. */}
        <Person x={1310} y={380} cls="lead" />
        {mats.map(([x, y], i) => <Person key={i} x={x} y={y} cls={`move move-${i % 3}`} />)}
        {/* Stretching: one on a mat, slowly reaching. */}
        <Person x={170} y={648} cls="stretch" />
        <Person x={270} y={718} cls="stretch stretch-1" />
        {/* The desk, staffed. */}
        <Person x={500} y={682} cls="desk" />
        <Walker r={WALK_A} begin="1.8s" />
        <Walker r={WALK_B} begin="6s" />
      </g>

      {/* You are here: just outside the entrance, clear of the doors. */}
      <g className="pl-here">
        <circle cx={800} cy={872} r={6} />
        <text x={816} y={876}>YOU ARE HERE</text>
      </g>
    </svg>
  );
}
