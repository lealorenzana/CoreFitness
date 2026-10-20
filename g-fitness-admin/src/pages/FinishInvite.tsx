import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, LogOut, Monitor } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { clearGymContext } from '../lib/gymContext';
import { clearAdminCaches } from '../lib/adminCaches';

interface Mine {
  gym_id: string; gym_name: string; logo_url: string | null;
  role: 'member' | 'trainer' | 'staff';
  state: 'waiting' | 'accepted' | 'revoked' | 'expired' | 'gym_unavailable';
  first_name: string | null; last_name: string | null; phone: string | null; email: string;
}

/**
 * A front-desk login's first sign-in (0202, the owner's design). The owner
 * invited them from Invitations; the email had a one-time password. Here they
 * choose their own and confirm their name — `complete_invitation()` is the
 * acceptance, and they land on the dashboard and in Settings → Staff accounts.
 * A coach's or member's login belongs to the phone app and is sent there.
 */
export default function FinishInvite() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [mine, setMine] = useState<Mine | null | undefined>(undefined);
  const [mustChange, setMustChange] = useState(false);
  const [f, setF] = useState({ first: '', last: '', phone: '', password: '', confirm: '' });
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/admin/login', { replace: true }); return; }
      setMustChange(session.user.user_metadata?.must_change_password === true);
      const { data } = await supabase.rpc('my_invitation', { p_token: token });
      const row = (Array.isArray(data) ? data[0] : null) as Mine | null;
      setMine(row);
      if (row) setF((x) => ({ ...x, first: row.first_name ?? '', last: row.last_name ?? '', phone: row.phone ?? '' }));
    })();
  }, [token, navigate]);

  const signOut = async () => { await supabase.auth.signOut(); clearGymContext(); clearAdminCaches(); navigate('/admin/login', { replace: true }); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.first.trim() || !f.last.trim()) { setError('Please enter your first and last name.'); return; }
    if (mustChange && f.password.length < 8) { setError('Choose a password of at least 8 characters.'); return; }
    if (mustChange && f.password !== f.confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    setError(null);
    try {
      if (mustChange) {
        const { error: pwError } = await supabase.auth.updateUser({ password: f.password, data: { must_change_password: false } });
        if (pwError) throw new Error(pwError.message);
        setMustChange(false);
      }
      const { error: rpcError } = await supabase.rpc('complete_invitation', {
        p_token: token, p_first: f.first.trim(), p_last: f.last.trim(), p_phone: f.phone.trim() || null,
      });
      if (rpcError) throw new Error(rpcError.message);
      // The metadata changed on the server; without a refresh the gate would still see "invite pending".
      await supabase.auth.refreshSession();
      clearGymContext();
      clearAdminCaches();
      window.location.assign('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
      setBusy(false);
    }
  };

  const input = 'w-full h-12 rounded-xl px-4 text-[15px] text-white outline-none';
  const inputSt = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' };
  const label = 'block text-[13px] font-semibold mb-1.5';
  const muted = { color: 'var(--color-text-secondary)' };

  const shell = (body: React.ReactNode) => (
    <div className="min-h-screen grid place-items-center p-6" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-[460px] rounded-2xl p-7" data-finish-invite
        style={{ background: 'var(--color-surface)', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 40px 120px -40px rgba(124,58,237,0.55)' }}>
        {body}
      </div>
    </div>
  );

  if (mine === undefined) return shell(<p className="text-sm" style={muted}>Opening your invitation…</p>);
  if (mine === null) {
    return shell(<>
      <h1 className="text-xl font-semibold text-white">This invitation is for another email</h1>
      <p className="mt-2 text-sm" style={muted}>Sign out, then sign in with the email address the gym sent the login to.</p>
      <button type="button" onClick={() => void signOut()} className="mt-5 w-full h-12 rounded-xl font-semibold text-white" style={{ background: '#7C3AED' }}>Sign out</button>
    </>);
  }
  if (mine.state !== 'waiting') {
    return shell(<>
      <h1 className="text-xl font-semibold text-white">{mine.state === 'accepted' ? 'Already done' : 'This invitation no longer works'}</h1>
      <p className="mt-2 text-sm" style={muted}>
        {mine.state === 'revoked' ? `${mine.gym_name} withdrew it. Ask the owner for a new one.`
          : mine.state === 'expired' ? `It has expired. Ask ${mine.gym_name}'s owner to send another.`
            : mine.state === 'accepted' ? `You have already joined ${mine.gym_name}.` : `${mine.gym_name} is not active at the moment.`}
      </p>
      <button type="button" onClick={() => void (mine.state === 'accepted' ? window.location.assign('/admin/dashboard') : signOut())}
        className="mt-5 w-full h-12 rounded-xl font-semibold text-white" style={{ background: '#7C3AED' }}>{mine.state === 'accepted' ? 'Continue' : 'Sign out'}</button>
    </>);
  }
  if (mine.role !== 'staff') {
    return shell(<>
      <h1 className="text-xl font-semibold text-white">This login is for the phone app</h1>
      <p className="mt-2 text-sm" style={muted}>{mine.gym_name} invited you as {mine.role === 'trainer' ? 'a coach' : 'a member'}. Sign in to the Core Fitness app on your phone with the same email and password.</p>
      <a href={`https://corefitness-gym.vercel.app/login${mine.role === 'trainer' ? '?as=trainer' : ''}`} className="mt-5 w-full h-12 rounded-xl font-semibold text-white grid place-items-center" style={{ background: '#7C3AED' }}>Open the app</a>
      <button type="button" onClick={() => void signOut()} className="mt-2 w-full h-10 text-sm" style={muted}>Sign out</button>
    </>);
  }

  return shell(
    <form onSubmit={(e) => void submit(e)} noValidate>
      <div className="flex items-center gap-3">
        {mine.logo_url
          ? <img src={mine.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
          : <span className="h-12 w-12 rounded-xl grid place-items-center text-lg font-bold text-white" style={{ background: '#7C3AED' }}>{mine.gym_name.slice(0, 1)}</span>}
        <div>
          <h1 className="text-[20px] font-semibold text-white leading-tight">Welcome to {mine.gym_name}</h1>
          <p className="text-[13px] flex items-center gap-1.5" style={muted}><Monitor size={13} /> Front desk · the gym’s dashboard</p>
        </div>
      </div>
      <p className="mt-4 text-[13.5px]" style={muted}>Confirm your name{mustChange ? ' and choose your own password' : ''}. The owner decides which parts of the desk you use.</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <label><span className={label} style={muted}>First name</span><input className={input} style={inputSt} value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} autoComplete="given-name" /></label>
        <label><span className={label} style={muted}>Last name</span><input className={input} style={inputSt} value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} autoComplete="family-name" /></label>
      </div>
      <label className="block mt-3"><span className={label} style={muted}>Mobile (optional)</span>
        <input className={input} style={inputSt} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="0917 123 4567" autoComplete="tel" /></label>

      {mustChange && (
        <div className="mt-5 rounded-xl p-4" style={{ background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(139,92,246,0.3)' }}>
          <p className="text-[13px] font-semibold text-white flex items-center gap-2"><KeyRound size={14} /> Your password</p>
          <p className="text-[12.5px] mt-0.5" style={muted}>The one in the email worked once. Choose your own for {mine.email}.</p>
          <div className="relative mt-3">
            <input className={input} style={{ ...inputSt, paddingRight: 46 }} type={shown ? 'text' : 'password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="New password (8 or more)" autoComplete="new-password" aria-label="New password" />
            <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} className="absolute right-0 top-0 h-12 w-12 grid place-items-center" style={muted}>{shown ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          <input className={`${input} mt-2`} style={inputSt} type={shown ? 'text' : 'password'} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} placeholder="Type it again" autoComplete="new-password" aria-label="Confirm password" />
        </div>
      )}

      {error && <p className="mt-3 text-[13px]" style={{ color: '#FBBF24' }} role="alert">{error}</p>}
      <button type="submit" disabled={busy} className="mt-5 w-full h-12 rounded-xl font-semibold text-white disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#7C3AED,#6D28D9)' }}>
        {busy ? 'Joining…' : `Join ${mine.gym_name}`}
      </button>
      <button type="button" onClick={() => void signOut()} className="mt-2 w-full h-10 text-[13px] inline-flex items-center justify-center gap-1.5" style={muted}><LogOut size={13} /> Not you? Sign out</button>
    </form>,
  );
}
