import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import { reducedMotion, useChapter } from './motion';

/**
 * "One day at your gym" — the scrollytelling section.
 *
 * The section is five screens tall; its stage is sticky, and the chapter you
 * are in decides which scene the device shows and whether it is the member's
 * phone or the front desk. Each scene is an *illustration* with sample data,
 * and says so — but every behaviour in it is one the system has (copy is a
 * claim): QR check-in and the kiosk, receipt numbers the database issues,
 * the waitlist telling everyone a seat freed, personal records found by a trigger,
 * the cash day summary and the retention list.
 */

interface Chapter {
  time: string;
  /** Minutes since midnight, for the clock hand. */
  at: number;
  who: string;
  device: 'phone' | 'desk';
  icon: IconName;
  title: string;
  body: string;
  scene: ReactNode;
}

/** A fixed, decorative QR-like pattern. Not a code: nothing scans it. */
const QR = () => {
  const n = 21;
  const cells: ReactNode[] = [];
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (finder(x, y)) continue;
    if (((x * 7 + y * 13 + x * y) % 5) < 2) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
  }
  const eye = (x: number, y: number) => (
    <g key={`${x}${y}`}><rect x={x} y={y} width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1" transform="translate(.5 .5) scale(.857)" />
      <rect x={x + 2} y={y + 2} width="3" height="3" rx=".6" /></g>
  );
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="qr-art" aria-hidden="true">
      <g fill="currentColor">{cells}{eye(0, 0)}{eye(n - 7, 0)}{eye(0, n - 7)}</g>
    </svg>
  );
};

const CHAPTERS: Chapter[] = [
  {
    time: '6:00 AM', at: 360, who: "A member's phone", device: 'phone', icon: 'qr',
    title: 'Doors open. Members check themselves in.',
    body: 'Every member carries a check-in code in their app. The desk scans it, or the kiosk by the door does — and the front desk keeps working.',
    scene: (
      <div className="scene s-checkin">
        <div className="sc-top"><span>Check in</span><small>Show this at the desk</small></div>
        <div className="qr-wrap"><QR /><span className="scanline" /></div>
        <div className="toast"><Icon name="check" /> Checked in · 6:02 AM</div>
      </div>
    ),
  },
  {
    time: '9:30 AM', at: 570, who: 'The front desk', device: 'desk', icon: 'receipt',
    title: 'Cash, counted properly.',
    body: 'A payment at the desk gets a receipt number the database issues — never typed, never repeated — and the day’s cash adds up when the drawer closes.',
    scene: (
      <div className="scene s-receipt">
        <div className="printer"><span /></div>
        <div className="paper">
          <b>Your gym</b>
          <small>Receipt · INV-2026-0142</small>
          <hr />
          <div className="row"><span>Monthly membership</span><span>₱1,000</span></div>
          <div className="row"><span>Paid in</span><span>Cash</span></div>
          <hr />
          <div className="row total"><span>Total</span><span>₱1,000</span></div>
          <div className="stamp">PAID</div>
        </div>
      </div>
    ),
  },
  {
    time: '12:00 PM', at: 720, who: "A member's phone", device: 'phone', icon: 'calendar',
    title: 'Classes fill up — and refill.',
    body: 'A timetable that generates itself, coaches who accept their own bookings, and a waitlist that tells everyone waiting the moment a seat frees.',
    scene: (
      <div className="scene s-classes">
        <div className="sc-top"><span>Today</span><small>Your classes</small></div>
        <div className="cls"><i style={{ background: 'var(--violet)' }} /><div><b>Morning HIIT</b><small>6:00 AM · booked</small></div><Icon name="check" /></div>
        <div className="cls full"><i style={{ background: 'var(--amber)' }} /><div><b>Boxing Basics</b><small>6:00 PM · full · waitlist #1</small></div></div>
        <div className="cls"><i style={{ background: 'var(--violet-text)' }} /><div><b>Spin</b><small>7:00 PM · 3 seats</small></div></div>
        <div className="push"><Icon name="bell" /><div><b>A seat opened</b><small>Boxing Basics, 6:00 PM — book it before someone else does.</small></div></div>
      </div>
    ),
  },
  {
    time: '5:30 PM', at: 1050, who: "A member's phone", device: 'phone', icon: 'dumbbell',
    title: 'Training that counts.',
    body: 'Members log their sets. The database spots a personal record, and points and badges follow the rules you set — nothing a phone can fake.',
    scene: (
      <div className="scene s-workout">
        <div className="sc-top"><span>Upper body</span><small>Set 3 of 3</small></div>
        <div className="set"><span>Bench press</span><b>3 × 8 · 60 kg</b></div>
        <div className="set"><span>Shoulder press</span><b>3 × 10 · 25 kg</b></div>
        <div className="set pr"><span>Lat pulldown</span><b>3 × 10 · 55 kg</b><em>New record</em></div>
        <div className="badge-pop">
          <div className="medal"><Icon name="star" /></div>
          <b>Badge unlocked</b><small>Regular — 25 training days</small>
          {Array.from({ length: 12 }, (_, i) => <i key={i} className="confetti" style={{ ['--i' as string]: i }} />)}
        </div>
      </div>
    ),
  },
  {
    time: '9:00 PM', at: 1260, who: "The owner's dashboard", device: 'desk', icon: 'chart',
    title: 'Close the day knowing it.',
    body: 'Check-ins by the hour, the day’s cash, who is drifting away, and whose membership ends this week — before you lock up.',
    scene: (
      <div className="scene s-close">
        <div className="sc-top"><span>Today</span><small>Check-ins by hour</small></div>
        <div className="bars">
          {[30, 62, 45, 22, 18, 26, 34, 58, 92, 74, 40, 16].map((h, i) => (
            <span key={i} style={{ ['--h' as string]: `${h}%`, ['--i' as string]: i }} className={i === 8 ? 'peak' : ''} />
          ))}
        </div>
        <div className="kpis">
          <div><small>Cash in drawer</small><b>₱8,500</b></div>
          <div><small>At risk</small><b>3 members</b></div>
          <div><small>Ending this week</small><b>5</b></div>
        </div>
      </div>
    ),
  },
];

const fmtClock = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`;
};

/** Without motion, the day is an ordinary list: each chapter beside its own scene, nothing pinned. */
function StillStory() {
  return (
    <section className="story still" id="day">
      <div className="wrap">
        <span className="eyebrow">One day at your gym</span>
        <p className="illus-note" style={{ marginTop: 12 }}>Illustrations · sample data</p>
        <div className="story-list">
          {CHAPTERS.map((ch) => (
            <div className="story-row" key={ch.time}>
              <div>
                <span className="time">{ch.time}</span>
                <span className="who"><Icon name={ch.icon} /> {ch.who}</span>
                <h2>{ch.title}</h2>
                <p>{ch.body}</p>
              </div>
              <div className={`device ${ch.device}`}>
                <div className="device-bar"><span /><span /><span /><em>{ch.device === 'phone' ? 'Member app' : 'Gym app'}</em></div>
                <div className="screen"><div className="scene-slot on">{ch.scene}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Story() {
  return reducedMotion() ? <StillStory /> : <PinnedStory />;
}

function PinnedStory() {
  const [ref, chapter] = useChapter<HTMLElement>(CHAPTERS.length);
  const c = CHAPTERS[chapter]!;
  const angle = (c.at / 720) * 360;

  return (
    <section className="story" id="day" ref={ref} data-pin style={{ ['--n' as string]: CHAPTERS.length }}>
      <div className="story-stage">
        <div className="story-copy">
          <span className="eyebrow">One day at your gym</span>
          <div className="clock-row">
            <div className="clock" aria-hidden="true">
              <span className="hand" style={{ transform: `rotate(${angle}deg)` }} />
              <span className="hand min" style={{ transform: `rotate(${(c.at % 60) * 6}deg)` }} />
            </div>
            <div className="clock-time" aria-live="polite">
              <b key={c.time}>{fmtClock(c.at)}</b><span>{c.at < 720 ? 'AM' : 'PM'}</span>
            </div>
          </div>
          <div className="chapters">
            {CHAPTERS.map((ch, i) => (
              <article key={ch.time} className={`chapter${i === chapter ? ' on' : ''}`} aria-hidden={i !== chapter}>
                <span className="who"><Icon name={ch.icon} /> {ch.who}</span>
                <h2>{ch.title}</h2>
                <p>{ch.body}</p>
              </article>
            ))}
          </div>
          <ol className="story-dots" aria-hidden="true">
            {CHAPTERS.map((ch, i) => <li key={ch.time} className={i === chapter ? 'on' : i < chapter ? 'done' : ''}><span>{ch.time}</span></li>)}
          </ol>
        </div>

        <div className="story-visual">
          <div className={`device ${c.device}`}>
            <div className="device-bar"><span /><span /><span /><em>{c.device === 'phone' ? 'Member app' : 'Gym app'}</em></div>
            <div className="screen">
              {CHAPTERS.map((ch, i) => (
                <div key={ch.time} className={`scene-slot${i === chapter ? ' on' : ''}`}>{ch.scene}</div>
              ))}
            </div>
          </div>
          <p className="illus-note">Illustration · sample data</p>
        </div>
      </div>
    </section>
  );
}
