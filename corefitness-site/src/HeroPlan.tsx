import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from './motion';

/**
 * The hero (2026-11-22): a gym's floor plan you can explore, the same idea as the gym sign-in's backdrop.
 *
 * Drawn as a real plan on one 20-unit grid (1000 × 700): thick walls, windows on the street side, doors as
 * gaps with their swing, rooms for the studio, the office and the lockers. Each lit area is a button for one
 * thing Core Fitness does there, and its card shows a small app detail (sample data, said so). Until someone
 * touches it, it tours the areas on its own; any interaction stops the tour for good. It draws itself once
 * (CSS) and tilts back a little as the page scrolls (--p, motion.ts). Every line restates catalogue.ts.
 */
type ZoneId = 'door' | 'desk' | 'shop' | 'tv' | 'cardio' | 'weights' | 'racks' | 'floor' | 'studio' | 'office';
interface Zone { id: ZoneId; label: string; x: number; y: number; w: number; h: number; title: string; body: string; chip: [string, string] }

const W = 1000, H = 700;
/** Areas, on the grid. Order is the tour's: in through the door, round the floor, end in the office. */
const ZONES: Zone[] = [
  { id: 'door', label: 'Entrance', x: 500, y: 580, w: 200, h: 100, title: 'At the door',
    body: 'Members show the code in their app at the desk, or scan themselves in at the kiosk. Coaches can check in too.', chip: ['Checked in', '6:02 AM'] },
  { id: 'desk', label: 'Front desk', x: 280, y: 480, w: 200, h: 100, title: 'At the front desk',
    body: 'Cash gets a receipt number the database issues. Renewals, walk-ins and the day’s drawer, in one place.', chip: ['INV-2026-0142', '₱1,000 · Cash'] },
  { id: 'shop', label: 'Shop', x: 280, y: 600, w: 200, h: 80, title: 'The shop',
    body: 'Products and prices you set. Stock moves only through sales and counts, and a sale can be voided the same day.', chip: ['Protein bar', '₱120 · 18 left'] },
  { id: 'tv', label: 'Lobby TV', x: 720, y: 480, w: 240, h: 80, title: 'The lobby TV',
    body: 'Today’s classes and your announcements on a screen in the gym. Never anyone’s private messages.', chip: ['Now showing', 'Today’s classes'] },
  { id: 'cardio', label: 'Cardio', x: 40, y: 40, w: 380, h: 200, title: 'Cardio',
    body: 'On their QR screen, members tap what they are doing today, and every visit builds a weekly streak.', chip: ['Today', 'Cardio · 4-week streak'] },
  { id: 'weights', label: 'Free weights', x: 440, y: 40, w: 260, h: 200, title: 'Free weights',
    body: 'Members log every set in the app, even with no signal, and the database finds their records.', chip: ['New record', 'Bench press · 60 kg'] },
  { id: 'racks', label: 'Racks', x: 720, y: 40, w: 240, h: 200, title: 'Where everything is',
    body: 'Your equipment list says where each machine is, every exercise points to it, and members report what needs repair.', chip: ['Rack 2', 'Repair reported'] },
  { id: 'floor', label: 'Training floor', x: 380, y: 280, w: 320, h: 180, title: 'Personal training',
    body: 'Coaches decide their own bookings, with clash checks on both sides, and chat with each trainee.', chip: ['Thu · 6:00 PM', 'Accepted'] },
  { id: 'studio', label: 'Studio', x: 40, y: 280, w: 320, h: 180, title: 'Classes, if you run them',
    body: 'A weekly timetable that builds itself, seats to book, and a waitlist that tells everyone when one frees.', chip: ['Spin · 7:00 PM', '3 seats left'] },
  { id: 'office', label: 'Office', x: 720, y: 280, w: 240, h: 180, title: 'In the owner’s office',
    body: 'Each morning: what needs you, who checked in, the cash, and who is drifting away.', chip: ['Checked in today', '46'] },
];
const TOUR_MS = 3600;
const pct = (n: number, of: number) => `${(n / of) * 100}%`;

export default function HeroPlan() {
  const still = reducedMotion();
  const [active, setActive] = useState<ZoneId>('door');
  const [touring, setTouring] = useState(!still);
  const hovering = useRef(false);

  useEffect(() => {
    if (!touring) return;
    const t = window.setInterval(() => {
      if (hovering.current || document.hidden) return;
      setActive((a) => ZONES[(ZONES.findIndex((z) => z.id === a) + 1) % ZONES.length]!.id);
    }, TOUR_MS);
    return () => window.clearInterval(t);
  }, [touring]);

  const pick = (id: ZoneId) => { setTouring(false); setActive(id); };
  const z = ZONES.find((x) => x.id === active)!;
  const n = ZONES.findIndex((x) => x.id === active) + 1;

  return (
    <div className="hplan" data-hero-plan onPointerEnter={() => { hovering.current = true; }} onPointerLeave={() => { hovering.current = false; }}>
      <div className="hp-stage">
        <div className="hp-board">
          <svg className="hp-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            {/* Walls: the outer shell with the entrance gap, then the rooms. */}
            <g className="hp-wall" style={{ ['--s' as string]: 0 }}>
              <path pathLength={1} d="M560 680 H20 V20 H980 V680 H640" />
              <path pathLength={1} d="M20 280 H360 V380 M360 440 V460 H20" />
              <path pathLength={1} d="M980 280 H720 V460 H740 M800 460 H980" />
              <path pathLength={1} d="M20 480 H260 V600 M260 640 V680" />
            </g>
            {/* Windows on the street side, and the door swings. */}
            <g className="thin" style={{ ['--s' as string]: 0.5 }}>
              {[80, 220].map((x) => <path pathLength={1} key={x} d={`M${x} 16 H${x + 120} M${x} 24 H${x + 120}`} />)}
              {/* Entrance (gap 560 to 640): double doors, a 40 leaf from each jamb. */}
              <path pathLength={1} d="M560 680 V640 A40 40 0 0 1 600 680 M640 680 V640 A40 40 0 0 0 600 680" />
              {/* Studio (gap 380 to 440 on x 360), hinged at the top jamb, opening into the studio. */}
              <path pathLength={1} d="M360 380 H300 A60 60 0 0 0 360 440" />
              {/* Office (gap 740 to 800 on y 460), hinged at the left jamb, opening into the office. */}
              <path pathLength={1} d="M740 460 V400 A60 60 0 0 1 800 460" />
              {/* Lockers (gap 600 to 640 on x 260), hinged at the top jamb, opening into the lobby. */}
              <path pathLength={1} d="M260 600 H300 A40 40 0 0 1 260 640" />
            </g>
            {/* Cardio: six treadmills facing the windows. */}
            <g style={{ ['--s' as string]: 1 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <g key={i}><rect pathLength={1} x={60 + i * 60} y={120} width={40} height={100} rx={6} /><path pathLength={1} className="thin" d={`M${70 + i * 60} 140 V200`} /></g>
              ))}
            </g>
            {/* Free weights: a dumbbell rack on the wall, three benches. */}
            <g style={{ ['--s' as string]: 1.5 }}>
              <rect pathLength={1} x={460} y={120} width={220} height={20} rx={6} />
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <circle pathLength={1} key={i} cx={480 + i * 26} cy={130} r={6} />)}
              {[0, 1, 2].map((i) => <rect pathLength={1} key={i} x={460 + i * 80} y={180} width={60} height={20} rx={6} />)}
            </g>
            {/* Racks: two power racks on a platform. */}
            <g style={{ ['--s' as string]: 2 }}>
              <rect pathLength={1} className="thin" x={740} y={120} width={200} height={100} rx={4} />
              {[760, 860].map((x) => <g key={x}><rect pathLength={1} x={x} y={130} width={60} height={80} rx={4} /><path pathLength={1} className="thin" d={`M${x} 170 H${x + 60}`} /></g>)}
            </g>
            {/* Studio: a mirror wall and mats. */}
            <g style={{ ['--s' as string]: 2.5 }}>
              <path pathLength={1} className="thin" d="M40 340 V440" />
              {[0, 1, 2].map((c) => [0, 1].map((r) => <rect pathLength={1} key={`${c}${r}`} x={64 + c * 76} y={340 + r * 50} width={60} height={30} rx={6} />))}
            </g>
            {/* Training floor: turf with two coaching spots. */}
            <g style={{ ['--s' as string]: 3 }}>
              <rect pathLength={1} className="thin" x={400} y={340} width={280} height={100} rx={6} />
              {[460, 600].map((x) => <circle pathLength={1} key={x} cx={x} cy={390} r={22} />)}
            </g>
            {/* Office: a desk and a chair. */}
            <g style={{ ['--s' as string]: 3.5 }}>
              <rect pathLength={1} x={840} y={340} width={100} height={40} rx={4} />
              <circle pathLength={1} cx={890} cy={410} r={12} />
            </g>
            {/* Lobby: the lockers room, the counter, shop shelves, the TV, the kiosk, a bench. */}
            <g style={{ ['--s' as string]: 4 }}>
              {[0, 1, 2, 3, 4].map((i) => <rect pathLength={1} key={i} x={40 + i * 40} y={540} width={32} height={60} rx={3} />)}
              <path pathLength={1} d="M300 560 H460 V520" />
              <rect pathLength={1} x={380} y={530} width={40} height={20} rx={3} />
              {[300, 380].map((x) => <rect pathLength={1} key={x} x={x} y={640} width={60} height={20} rx={3} />)}
              <rect pathLength={1} x={780} y={540} width={140} height={10} rx={2} />
              <rect pathLength={1} x={520} y={626} width={20} height={36} rx={4} />
              <rect pathLength={1} x={780} y={590} width={160} height={20} rx={6} />
            </g>
          </svg>
          <span className="hp-fixture" style={{ left: pct(40, W), top: pct(480, H) }} aria-hidden="true">Lockers</span>
          {ZONES.map((zone) => (
            <button key={zone.id} type="button" className={`hp-zone${zone.id === active ? ' on' : ''}`} data-zone={zone.id}
              style={{ left: pct(zone.x, W), top: pct(zone.y, H), width: pct(zone.w, W), height: pct(zone.h, H) }}
              aria-pressed={zone.id === active} aria-controls="hp-card"
              onClick={() => pick(zone.id)} onFocus={() => pick(zone.id)} onPointerEnter={(e) => { if (e.pointerType === 'mouse') pick(zone.id); }}>
              <span>{zone.label}</span>
            </button>
          ))}
          <span className="hp-here" style={{ left: pct(652, W), top: pct(662, H) }} aria-hidden="true"><i />You are here</span>
        </div>
      </div>

      <div className="hp-card" id="hp-card" aria-live="polite">
        <div key={z.id} className="hp-card__in">
          <p className="hp-card__where">{z.label}<span>{n} / {ZONES.length}</span></p>
          <h2 className="hp-card__title">{z.title}</h2>
          <p className="hp-card__body">{z.body}</p>
          <p className="hp-chip"><span>{z.chip[0]}</span><b>{z.chip[1]}</b></p>
        </div>
        <div className="hp-card__foot">
          <span>{touring ? 'Touring the floor · tap any area' : 'Tap any area of the floor'}</span>
          <span className="hp-sample">Sample data</span>
        </div>
        {touring && <span key={`t-${z.id}`} className="hp-timer" style={{ ['--t' as string]: `${TOUR_MS}ms` }} aria-hidden="true" />}
      </div>
    </div>
  );
}
