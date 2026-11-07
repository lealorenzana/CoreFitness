import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Dumbbell, Gift, Monitor, Plus, Send, Upload, UserRound } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { inviteAccount, importInvites, parseList, type ImportResult, type InviteOutcome } from '../../lib/api/invitations';
import { myLogin, suggestUsername, usernameShape } from '../../lib/api/logins';
import LoginSlip from '../../components/LoginSlip';
import EarningRules from '../../components/rewards/EarningRules';
import { showToast } from '../../utils/toast';
import { tick, saved } from './sounds';

/*
 * The build studio's new steps (owner, 2026-11-07: "all things should be included
 * there to fully complete their gym"). Each one writes through the same calls
 * its own page uses, saves as it goes, and is optional — every one is also on
 * its own page afterwards.
 */

// ── Your team ──────────────────────────────────────────────────────────────────
export function TeamStep() {
  const [role, setRole] = useState<'trainer' | 'staff'>('trainer');
  const [f, setF] = useState({ first: '', last: '', email: '', username: '' });
  const [usernamesOn, setUsernamesOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slip, setSlip] = useState<(InviteOutcome & { name: string; role: 'trainer' | 'staff' }) | null>(null);
  const [added, setAdded] = useState<{ name: string; role: 'trainer' | 'staff' }[]>([]);
  useEffect(() => { void myLogin().then((l) => setUsernamesOn(l !== null)); }, []);

  const send = async () => {
    if (!f.first.trim()) { showToast('Their first name, please.', 'error'); return; }
    if (!f.email.trim() && !f.username.trim()) { showToast(usernamesOn ? 'Give an email or a username — they sign in with it.' : 'Their email, please — they sign in with it.', 'error'); return; }
    const shape = usernameShape(f.username);
    if (shape) { showToast(`Username: ${shape}`, 'error'); return; }
    setBusy(true);
    try {
      const out = await inviteAccount({ email: f.email.trim(), username: f.username.trim() || null, role, firstName: f.first.trim(), lastName: f.last.trim() });
      const name = `${f.first.trim()} ${f.last.trim()}`.trim();
      setSlip({ ...out, name, role });
      setAdded((a) => [...a, { name, role }]);
      setF({ first: '', last: '', email: '', username: '' });
      saved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be sent', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-studio-team>
      <div className="grid gap-3 sm:grid-cols-2">
        {([['trainer', UserRound, 'A coach', 'Runs 1-on-1s and packages from the phone app'], ['staff', Monitor, 'Front desk', 'Payments and check-ins on this dashboard']] as const).map(([k, I, t, d]) => (
          <button key={k} type="button" className={`ob-choice ${role === k ? 'on' : ''}`} aria-pressed={role === k} onClick={() => { tick(); setRole(k); }}>
            <span className="ob-tick">{role === k && <Check size={13} />}</span>
            <span className="min-w-0"><span className="flex items-center gap-2 font-extrabold" style={{ color: 'var(--ob-ink)' }}><I size={16} />{t}</span>
              <span className="block text-[12.5px] mt-1" style={{ color: 'var(--ob-sub)' }}>{d}</span></span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="ob-field"><span>First name</span><input className="ob-in" value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} /></label>
        <label className="ob-field"><span>Last name</span><input className="ob-in" value={f.last}
          onChange={(e) => setF({ ...f, last: e.target.value })}
          onBlur={() => { if (usernamesOn && !f.username && (f.first || f.last)) setF((x) => ({ ...x, username: suggestUsername(x.first, x.last) })); }} /></label>
        <label className="ob-field"><span>Email</span><input className="ob-in" type="email" value={f.email} placeholder="name@example.com" onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        {usernamesOn && (
          <label className="ob-field"><span>Username {f.email.trim() ? '(optional)' : ''}</span>
            <input className="ob-in" value={f.username} autoCapitalize="off" spellCheck={false} placeholder="e.g. coach.rae"
              onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s+/g, '') })} /></label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="ob-btn go" disabled={busy} onClick={() => void send()} data-team-send>
          <Send size={16} />{busy ? 'Sending…' : role === 'trainer' ? 'Add this coach' : 'Add this desk account'}
        </button>
        <p className="ob-hint" style={{ margin: 0 }}>They get a login slip to print or hand over — the email goes too, when there is one.</p>
      </div>
      {added.length > 0 && (
        <div className="flex flex-wrap gap-2" data-team-added>
          {added.map((x, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12.5px] font-bold"
              style={{ background: 'var(--ob-raised)', border: '1px solid var(--ob-line)', color: 'var(--ob-ink)', animation: 'ob-pop .35s' }}>
              <Check size={13} style={{ color: 'var(--ob-fill-2)' }} />{x.name} · {x.role === 'trainer' ? 'coach' : 'desk'}
            </span>
          ))}
        </div>
      )}
      {slip && <LoginSlip name={slip.name} role={slip.role} username={slip.username ?? null} email={slip.email ?? null} password={slip.password}
        emailed={slip.emailed} existing={slip.existing} onClose={() => setSlip(null)} />}
    </div>
  );
}

// ── Equipment ──────────────────────────────────────────────────────────────────
const CATS: [string, string][] = [['cardio', 'Cardio'], ['machines', 'Machines'], ['free_weights', 'Free weights'], ['benches_racks', 'Benches and racks'], ['functional', 'Functional'], ['other', 'Other']];
const IDEAS: [string, string][] = [['Treadmill', 'cardio'], ['Spin bike', 'cardio'], ['Squat rack', 'benches_racks'], ['Adjustable bench', 'benches_racks'],
  ['Dumbbells', 'free_weights'], ['Olympic barbell', 'free_weights'], ['Leg press', 'machines'], ['Cable machine', 'machines'], ['Battle ropes', 'functional'], ['Kettlebells', 'functional']];

export function EquipmentStep() {
  const [items, setItems] = useState<{ id: string; name: string; category: string; quantity: number }[] | null>(null);
  const [f, setF] = useState({ name: '', category: 'machines', quantity: '1' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from('gym_equipment').select('id, name, category, quantity').order('created_at', { ascending: false }).limit(40);
    setItems((data ?? []) as { id: string; name: string; category: string; quantity: number }[]);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  const add = async (name = f.name, category = f.category, quantity = Number(f.quantity) || 1) => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('gym_equipment').insert({ name: name.trim(), category, quantity: Math.max(1, quantity) }).select('id');
    setBusy(false);
    if (error) { showToast(error.message, 'error'); return; }
    saved();
    setF({ name: '', category, quantity: '1' });
    await load();
  };
  const have = new Set((items ?? []).map((i) => i.name.toLowerCase()));
  return (
    <div className="space-y-4" data-studio-equipment>
      <div>
        <p className="ob-field"><span>Tap to add what you have</span></p>
        <div className="flex flex-wrap gap-2">
          {IDEAS.map(([n, c]) => {
            const on = have.has(n.toLowerCase());
            return (
              <button key={n} type="button" disabled={busy || on} onClick={() => { tick(); void add(n, c, 1); }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-bold transition-transform hover:-translate-y-0.5 disabled:hover:translate-y-0"
                style={on ? { background: 'var(--ob-fill)', color: '#fff', border: '1px solid transparent' } : { background: 'var(--ob-raised)', color: 'var(--ob-ink)', border: '1px solid var(--ob-line)' }}>
                {on ? <Check size={13} /> : <Plus size={13} />}{n}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_100px_auto] items-end">
        <label className="ob-field"><span>Or type one</span><input className="ob-in" value={f.name} placeholder="Hack squat" onChange={(e) => setF({ ...f, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void add(); } }} /></label>
        <label className="ob-field"><span>Kind</span>
          <select className="ob-in" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="ob-field"><span>How many</span><input className="ob-in" type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></label>
        <button type="button" className="ob-btn go" disabled={busy || !f.name.trim()} onClick={() => void add()}><Plus size={16} />Add</button>
      </div>
      <div className="ob-hosted" data-equipment-list>
        <p className="text-[12.5px] font-bold" style={{ color: 'var(--ob-sub)' }}><Dumbbell size={13} className="inline mr-1.5" />On your floor · {items?.length ?? 0}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(items ?? []).map((i) => (
            <span key={i.id} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-semibold" style={{ background: 'var(--color-bg)', border: '1px solid var(--ob-line)', color: 'var(--ob-ink)' }}>
              {i.name}{i.quantity > 1 && <b style={{ color: 'var(--ob-sub)' }}>×{i.quantity}</b>}
            </span>
          ))}
          {items?.length === 0 && <span className="ob-hint" style={{ margin: 0 }}>Nothing yet — members see where each machine is, and report what is broken.</span>}
        </div>
      </div>
    </div>
  );
}

// ── Points and rewards ─────────────────────────────────────────────────────────
export function RewardsStep({ pointsName }: { pointsName: string }) {
  const [rewards, setRewards] = useState<{ id: string; name: string; cost_points: number }[] | null>(null);
  const [f, setF] = useState({ name: '', cost: '' });
  const word = pointsName.trim() || 'points';
  const load = useCallback(async () => {
    const { data } = await supabase.from('rewards').select('id, name, cost_points').eq('is_active', true).order('cost_points');
    setRewards((data ?? []) as { id: string; name: string; cost_points: number }[]);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  const add = async () => {
    const cost = Number(f.cost);
    if (!f.name.trim() || !Number.isInteger(cost) || cost <= 0) { showToast(`A name and a whole number of ${word} above 0.`, 'error'); return; }
    const { error } = await supabase.from('rewards').insert({ name: f.name.trim(), cost_points: cost }).select('id');
    if (error) { showToast(error.message, 'error'); return; }
    saved(); setF({ name: '', cost: '' }); await load();
  };
  return (
    <div className="space-y-5" data-studio-rewards>
      <div className="ob-hosted">
        <p className="text-[13px] font-extrabold flex items-center gap-2" style={{ color: 'var(--ob-ink)' }}><Gift size={15} />What members can spend their {word} on</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(rewards ?? []).map((r) => (
            <span key={r.id} className="inline-flex items-center gap-2 rounded-xl px-3 h-9 text-[12.5px] font-bold" style={{ background: 'var(--color-bg)', border: '1px solid var(--ob-line)', color: 'var(--ob-ink)' }}>
              {r.name}<span style={{ color: 'var(--ob-fill-2)' }}>{r.cost_points.toLocaleString('en-PH')}</span>
            </span>
          ))}
          {rewards?.length === 0 && <span className="ob-hint" style={{ margin: 0 }}>None yet — a free shake or a guest pass is a good first one.</span>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] items-end">
          <label className="ob-field"><span>Reward</span><input className="ob-in" value={f.name} placeholder="Free protein shake" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="ob-field"><span>Costs ({word})</span><input className="ob-in" type="number" min={1} value={f.cost} placeholder="150" onChange={(e) => setF({ ...f, cost: e.target.value })} /></label>
          <button type="button" className="ob-btn go" onClick={() => void add()} disabled={!f.name.trim() || !f.cost}><Plus size={16} />Add</button>
        </div>
      </div>
      <div className="ob-hosted att"><p className="text-[13px] font-extrabold mb-3" style={{ color: 'var(--ob-ink)' }}>How members earn {word}</p><EarningRules /></div>
    </div>
  );
}

// ── Members you already have ───────────────────────────────────────────────────
export function MembersStep({ slug, joinCode }: { slug: string; joinCode: string | null }) {
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const link = slug ? `https://corefitness-gym.vercel.app/join/${slug}` : null;
  const rows = paste.trim() ? parseList(paste) : [];
  const usable = rows.filter((r) => !r.problem);
  const run = async () => {
    setBusy({ done: 0, total: usable.length });
    const r = await importInvites(rows, 'member', (done, total) => setBusy({ done, total }));
    setBusy(null); setResult(r); setPaste('');
    if (r.invited.length) saved();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]" data-studio-members>
      <div className="ob-hosted text-center">
        {link ? <>
          <div className="mx-auto rounded-xl bg-white p-2.5 inline-block"><QRCodeSVG value={link} size={150} level="M" /></div>
          <p className="mt-2 text-[12px] font-bold break-all" style={{ color: 'var(--ob-ink)' }}>{link.replace('https://', '')}</p>
          {joinCode && <p className="mt-1 text-[12px]" style={{ color: 'var(--ob-sub)' }}>Code <b style={{ letterSpacing: '0.14em', color: 'var(--ob-ink)' }}>{joinCode}</b></p>}
          <p className="ob-hint">Print it at the desk, post it in your group chat.</p>
        </> : <p className="ob-hint">Your join link appears once you choose it in the next chapter.</p>}
      </div>
      <div>
        <label className="ob-field"><span>Bring in the members you already have — one per line: email, first name, last name, mobile</span>
          <textarea className="ob-in" style={{ height: 150, padding: 12, resize: 'vertical' }} value={paste} onChange={(e) => { setPaste(e.target.value); setResult(null); }}
            placeholder={'maria.santos@gmail.com, Maria, Santos, 09171234567\njuan.delacruz@gmail.com, Juan, Dela Cruz'} /></label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="ob-btn go" disabled={!usable.length || !!busy} onClick={() => void run()} data-members-import>
            <Upload size={16} />{busy ? `Inviting ${busy.done} of ${busy.total}…` : usable.length ? `Invite ${usable.length}` : 'Invite them'}
          </button>
          {rows.length > usable.length && <span className="ob-hint" style={{ margin: 0 }}>{rows.length - usable.length} line{rows.length - usable.length === 1 ? '' : 's'} can't be used (no email).</span>}
        </div>
        {result && (
          <p className="ob-hint" data-members-result style={{ color: 'var(--ob-ink)' }}>
            {result.invited.length} invited — each gets their own login by email.{result.failed.length ? ` ${result.failed.length} could not be: ${result.failed.slice(0, 2).map((x) => `${x.email} (${x.reason})`).join('; ')}.` : ''}
            {' '}The rest of the list, and login slips for anyone without email, are on Invitations.
          </p>
        )}
      </div>
    </div>
  );
}
