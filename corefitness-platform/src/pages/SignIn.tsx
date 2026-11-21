import { useState } from 'react';
import type { CSSProperties } from 'react';
import { supabase } from '../lib/supabaseClient';
import { isPlatformAdmin } from '../lib/platform';
import './door.css';

/**
 * The door (2026-11-22). Signing in is not the same as being let in: an account that is not in
 * `platform_admins` is signed straight back out, and told plainly, rather than landing on empty screens.
 *
 * The look is the gym sign-in's (g-fitness-admin login.css, "quiet column"): the same dark ground, hairlines,
 * fields and one amber action. Above the form, the Core Fitness mark redrawn as line art in the floor plan's
 * colours (grey lines, one violet trace). "Eclipse" (the owner's pick of three, design/platform-login/mockups.html):
 * an opening shot where the mark draws large in the middle of the dark, then settles above the form as three
 * tilted orbits open around the whole sign-in, carrying the platform's pages, the inner ones the pages used most.
 * On a phone the orbits circle the mark instead. Decorative only. With reduced motion, everything starts in place.
 */
type Planet = { name: string; a: number };
const ORBITS: { r: number; dur: number; planets: Planet[] }[] = [
  { r: 250, dur: 70, planets: [{ name: 'Gyms', a: 20 }, { name: 'Applications', a: 140 }, { name: 'Money', a: 260 }] },
  { r: 400, dur: 110, planets: [{ name: 'Plans', a: 70 }, { name: 'Support', a: 160 }, { name: 'Website', a: 250 }, { name: 'What’s new', a: 340 }] },
  { r: 560, dur: 160, planets: [{ name: 'Growth', a: 0 }, { name: 'Capacity', a: 72 }, { name: 'Activity', a: 144 }, { name: 'Platform', a: 216 }, { name: 'Announcements', a: 288 }] },
];
const ADMIN = 'https://corefitness-admin.vercel.app/admin/login';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.';
}

/** The mark as a plan would draw it: double walls for the C, the barbell, the runner, the heartbeat, the pixels. */
function Mark() {
  return (
    <svg className="pd-mark" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <circle className="pd-disc" cx={100} cy={100} r={96} />
      <g style={{ ['--s' as string]: 0 }}>
        <path pathLength={1} d="M150.1 40.2 A78 78 0 1 0 150.1 159.8" />
        <path pathLength={1} className="thin" d="M142.4 49.4 A66 66 0 1 0 142.4 150.6" />
      </g>
      <g style={{ ['--s' as string]: 1 }}>{/* Barbell */}
        <path pathLength={1} d="M30 100 H170" />
        <rect pathLength={1} x={40} y={82} width={8} height={36} rx={2} />
        <rect pathLength={1} x={50} y={88} width={6} height={24} rx={2} />
        <rect pathLength={1} x={152} y={82} width={8} height={36} rx={2} />
        <rect pathLength={1} x={144} y={88} width={6} height={24} rx={2} />
      </g>
      <g style={{ ['--s' as string]: 2 }}>{/* The runner */}
        <circle pathLength={1} cx={121} cy={58} r={8} />
        <path pathLength={1} d="M114 70 L100 98" />
        <path pathLength={1} d="M112 75 L127 82 L135 72" />
        <path pathLength={1} d="M111 75 L95 73 L86 84" />
        <path pathLength={1} d="M100 98 L116 110 L111 128" />
        <path pathLength={1} d="M100 98 L85 112 L71 108" />
      </g>
      <g style={{ ['--s' as string]: 3 }}>{/* Pixels leaving the C */}
        {[[156, 30, 7], [168, 22, 5], [166, 38, 5], [178, 32, 4], [180, 16, 3], [172, 46, 3]].map(([x, y, s]) => (
          <rect pathLength={1} key={`${x}${y}`} x={x} y={y} width={s} height={s} rx={1} />
        ))}
      </g>
      {/* The heartbeat: the one violet line, a monitor's trace. */}
      <path pathLength={1} className="pd-beat" d="M58 146 H104 L110 136 L116 156 L121 140 L125 148 L129 146 H146" />
      <path pathLength={1} className="pd-beat-run" d="M58 146 H104 L110 136 L116 156 L121 140 L125 148 L129 146 H146" />
    </svg>
  );
}

export default function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const refuse = (msg: string) => { setError(msg); setBusy(false); setShake((n) => n + 1); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) return refuse(signInError.message);
    if (!(await isPlatformAdmin())) {
      await supabase.auth.signOut();
      return refuse('That account does not run Core Fitness. Gym owners use the admin app.');
    }
    setBusy(false);
    onSignedIn();
  };

  return (
    <div className="pd">
      <header className="pd-edge">
        <span className="pd-brand"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M21 6.5 A10.5 10.5 0 1 0 21 21.5" /><path d="M5 14 H23" /></svg> Core Fitness <span className="pd-tag">Platform</span></span>
        <span className="pd-quiet">This computer only</span>
      </header>

      <main className="pd-main">
        <div className="pd-stack">
          <div className="pd-sys" aria-hidden="true">
            {ORBITS.map((o, i) => (
              <div key={o.r} className={`pd-orbit o${i}`} style={{ ['--r' as string]: `${o.r}px`, ['--dur' as string]: `${o.dur}s`, ['--i' as string]: i } as CSSProperties}>
                <span className="pd-ring" />
                {o.planets.map((p, k) => (
                  <span key={p.name} className="pd-planet" style={{ ['--a' as string]: `${p.a}deg`, ['--k' as string]: k } as CSSProperties}>
                    <i /><b>{p.name}</b>
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="pd-markbox"><Mark /></div>
        <div className="pd-col">
          <p className="pd-hello">{greeting()}</p>
          <h1>Run Core Fitness</h1>
          <p className="pd-sub">The platform owner’s account. Every gym on the service, in one place.</p>
          <form key={shake} className={`pd-form${shake ? ' shake' : ''}`} onSubmit={submit} noValidate>
            <div className="pd-field">
              <label htmlFor="pd-email">Email</label>
              <input id="pd-email" className="pd-input" type="email" autoComplete="username" value={email} required
                onChange={(e) => setEmail(e.target.value)} aria-describedby="pd-msg" />
            </div>
            <div className="pd-field">
              <label htmlFor="pd-password">Password</label>
              <div className="pd-pw">
                <input id="pd-password" className="pd-input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} required
                  onChange={(e) => setPassword(e.target.value)} aria-describedby="pd-msg"
                  onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))} onBlur={() => setCaps(false)} />
                <button type="button" className="pd-show" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <p id="pd-msg" className={`pd-msg${error ? ' err' : ''}`} aria-live="polite">{error ?? (caps ? 'Caps Lock is on.' : '')}</p>
            <button className="pd-btn" type="submit" disabled={busy}>
              {busy && <span className="pd-spin" aria-hidden="true" />}{busy ? 'Signing in' : 'Sign in'}
            </button>
          </form>
        </div>
        </div>
      </main>

      <footer className="pd-foot">
        Gym owners and their front desk sign in to the <a href={ADMIN}>admin app</a>.
      </footer>
    </div>
  );
}
