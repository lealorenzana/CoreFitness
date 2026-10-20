import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { clearGymContext } from '../lib/gymContext';
import { clearGymApp } from '../lib/gymApp';
import { NocButton, Eyebrow } from '../components/ui/noc';
import { Field, TextInput, TextArea, FieldError } from '../components/ui/Field';
import BirthDateField from '../components/ui/BirthDateField';
import { PasswordInput, PasswordStrength } from '../components/auth/PasswordFields';
import { ageFrom, birthDateProblem, GENDER_OPTIONS, PHONE_RE } from '../utils/profileRules';
import { TERMS_VERSION, PRIVACY_VERSION } from '../lib/legalVersions';
import { logout } from '../utils/auth';

interface Mine {
  gym_id: string; gym_name: string; logo_url: string | null;
  role: 'member' | 'trainer' | 'staff';
  state: 'waiting' | 'accepted' | 'revoked' | 'expired' | 'gym_unavailable';
  first_name: string | null; last_name: string | null; phone: string | null; email: string;
}

const YEARS = [
  { v: '0', l: 'Under 1' }, { v: '1', l: '1' }, { v: '2', l: '2' }, { v: '3', l: '3' }, { v: '5', l: '5' },
  { v: '8', l: '8' }, { v: '10', l: '10+' },
];

/**
 * The first sign-in of an invited account (0202, the owner's design): the gym
 * emailed a login; before the app or its onboarding, they choose their own
 * password and fill the form for what they were invited as — the member's is
 * the sign-up's (name, birth date, emergency contact, the Terms), a coach's is
 * what they coach. `complete_invitation()` saves it and is the acceptance; a
 * withdrawn or expired invitation is said plainly and gives nothing.
 *
 * A front-desk login belongs to the dashboard, not this app — sent there.
 */
export default function FinishInvite({ token }: { token: string }) {
  const [mine, setMine] = useState<Mine | null | undefined>(undefined);
  const [mustChange, setMustChange] = useState(false);
  const [f, setF] = useState({
    first: '', last: '', phone: '', password: '', confirm: '',
    dob: '', gender: '', guardian: '', address: '', eName: '', ePhone: '', eRel: '',
    specialty: '', years: '', bio: '', agree: false,
  });
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMustChange(user?.user_metadata?.must_change_password === true);
      const { data } = await supabase.rpc('my_invitation', { p_token: token });
      const row = (Array.isArray(data) ? data[0] : null) as Mine | null;
      setMine(row);
      if (row) setF((x) => ({ ...x, first: row.first_name ?? '', last: row.last_name ?? '', phone: row.phone ?? '' }));
    })();
  }, [token]);

  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const age = ageFrom(f.dob);
  const minor = age != null && age < 18;

  const problem = (): string | null => {
    if (!f.first.trim() || !f.last.trim()) return 'Please enter your first and last name.';
    if (f.phone.trim() && !PHONE_RE.test(f.phone.trim())) return 'That phone number does not look right.';
    if (mine?.role === 'member') {
      if (!f.dob) return 'Please enter your date of birth.';
      const dobProblem = birthDateProblem(f.dob);
      if (dobProblem) return dobProblem;
      if (!f.gender) return 'Please choose an option for gender.';
      if (minor && !f.guardian.trim()) return 'Under 18: a parent or guardian’s name is needed.';
    }
    if (mine?.role === 'trainer' && !f.specialty.trim()) return 'Please say what you coach.';
    // Last, as on the form: the first problem said is the first one on the screen.
    if (mustChange) {
      if (f.password.length < 8) return 'Choose a password of at least 8 characters.';
      if (f.password !== f.confirm) return 'The two passwords do not match.';
    }
    if (mine?.role === 'member' && !f.agree) return 'Please agree to the Terms and the Privacy Policy.';
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = problem();
    if (p) { setError(p); return; }
    setBusy(true);
    setError(null);
    try {
      // The password first: if the form then fails, they can fix it and retry
      // without the one-time password, which no longer works.
      if (mustChange) {
        const { error: pwError } = await supabase.auth.updateUser({ password: f.password, data: { must_change_password: false } });
        if (pwError) throw new Error(pwError.message);
        setMustChange(false);
      }
      const { error: rpcError } = await supabase.rpc('complete_invitation', {
        p_token: token, p_first: f.first.trim(), p_last: f.last.trim(), p_phone: f.phone.trim() || null,
        ...(mine?.role === 'member' ? {
          p_dob: f.dob, p_gender: f.gender, p_guardian: minor ? f.guardian.trim() : null, p_address: f.address.trim() || null,
          p_emergency_name: f.eName.trim() || null, p_emergency_phone: f.ePhone.trim() || null, p_emergency_relationship: f.eRel.trim() || null,
          p_terms_version: TERMS_VERSION, p_privacy_version: PRIVACY_VERSION,
        } : {}),
        ...(mine?.role === 'trainer' ? { p_specialization: f.specialty.trim(), p_years: f.years === '' ? null : Number(f.years), p_bio: f.bio.trim() || null } : {}),
      });
      if (rpcError) throw new Error(rpcError.message);
      // The account's metadata changed on the server: refresh the session, or
      // the first-sign-in gate would still read the old "invite pending".
      await supabase.auth.refreshSession();
      clearGymContext();
      clearGymApp();
      localStorage.setItem('isLoggedIn', 'true');
      if (mine?.role === 'trainer') {
        localStorage.setItem('trainerMode', 'true');
        window.location.assign('/trainer/home');
      } else {
        localStorage.removeItem('trainerMode');
        window.location.assign('/onboarding');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
      setBusy(false);
    }
  };

  const muted = { color: 'var(--color-text-muted)' };

  if (mine === undefined) return <p className="text-sm" style={muted}>Opening your invitation…</p>;
  if (mine === null) {
    return (
      <div className="space-y-4 text-center" data-finish-invite-wrong>
        <h2 className="text-lg font-semibold text-white">This invitation is for another email</h2>
        <p className="text-sm" style={muted}>Sign out, then sign in with the email address the gym sent the login to.</p>
        <NocButton className="w-full" onClick={() => void logout().then(() => window.location.assign('/login'))}>Sign out</NocButton>
      </div>
    );
  }
  if (mine.state !== 'waiting') {
    const text = mine.state === 'revoked' ? `${mine.gym_name} withdrew this invitation. Ask them for a new one.`
      : mine.state === 'expired' ? `This invitation has expired. Ask ${mine.gym_name} to send another.`
        : mine.state === 'accepted' ? `You have already joined ${mine.gym_name}.`
          : `${mine.gym_name} is not taking sign-ups at the moment.`;
    return (
      <div className="space-y-4 text-center" data-finish-invite-closed>
        <h2 className="text-lg font-semibold text-white">{mine.state === 'accepted' ? 'Already done' : 'This invitation no longer works'}</h2>
        <p className="text-sm" style={muted}>{text}</p>
        <NocButton className="w-full" onClick={() => window.location.assign(mine.state === 'accepted' ? '/login' : '/join')}>
          {mine.state === 'accepted' ? 'Continue' : 'Find a gym instead'}</NocButton>
      </div>
    );
  }
  if (mine.role === 'staff') {
    return (
      <div className="space-y-4 text-center" data-finish-invite-staff>
        <h2 className="text-lg font-semibold text-white">This is a front-desk login</h2>
        <p className="text-sm" style={muted}>{mine.gym_name} invited you to their dashboard, not this app. Sign in there with the same email and password — on a computer is best.</p>
        <NocButton className="w-full" onClick={() => window.location.assign('https://corefitness-admin.vercel.app/admin/login')}>Open the dashboard</NocButton>
      </div>
    );
  }

  const what = mine.role === 'member' ? 'a member' : 'a coach';
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5 pb-6" data-finish-invite noValidate>
      <div className="text-center">
        {mine.logo_url
          ? <img src={mine.logo_url} alt="" className="mx-auto h-14 w-14 rounded-2xl object-cover" />
          : <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-xl font-bold text-white" style={{ background: 'var(--color-primary)' }}>{mine.gym_name.slice(0, 1)}</div>}
        <h1 className="mt-3 text-xl font-semibold text-white">Welcome to {mine.gym_name}</h1>
        <p className="mt-1 text-sm" style={muted}>You were invited as {what}. A few details and you are in — no waiting to be approved.</p>
      </div>

      <section className="space-y-3">
        <Eyebrow>You</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><TextInput value={f.first} onChange={(e) => set('first', e.target.value)} autoComplete="given-name" /></Field>
          <Field label="Last name"><TextInput value={f.last} onChange={(e) => set('last', e.target.value)} autoComplete="family-name" /></Field>
        </div>
        <Field label="Mobile number" hint="Optional — how the gym reaches you.">
          <TextInput type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0917 123 4567" autoComplete="tel" />
        </Field>
        {mine.role === 'member' && (
          <>
            <BirthDateField value={f.dob} onChange={(v) => set('dob', v)} label="Date of birth" />
            <Field label="Gender" as="div">
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {GENDER_OPTIONS.map((g) => (
                  <button key={g.value} type="button" aria-pressed={f.gender === g.value} onClick={() => set('gender', g.value)}
                    className="h-11 rounded-xl text-[13px] font-semibold"
                    style={f.gender === g.value ? { background: 'rgba(124,58,237,0.22)', border: '1px solid rgba(139,92,246,0.7)', color: '#EDE9FE' }
                      : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-text-secondary)' }}>{g.label}</button>
                ))}
              </div>
            </Field>
            {minor && <Field label="Parent or guardian’s name" hint="Under 18, a parent or guardian agrees for you."><TextInput value={f.guardian} onChange={(e) => set('guardian', e.target.value)} /></Field>}
          </>
        )}
      </section>

      {mine.role === 'member' && (
        <section className="space-y-3">
          <Eyebrow>Safety</Eyebrow>
          <p className="text-xs" style={muted}>If something happens while you train, this is who the gym contacts. Optional, but worth it.</p>
          <Field label="Emergency contact name"><TextInput value={f.eName} onChange={(e) => set('eName', e.target.value)} placeholder="Maria Dela Cruz" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Their phone"><TextInput type="tel" inputMode="tel" value={f.ePhone} onChange={(e) => set('ePhone', e.target.value)} placeholder="0917 …" /></Field>
            <Field label="Relationship"><TextInput value={f.eRel} onChange={(e) => set('eRel', e.target.value)} placeholder="Mother, friend…" /></Field>
          </div>
          <Field label="Home address" hint="Optional."><TextInput value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Barangay, town" autoComplete="street-address" /></Field>
        </section>
      )}

      {mine.role === 'trainer' && (
        <section className="space-y-3">
          <Eyebrow>Your coaching</Eyebrow>
          <Field label="What you coach" hint="Members see this as your headline."><TextInput value={f.specialty} onChange={(e) => set('specialty', e.target.value)} placeholder="Strength and conditioning" /></Field>
          <Field label="Years coaching" as="div">
            <div className="mt-1.5 flex flex-wrap gap-2">
              {YEARS.map((y) => (
                <button key={y.v} type="button" aria-pressed={f.years === y.v} onClick={() => set('years', f.years === y.v ? '' : y.v)}
                  className="h-10 min-w-[48px] px-3 rounded-xl text-[13px] font-semibold"
                  style={f.years === y.v ? { background: 'rgba(124,58,237,0.22)', border: '1px solid rgba(139,92,246,0.7)', color: '#EDE9FE' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-text-secondary)' }}>{y.l}</button>
              ))}
              <TextInput type="number" min={0} max={70} value={f.years} onChange={(e) => set('years', e.target.value)} aria-label="Years coaching, exact" placeholder="Other" style={{ width: 84 }} />
            </div>
          </Field>
          <Field label="About you" hint="Optional — members read this on your profile."><TextArea rows={3} value={f.bio} onChange={(e) => set('bio', e.target.value)} placeholder="Who you coach best, and how." /></Field>
        </section>
      )}

      {mustChange && (
        <section className="space-y-3">
          <Eyebrow>Your password</Eyebrow>
          <p className="text-xs" style={muted}>The one in the email worked once. Choose your own for {mine.email}.</p>
          <PasswordInput value={f.password} onChange={(v) => set('password', v)} shown={shown} onToggle={() => setShown((s) => !s)} placeholder="New password" autoComplete="new-password" label="New password" />
          <PasswordStrength password={f.password} />
          <PasswordInput value={f.confirm} onChange={(v) => set('confirm', v)} shown={shown} onToggle={() => setShown((s) => !s)} placeholder="Type it again" autoComplete="new-password" label="Confirm password" />
        </section>
      )}

      {mine.role === 'member' && (
        <label className="flex items-start gap-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <input type="checkbox" checked={f.agree} onChange={(e) => set('agree', e.target.checked)} className="mt-1 h-4 w-4 accent-violet-500" />
          <span>I agree to the gym’s <a href="/terms" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary-300)' }}>Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary-300)' }}>Privacy Policy</a>.</span>
        </label>
      )}

      {error && <FieldError>{error}</FieldError>}
      <NocButton type="submit" className="w-full" disabled={busy}>{busy ? 'Joining…' : `Join ${mine.gym_name}`}</NocButton>
      <button type="button" className="w-full text-center text-xs" style={muted} onClick={() => void logout().then(() => window.location.assign('/login'))}>Not you? Sign out</button>
    </form>
  );
}
