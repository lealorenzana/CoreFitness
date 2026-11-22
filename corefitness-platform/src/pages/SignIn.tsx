import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { supabase } from '../lib/supabaseClient';
import { isPlatformAdmin } from '../lib/platform';
import './door.css';

/**
 * The door (2026-11-22). Signing in is not the same as being let in: an account that is not in
 * `platform_admins` is signed straight back out, and told plainly, rather than landing on empty screens.
 *
 * The look is the gym sign-in's quiet column (fields, one amber action) set in a galaxy (owner, 2026-11-22): a seeded
 * starfield and nebulae in the logo's own colours (violet, magenta, amber), with the Core Fitness logo as the sun.
 * The opening shot follows "Eclipse" (the owner's earlier pick): the sun ignites large in the middle of the dark with a
 * shock ring, then settles above the form as three tilted orbits open around the whole sign-in, carrying the
 * platform's pages, the inner ones the pages used most.
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

/** A seeded starfield: the same sky every visit, drawn as box-shadows on one dot per layer (no canvas, no images). */
function sky(n: number, seed: number, tint: number) {
  let a = seed;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = rnd() < tint ? (rnd() < .5 ? '255 196 120' : '196 170 255') : '255 255 255';
    out.push(`${(rnd() * 100).toFixed(2)}vw ${(rnd() * 100).toFixed(2)}vh rgb(${c} / ${(.35 + rnd() * .65).toFixed(2)})`);
  }
  return out.join(',');
}
const STARS = [sky(260, 7, .12), sky(90, 21, .3), sky(28, 43, .5)];

export default function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  /** Mouse parallax: the pointer's place as two CSS numbers (-1 to 1) on the page; each layer moves by its own depth in CSS.
   *  No React state per move. Off on touch screens and with reduced motion. */
  const room = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = room.current;
    if (!el || !matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--mx', ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
        el.style.setProperty('--my', ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
      });
    };
    const rest = () => { el.style.setProperty('--mx', '0'); el.style.setProperty('--my', '0'); };
    window.addEventListener('pointermove', move);
    document.addEventListener('pointerleave', rest);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', rest); };
  }, []);

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
    <div className="pd" ref={room}>
      <div className="pd-space" aria-hidden="true">
        <span className="pd-neb n1" /><span className="pd-neb n2" /><span className="pd-neb n3" /><span className="pd-band" />
        {STARS.map((sh, i) => <i key={i} className={`pd-stars l${i}`} style={{ boxShadow: sh }} />)}
      </div>
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
          <div className="pd-markbox">
            <span className="pd-corona" />
            <span className="pd-wave" />
            <img className="pd-sun" src="/core-fitness-logo.png" alt="" width={600} height={600} />
          </div>
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
