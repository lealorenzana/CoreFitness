import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Check, KeyRound, X } from 'lucide-react';
import { ChipPick, StepField } from '../ui/StepModal';
import { STEP_INPUT, STEP_INPUT_STYLE } from '../ui/stepStyles';
import PlacePicker from '../ui/PlacePicker';
import DatePicker from '../ui/DatePicker';
import { createMember, isEmailTaken, isPhoneTaken, updateMemberProfile } from '../../lib/api/members';
import { formatCheckInCode } from '../../utils/checkInCode';
import { showToast } from '../../utils/toast';
import { myLogin, suggestUsername, usernameAvailable, usernameShape, USERNAME_HINT } from '../../lib/api/logins';
import LoginSlip from '../LoginSlip';
import type { MembershipPlanRow } from '../../types/db';

/** The four parts, each with the mascot that keeps the desk company there and the one line it says. */
const PARTS = [
  { title: 'Who they are', art: '/images/admin-art/mascot-bag.webp', say: 'Start with their name. The rest helps, but it can wait.' },
  { title: 'Their login', art: '/mockup-art/phone-journey-mascot.webp', say: 'They sign in to the phone app with this. The password is made for them.' },
  { title: 'Training and safety', art: '/images/admin-art/mascot-kettlebell.webp', say: 'Ask who to call if something happens. It is the one blank that matters.' },
  { title: 'Membership', art: '/images/admin-art/mascot-coin.webp', say: 'Pick a plan. It starts when you record their first payment.' },
];
const DONE_ART = '/images/admin-art/mascot-clipboard.webp';
const GENDERS = [{ value: '', label: 'Not said' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }];
const LEVELS = [{ value: '', label: 'Not said' }, { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }];
const RELATIONS = ['Parent', 'Spouse', 'Partner', 'Sibling', 'Child', 'Friend', 'Other'];

type Done = { id: string; name: string; email: string | null; username: string | null; password: string | null; code: string | null; planName: string | null };

/**
 * People → Members → Add member. Since 2026-11-27 (owner) one floating page: the four parts on one scrolling form,
 * a side panel in the gym's colour listing them (it marks where you are and what is filled) with a mascot per part,
 * and one Add member button. The login you hand them is an email and/or a username; the one-time password is made
 * for them and shown on the login slip (0236: the desk never types a password). Known answers are chips, never
 * typed. It ends on what to do next: the first payment is what activates a plan.
 */
export default function AddMemberWizard({ plans, onClose, onCreated }: {
  plans: MembershipPlanRow[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Done | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [here, setHere] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const parts = useRef<(HTMLElement | null)[]>([]);
  /** Usernames exist once 0236 is in the database; before it the field stays hidden. */
  const [usernamesOn, setUsernamesOn] = useState(false);
  useEffect(() => { void myLogin().then((l) => setUsernamesOn(l !== null)); }, []);
  const sellable = plans.filter((p) => p.is_active);
  const [f, setF] = useState({
    firstName: '', lastName: '', phone: '', email: '', username: '', dateOfBirth: '', gender: '', address: '',
    experienceLevel: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelationship: '',
    planId: sellable[0]?.id ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

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
    // At the very bottom the last part is the one in view, however short it is.
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) i = PARTS.length - 1;
    setHere(i);
  };
  const goTo = (i: number) => parts.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const filled = [
    !!f.firstName.trim() && !!f.lastName.trim(),
    !!f.email.trim() || !!f.username.trim(),
    !!f.experienceLevel || !!f.emergencyContactName.trim(),
    true,
  ];
  const ready = filled[0] && filled[1];

  /** Every check the steps used to make one at a time, at once; the form scrolls to the first part with a problem. */
  const check = async (): Promise<number | null> => {
    const e: Record<string, string> = {};
    if (!f.firstName.trim()) e.firstName = 'Required.';
    if (!f.lastName.trim()) e.lastName = 'Required.';
    if (f.phone.trim() && await isPhoneTaken(f.phone)) e.phone = 'Another account already uses this number.';
    const em = f.email.trim();
    if (!em && !f.username.trim()) e.email = usernamesOn ? 'Give an email or a username: they sign in with it.' : 'They sign in with this: type a real address.';
    else if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) e.email = 'That is not an email address.';
    else if (em && await isEmailTaken(em)) e.email = 'This email already has an account. Search for them under Members instead.';
    if (f.username.trim()) {
      const why = usernameShape(f.username) ?? await usernameAvailable(f.username).catch(() => null);
      if (why) e.username = why;
    }
    setErrors(e);
    if (e.firstName || e.lastName || e.phone) return 0;
    if (e.email || e.username) return 1;
    return null;
  };

  const create = async () => {
    setBusy(true);
    try {
      const bad = await check();
      if (bad !== null) { goTo(bad); return; }
      const created = await createMember({
        email: f.email.trim(), username: f.username.trim() || undefined, firstName: f.firstName.trim(), lastName: f.lastName.trim(),
        phone: f.phone.trim() || undefined, address: f.address.trim() || undefined,
        dateOfBirth: f.dateOfBirth || undefined, gender: f.gender || undefined,
        emergencyContactName: f.emergencyContactName.trim() || undefined, emergencyContactPhone: f.emergencyContactPhone.trim() || undefined,
        emergencyContactRelationship: f.emergencyContactRelationship || undefined,
        experienceLevel: f.experienceLevel || undefined, planId: f.planId || undefined,
      });
      // Written again from here: an Edge Function deployed before it learned
      // these two would accept and ignore them (see Members' old form).
      if (f.dateOfBirth || f.gender) {
        await updateMemberProfile(created.id, { date_of_birth: f.dateOfBirth || null, gender: f.gender || null }).catch(() => undefined);
      }
      setDone({ id: created.id, name: `${f.firstName.trim()} ${f.lastName.trim()}`, email: created.email ?? null,
        username: created.username ?? null, password: created.password ?? null,
        code: created.id, planName: sellable.find((p) => p.id === f.planId)?.name ?? null });
      setSlipOpen(true);
      await onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add the member', 'error');
    } finally {
      setBusy(false);
    }
  };

  const plan = sellable.find((p) => p.id === f.planId);
  const art = done ? DONE_ART : PARTS[here].art;
  const say = done ? `${done.name.split(' ')[0]} is in. Their login slip is ready to print or hand over.` : PARTS[here].say;

  return createPortal((
    <div className="am-root" role="dialog" aria-modal="true" aria-label={done ? `${done.name} is in` : 'Add a member'} data-add-member>
      <div className="am-scrim" onClick={onClose} />
      <div className="am-win">
        {/* The side panel, in the gym's own colour: the parts, then the mascot for the part in view. */}
        <aside className="am-side">
          <div>
            <h2>{done ? `${done.name} is in` : 'Add a member'}</h2>
            <p>{done ? 'Their account is ready.' : 'A walk-in at the desk. They get a real login for the phone app.'}</p>
          </div>
          {!done && (
            <ol className="am-parts" aria-label="Sections">
              {PARTS.map((p, i) => (
                <li key={p.title}>
                  <button type="button" onClick={() => goTo(i)} aria-current={here === i ? 'step' : undefined} className={here === i ? 'on' : ''}>
                    <span className={`n ${filled[i] && i < 3 ? 'ok' : ''}`}>{filled[i] && i < 3 ? <Check size={12} /> : i + 1}</span>
                    {p.title}
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="am-buddy" aria-hidden>
            <p key={say} className="am-say">{say}</p>
            <img key={art} src={art} alt="" />
          </div>
        </aside>

        <section className="am-main">
          <button type="button" aria-label="Close" onClick={onClose} className="am-x"><X size={16} /></button>
          {done ? (
            <div className="am-form am-done">
              <div className="flex items-center gap-3">
                <Check size={18} className="flex-none" style={{ color: 'var(--color-primary)' }} />
                <p className="text-[14px] text-white">Their account is ready{done.code ? <>. Check-in code <b className="tabular-nums">{formatCheckInCode(done.code)}</b></> : ''}.</p>
              </div>
              <div>
                <h3>Hand them their login</h3>
                <p className="am-hint">A one-time password was made for them. At their first sign-in they choose their own password{usernamesOn ? ', a username and a photo' : ''}.</p>
                <button type="button" className="am-btn mt-2" onClick={() => setSlipOpen(true)} data-show-slip><KeyRound size={13} /> Show the login slip</button>
              </div>
              <div>
                <h3>Next</h3>
                <ul className="am-hint list-disc pl-4 space-y-1">
                  {done.planName ? <li>{done.planName} is waiting for its first payment. Recording it starts the membership.</li> : <li>No plan yet. Add one when they pay.</li>}
                  <li>If your gym asks for the waiver and health questions, they answer them in the app before they book.</li>
                </ul>
              </div>
              <div className="flex gap-2 pt-1">
                {done.planName && <button type="button" className="am-btn go" onClick={() => navigate(`/payments?record=${done.id}`)}>Record their first payment</button>}
                <button type="button" className="am-btn" onClick={onClose}>Done</button>
              </div>
            </div>
          ) : (
            <div ref={scroller} className="am-form" onScroll={onScroll}>
              <section ref={(el) => { parts.current[0] = el; }} className="am-part" aria-labelledby="am-p0">
                <h3 id="am-p0"><span>1</span>Who they are</h3>
                <div className="grid grid-cols-2 gap-3">
                  <StepField label="First name" error={errors.firstName}>
                    <input autoFocus value={f.firstName} onChange={(e) => set('firstName', e.target.value)} aria-label="First name" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
                  </StepField>
                  <StepField label="Last name" error={errors.lastName}>
                    {/* A first suggestion for the username, from their name; the desk can change or clear it. */}
                    <input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} aria-label="Last name" className={STEP_INPUT} style={STEP_INPUT_STYLE}
                      onBlur={() => { if (usernamesOn && !f.username && f.firstName.trim() && f.lastName.trim()) set('username', suggestUsername(f.firstName, f.lastName)); }} />
                  </StepField>
                </div>
                <StepField label="Mobile number" hint="For reminders and when the desk needs to reach them." error={errors.phone}>
                  <input value={f.phone} inputMode="tel" placeholder="0917 123 4567" onChange={(e) => set('phone', e.target.value)} aria-label="Mobile number" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
                </StepField>
                <div className="grid grid-cols-2 gap-3">
                  <StepField label="Birthday">
                    <DatePicker mode="birth" value={f.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} startView="year" placeholder="Pick a date" />
                  </StepField>
                  <StepField label="Gender">
                    <ChipPick ariaLabel="Gender" value={f.gender} options={GENDERS} onChange={(v) => set('gender', v)} />
                  </StepField>
                </div>
                <StepField label="Where they live">
                  <PlacePicker value={f.address} onChange={(v) => set('address', v)} />
                </StepField>
              </section>

              <section ref={(el) => { parts.current[1] = el; }} className="am-part" aria-labelledby="am-p1">
                <h3 id="am-p1"><span>2</span>Their login</h3>
                <StepField label={usernamesOn ? 'Email (optional with a username)' : 'Email'} hint="They sign in to the app with this, and receipts and notices go here." error={errors.email}>
                  <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} aria-label="Email" placeholder="name@email.com" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
                </StepField>
                {usernamesOn && (
                  <StepField label={f.email.trim() ? 'Username (optional)' : 'Username'} hint={`${USERNAME_HINT}. They sign in with their email or this; with no email, this is their only login.`} error={errors.username}>
                    <input value={f.username} onChange={(e) => set('username', e.target.value.toLowerCase().replace(/\s+/g, ''))} aria-label="Username" placeholder="e.g. mariasantos"
                      autoCapitalize="off" spellCheck={false} className={`${STEP_INPUT} font-mono`} style={STEP_INPUT_STYLE} data-add-username />
                  </StepField>
                )}
                <p className="am-note"><KeyRound size={14} className="flex-none mt-0.5" />
                  A one-time password is made for them and shown on a login slip to print or hand over. At their first sign-in they choose their own.</p>
              </section>

              <section ref={(el) => { parts.current[2] = el; }} className="am-part" aria-labelledby="am-p2">
                <h3 id="am-p2"><span>3</span>Training and safety</h3>
                <StepField label="How much have they trained?" hint="What they say about themselves. It shapes class suggestions, not their earned level.">
                  <ChipPick ariaLabel="Experience" value={f.experienceLevel} options={LEVELS} onChange={(v) => set('experienceLevel', v)} />
                </StepField>
                <div className="space-y-2.5">
                  <div><p className="text-[13px] font-medium text-white">Emergency contact</p>
                    <p className="am-hint mt-0.5">Optional, and the one blank that matters in a room full of heavy things.</p></div>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={f.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} aria-label="Emergency contact name" placeholder="Name" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
                    <input value={f.emergencyContactPhone} inputMode="tel" onChange={(e) => set('emergencyContactPhone', e.target.value)} aria-label="Emergency contact phone" placeholder="Mobile number" className={STEP_INPUT} style={STEP_INPUT_STYLE} />
                  </div>
                  <ChipPick ariaLabel="Relationship" value={f.emergencyContactRelationship}
                    options={RELATIONS.map((r) => ({ value: r, label: r }))} onChange={(v) => set('emergencyContactRelationship', v)} />
                </div>
              </section>

              <section ref={(el) => { parts.current[3] = el; }} className="am-part" aria-labelledby="am-p3">
                <h3 id="am-p3"><span>4</span>Membership</h3>
                <StepField label="Which plan?" hint="It waits for the first payment. Recording the cash is what starts it.">
                  <div className="am-plans" role="radiogroup" aria-label="Plan">
                    {sellable.map((p) => (
                      <button key={p.id} type="button" onClick={() => set('planId', p.id)} role="radio" aria-checked={f.planId === p.id} className={f.planId === p.id ? 'on' : ''}>
                        <span className="flex-1 min-w-0"><b>{p.name}</b><small>{p.duration_days == null ? 'No expiry' : `${p.duration_days} days`}</small></span>
                        <span className="price">{Number(p.price) > 0 ? `₱${Number(p.price).toLocaleString('en-PH')}` : 'Free'}</span>
                      </button>
                    ))}
                    <button type="button" onClick={() => set('planId', '')} role="radio" aria-checked={!f.planId} className={!f.planId ? 'on' : ''}>
                      <span className="flex-1"><b>No plan yet</b><small>Add one when they pay</small></span>
                    </button>
                  </div>
                </StepField>
              </section>
            </div>
          )}

          {!done && (
            <footer className="am-foot">
              <span className="am-sum">
                {ready ? <><b>{f.firstName.trim()} {f.lastName.trim()}</b> · {plan ? plan.name : 'no plan yet'}</> : 'A name and a login (email or username) are all it needs.'}
              </span>
              <button type="button" className="am-btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="am-btn go" onClick={() => void create()} disabled={!ready || busy} data-step-next>{busy ? 'Adding' : 'Add member'}</button>
            </footer>
          )}
        </section>
      </div>
      {slipOpen && done && (
        <LoginSlip name={done.name} role="member" username={done.username} email={done.email} password={done.password}
          emailed={null} onClose={() => setSlipOpen(false)} />
      )}
    </div>
  ), document.body);
}
