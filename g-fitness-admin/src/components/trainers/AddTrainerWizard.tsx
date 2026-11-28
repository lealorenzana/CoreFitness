import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, KeyRound, ShieldCheck, X } from 'lucide-react';
import GymMascot from '../ui/GymMascot';
import { StepField } from '../ui/StepModal';
import { STEP_INPUT, STEP_INPUT_STYLE } from '../ui/stepStyles';
import { createTrainer, updateTrainerProfile } from '../../lib/api/trainers';
import { isEmailTaken, isPhoneTaken } from '../../lib/api/members';
import { showToast } from '../../utils/toast';
import { myLogin, suggestUsername, usernameAvailable, usernameShape, USERNAME_HINT } from '../../lib/api/logins';
import LoginSlip from '../LoginSlip';
import { CoachSection, DaysSection, WhoSection } from './TrainerFields';
import { certsOf, draftErrors, emptyDraft, yearsOf, type TrainerDraft } from './trainerDraft';

/** The four parts, each with the mascot that keeps the desk company there and the one line it says. */
const PARTS = [
  { title: 'Who they are', art: '/images/admin-art/mascot-bag.webp', say: 'Start with their name. The rest helps members pick them.' },
  { title: 'What they coach', art: '/images/admin-art/mascot-kettlebell.webp', say: 'Pick what they coach, so Find your coach can match them.' },
  { title: 'When they coach', art: '/images/admin-art/mascot-stopwatch.webp', say: 'The days they usually coach. Their bookable hours come later.' },
  { title: 'Their login', art: '/mockup-art/phone-journey-mascot.webp', say: 'They sign in to the phone app with this. The password is made for them.' },
];
const DONE_ART = '/images/admin-art/mascot-clipboard.webp';

/**
 * People → Trainers → Add trainer. Since 2026-11-28 (owner: "like Add a member, no steps, just a scroll") one
 * floating page: the four parts down one form, a side panel in the gym's colour listing them (it marks where you are
 * and what is filled) with a mascot per part. The fields are TrainerFields, the very sections Edit shows, so adding
 * and editing ask the same things. Everything is checked on Add, and the form scrolls to the first part to fix.
 * Certifications typed here are the coach's own words; the verified mark comes only from a certificate the coach
 * uploads and the owner checks under Credentials, and the done screen says so.
 */
export default function AddTrainerWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ name: string; email: string | null; username: string | null; password: string | null } | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [d, setD] = useState<TrainerDraft>(emptyDraft);
  // 0236: no typed password — a one-time one is made and shown on the login slip.
  const [login, setLogin] = useState({ email: '', username: '' });
  const [usernamesOn, setUsernamesOn] = useState(false);
  const [here, setHere] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const parts = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => { void myLogin().then((l) => setUsernamesOn(l !== null)); }, []);
  const set = <K extends keyof TrainerDraft>(k: K, v: TrainerDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !slipOpen) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, slipOpen]);

  /** The part being read: the last one whose top has passed the top of the form. */
  const onScroll = () => {
    const box = scroller.current; if (!box) return;
    const top = box.getBoundingClientRect().top + 90;
    let i = 0;
    parts.current.forEach((el, k) => { if (el && el.getBoundingClientRect().top <= top) i = k; });
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) i = PARTS.length - 1;
    // Reaching the login, a first suggestion for the username from their name; the owner can change or clear it.
    if (i === 3 && usernamesOn && !login.username && d.firstName.trim()) setLogin((l) => ({ ...l, username: suggestUsername(d.firstName, d.lastName) }));
    setHere(i);
  };
  const goTo = (i: number) => parts.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const filled = [
    !!d.firstName.trim() && !!d.lastName.trim(),
    !!d.specialization.trim(),
    d.days.length > 0,
    !!login.email.trim() || !!login.username.trim(),
  ];
  const ready = filled[0] && filled[1] && filled[3];

  /** Every check the steps used to make, all at once; the part of the first problem is where the form goes. */
  const check = async (): Promise<number | null> => {
    const e: Record<string, string> = { ...draftErrors(d, 0), ...draftErrors(d, 1) };
    if (!e.phone && d.phone.trim() && await isPhoneTaken(d.phone)) e.phone = 'Another account already uses this number.';
    const em = login.email.trim();
    if (!em && !login.username.trim()) e.email = usernamesOn ? 'Give an email or a username. They sign in with it.' : 'They sign in with this.';
    else if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) e.email = 'That is not an email address.';
    else if (em && await isEmailTaken(em)) e.email = 'This email already has an account.';
    if (login.username.trim()) {
      const why = usernameShape(login.username) ?? await usernameAvailable(login.username).catch(() => null);
      if (why) e.username = why;
    }
    setErrors(e);
    const keys = Object.keys(e);
    if (!keys.length) return null;
    const who = ['firstName', 'lastName', 'phone', 'years'];
    return keys.some((k) => who.includes(k)) ? 0 : keys.some((k) => k === 'email' || k === 'username') && keys.every((k) => k === 'email' || k === 'username') ? 3 : 1;
  };

  const create = async () => {
    setBusy(true);
    try {
      const bad = await check();
      if (bad !== null) { goTo(bad); return; }
      const created = await createTrainer({
        email: login.email.trim(), username: login.username.trim() || undefined, firstName: d.firstName.trim(), lastName: d.lastName.trim(),
        phone: d.phone.trim() || undefined, specialization: d.specialization.trim(), bio: d.bio.trim() || undefined,
        availability: d.days.join(', ') || undefined,
      });
      // The function takes the basics; the rest is the profile row's own columns.
      const certifications = certsOf(d);
      if (d.years || d.focus.length || certifications.length || d.achievements.trim()) {
        await updateTrainerProfile(created.id, {
          years_experience: yearsOf(d),
          focus_areas: d.focus.length ? d.focus : null,
          certifications: certifications.length ? certifications : null,
          achievements: d.achievements.trim() || null,
        }).catch(() => showToast('They were added, but their coaching details did not save. Add them with Edit.', 'error'));
      }
      setDone({ name: `${d.firstName.trim()} ${d.lastName.trim()}`, email: created.email ?? null, username: created.username ?? null, password: created.password ?? null });
      setSlipOpen(true);
      await onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add the trainer', 'error');
    } finally {
      setBusy(false);
    }
  };

  const art = done ? DONE_ART : PARTS[here].art;
  const say = done ? `${done.name.split(' ')[0]} is on the team. Their login slip is ready to hand over.` : PARTS[here].say;

  return createPortal((
    <div className="am-root" role="dialog" aria-modal="true" aria-label={done ? `${done.name} is on the team` : 'Add a trainer'} data-add-trainer>
      <div className="am-scrim" onClick={onClose} />
      <div className="am-win">
        <aside className="am-side">
          <div>
            <h2>{done ? `${done.name} is on the team` : 'Add a trainer'}</h2>
            <p>{done ? 'Their coach account is ready.' : 'A coach account for the app. They run classes, sessions and rooms from their phone.'}</p>
          </div>
          {!done && (
            <ol className="am-parts" aria-label="Sections">
              {PARTS.map((p, i) => (
                <li key={p.title}>
                  <button type="button" onClick={() => goTo(i)} aria-current={here === i ? 'step' : undefined} className={here === i ? 'on' : ''}>
                    <span className={`n ${filled[i] ? 'ok' : ''}`}>{filled[i] ? <Check size={12} /> : i + 1}</span>
                    {p.title}
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="am-buddy" aria-hidden>
            <p key={say} className="am-say">{say}</p>
            <GymMascot key={art} src={art} />
          </div>
        </aside>

        <section className="am-main">
          <button type="button" aria-label="Close" onClick={onClose} className="am-x"><X size={16} /></button>
          {done ? (
            <div className="am-form am-done">
              <div className="flex items-center gap-3">
                <Check size={18} className="flex-none" style={{ color: 'var(--color-primary)' }} />
                <p className="text-[14px]" style={{ color: 'var(--color-text-primary)' }}>Their coach account is ready.</p>
              </div>
              <div>
                <h3>Hand them their login</h3>
                <p className="am-hint">A one-time password was made for them. At their first sign-in they choose their own.</p>
                <button type="button" className="am-btn mt-2" onClick={() => setSlipOpen(true)} data-show-slip><KeyRound size={13} /> Show the login slip</button>
              </div>
              <div className="am-note">
                <ShieldCheck size={15} className="flex-none mt-0.5" />
                <span>For the verified mark on their profile, they upload each certificate in the app (Profile → Edit profile → Certificates) and you check it under Trainers → Credentials. Until then members read their certifications as the coach&rsquo;s own words.</span>
              </div>
              <div className="flex gap-2 pt-1"><button type="button" className="am-btn" onClick={onClose}>Done</button></div>
            </div>
          ) : (
            <div ref={scroller} className="am-form" onScroll={onScroll}>
              <section ref={(el) => { parts.current[0] = el; }} className="am-part" aria-labelledby="at-p0">
                <h3 id="at-p0"><span>1</span>Who they are</h3>
                <WhoSection d={d} set={set} errors={errors} autoFocus />
              </section>
              <section ref={(el) => { parts.current[1] = el; }} className="am-part" aria-labelledby="at-p1">
                <h3 id="at-p1"><span>2</span>What they coach</h3>
                <CoachSection d={d} set={set} errors={errors} />
              </section>
              <section ref={(el) => { parts.current[2] = el; }} className="am-part" aria-labelledby="at-p2">
                <h3 id="at-p2"><span>3</span>When they coach</h3>
                <DaysSection d={d} set={set} />
              </section>
              <section ref={(el) => { parts.current[3] = el; }} className="am-part" aria-labelledby="at-p3">
                <h3 id="at-p3"><span>4</span>Their login</h3>
                <StepField label={usernamesOn ? 'Email (optional with a username)' : 'Email'} hint="They sign in with this, choosing Trainer on the sign-in screen." error={errors.email}>
                  <input type="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} aria-label="Email" placeholder="coach@email.com" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
                </StepField>
                {usernamesOn && (
                  <StepField label={login.email.trim() ? 'Username (optional)' : 'Username'} hint={`${USERNAME_HINT}. They sign in with their email or this.`} error={errors.username}>
                    <input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value.toLowerCase().replace(/\s+/g, '') })} aria-label="Username"
                      placeholder={d.firstName.trim() ? suggestUsername(d.firstName, d.lastName) : 'e.g. coach.rae'} autoCapitalize="off" spellCheck={false} className={`${STEP_INPUT} font-mono`} style={STEP_INPUT_STYLE} />
                  </StepField>
                )}
                <p className="am-note"><KeyRound size={14} className="flex-none mt-0.5" />
                  <span>A one-time password is made for them and shown on a login slip. At their first sign-in they choose their own. Or invite them from Invitations to have it emailed.</span></p>
              </section>
            </div>
          )}

          {!done && (
            <footer className="am-foot">
              <span className="am-sum">
                {ready ? <><b>{d.firstName.trim()} {d.lastName.trim()}</b> · {d.specialization.trim()}</> : 'A name, what they coach and a login are all it needs.'}
              </span>
              <button type="button" className="am-btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="am-btn go" onClick={() => void create()} disabled={!ready || busy} data-step-next>{busy ? 'Adding' : 'Add trainer'}</button>
            </footer>
          )}
        </section>
      </div>
      {slipOpen && done && (
        <LoginSlip name={done.name} role="trainer" username={done.username} email={done.email} password={done.password}
          emailed={null} onClose={() => setSlipOpen(false)} />
      )}
    </div>
  ), document.body);
}
