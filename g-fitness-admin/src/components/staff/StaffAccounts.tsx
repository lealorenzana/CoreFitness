import { useCallback, useEffect, useState } from 'react';
import { Archive, Check, Copy, Eye, EyeOff, RefreshCw, ShieldCheck, UserCheck, UserPlus, UserX } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import StepModal, { StepField } from '../ui/StepModal';
import { STEP_INPUT, STEP_INPUT_STYLE } from '../ui/stepStyles';
import { createStaffAccount } from '../../lib/api/settings';
import { isEmailTaken } from '../../lib/api/members';
import { listStaffPermissions, setStaffPermissions, STAFF_AREAS, type StaffArea } from '../../lib/api/staffPermissions';
import { showToast } from '../../utils/toast';
import type { ProfileRow, ProfileStatus } from '../../types/db';

const MUTED = 'var(--color-text-secondary)';
const PANEL = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };
const ALL = STAFF_AREAS.map((a) => a.key);

function readablePassword(): string {
  const words = ['Desk', 'Front', 'Core', 'Steady', 'Swift', 'Clear', 'Bright', 'Ready'];
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${words[r[0] % words.length]}-${String(1000 + (r[1] % 9000))}-${words[r[2] % words.length].toLowerCase()}`;
}

/** The areas as tick boxes with what each one lets them do. */
function AreaPicker({ value, onChange }: { value: StaffArea[]; onChange: (v: StaffArea[]) => void }) {
  return (
    <div className="grid gap-1.5">
      {STAFF_AREAS.map((a) => {
        const on = value.includes(a.key);
        return (
          <label key={a.key} className="flex items-start gap-2.5 rounded-lg px-3 py-2 cursor-pointer"
            style={{ background: on ? 'var(--color-primary-light)' : 'var(--color-surface-high)', border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
            <input type="checkbox" className="mt-0.5" checked={on} aria-label={a.label}
              onChange={() => onChange(on ? value.filter((x) => x !== a.key) : [...value, a.key])} />
            <span>
              <span className="block text-xs font-semibold text-white">{a.label}</span>
              <span className="block text-[11px]" style={{ color: MUTED }}>{a.what}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Settings → Staff accounts (2026-10-04; permissions are 0161). Each account
 * says plainly whether it can sign in and what it may do at the desk; the
 * owner changes either in place. Adding someone is three steps and ends on
 * their login to hand over. Suspend and archive keep going through the page's
 * own confirmation, which asks for the reason.
 */
export default function StaffAccounts({ accounts, meId, onStatus, onChanged }: {
  accounts: ProfileRow[];
  meId: string | null;
  onStatus: (account: ProfileRow, next: ProfileStatus) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [perms, setPerms] = useState<Map<string, StaffArea[]> | null | undefined>(undefined);
  const [editing, setEditing] = useState<{ id: string; areas: StaffArea[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => { setPerms(await listStaffPermissions()); }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const save = async (id: string, areas: StaffArea[] | null) => {
    setBusy(true);
    try {
      await setStaffPermissions(id, areas && areas.length === ALL.length ? null : areas);
      showToast(areas === null || areas.length === ALL.length ? 'Back to the whole front desk' : 'Saved — the database holds them to it from now on', 'success');
      setEditing(null);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally { setBusy(false); }
  };

  const owners = accounts.filter((a) => a.role === 'admin');
  const staff = accounts.filter((a) => a.role !== 'admin');

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5 space-y-3" style={PANEL}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-white">Front-desk staff</h2>
            <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>
              Each account does only what you tick. The database enforces it, so a hidden button is never the only lock.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><UserPlus size={14} /> Add staff</Button>
        </div>

        {staff.length === 0 ? (
          <p className="text-xs py-4" style={{ color: MUTED }}>No front-desk accounts yet. Add one for whoever runs the counter.</p>
        ) : staff.map((a) => {
          const areas = perms?.get(a.id) ?? null;
          const whole = areas === null;
          const live = a.status === 'active';
          return (
            <div key={a.id} className="rounded-xl p-3 space-y-2.5" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <Avatar name={`${a.first_name} ${a.last_name}`} photoUrl={a.photo_url} size={34} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{a.first_name} {a.last_name}</p>
                  <p className="text-[11px] truncate" style={{ color: MUTED }}>{a.email}</p>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={live ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)' } : { background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                  {live ? 'Can sign in' : a.status === 'suspended' ? 'Suspended — cannot sign in' : a.status.replace('_', ' ')}
                </span>
                {a.id !== meId && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onStatus(a, a.status === 'suspended' ? 'active' : 'suspended')}>
                      {a.status === 'suspended' ? <><UserCheck size={12} /> Let them sign in again</> : <><UserX size={12} /> Suspend</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onStatus(a, 'archived')}><Archive size={12} /> Archive</Button>
                  </div>
                )}
              </div>

              {perms === null ? (
                <p className="text-[11px]" style={{ color: MUTED }}>Choosing what each account may do needs migration 0161, which is not live yet. Until then every staff account has the whole desk.</p>
              ) : editing?.id === a.id ? (
                <div className="space-y-2">
                  <AreaPicker value={editing.areas} onChange={(v) => setEditing({ id: a.id, areas: v })} />
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" disabled={busy || editing.areas.length === 0} onClick={() => void save(a.id, editing.areas)}><Check size={12} /> Save</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(a.id, null)}>Whole front desk</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                  {editing.areas.length === 0 && <p className="text-[11px]" style={{ color: 'var(--color-secondary)' }}>Tick at least one — or suspend the account if they should do nothing.</p>}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ShieldCheck size={13} style={{ color: 'var(--color-primary)' }} />
                  {whole ? <span className="text-[11px] text-white">The whole front desk</span>
                    : areas!.map((k) => <span key={k} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-surface-high)', color: '#fff' }}>{STAFF_AREAS.find((x) => x.key === k)?.label ?? k}</span>)}
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: a.id, areas: areas ?? [...ALL] })}>Change</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl p-5 space-y-2" style={PANEL}>
        <h2 className="text-sm font-bold text-white">Owners</h2>
        <p className="text-[11px]" style={{ color: MUTED }}>Owners can do everything, including pricing, coaches, settings and these permissions.</p>
        {owners.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <Avatar name={`${a.first_name} ${a.last_name}`} photoUrl={a.photo_url} size={30} />
            <p className="flex-1 min-w-0 text-xs font-semibold text-white truncate">{a.first_name} {a.last_name}{a.id === meId ? <span className="font-normal" style={{ color: MUTED }}> (you)</span> : null}</p>
            <span className="text-[11px]" style={{ color: MUTED }}>{a.email}</span>
          </div>
        ))}
      </div>

      {adding && <AddStaffWizard onClose={() => setAdding(false)} onCreated={async () => { await onChanged(); await load(); }} permsLive={perms !== null} />}
    </div>
  );
}

function AddStaffWizard({ onClose, onCreated, permsLive }: { onClose: () => void; onCreated: () => Promise<void>; permsLive: boolean }) {
  const STEPS = permsLive ? ['Who they are', 'Their login', 'What they may do'] : ['Who they are', 'Their login'];
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<{ name: string; email: string; password: string } | null>(null);
  const [f, setF] = useState({ firstName: '', lastName: '', phone: '', email: '', password: readablePassword(), areas: [...ALL] as StaffArea[] });

  const next = async () => {
    setErr(null);
    if (step === 1) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { setErr('They sign in with this — type a real address.'); return; }
      if (await isEmailTaken(f.email)) { setErr('This email already has an account.'); return; }
      if (f.password.length < 8) { setErr('At least 8 characters.'); return; }
    }
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    setBusy(true);
    try {
      const created = await createStaffAccount({ firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, password: f.password });
      if (permsLive && f.areas.length < ALL.length) {
        await setStaffPermissions(created.id, f.areas).catch(() => showToast('They were added with the whole desk — set what they may do from the list.', 'error'));
      }
      setDone({ name: `${f.firstName.trim()} ${f.lastName.trim()}`, email: f.email.trim(), password: f.password });
      await onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add them');
    } finally { setBusy(false); }
  };

  if (done) {
    const login = `Your Core Fitness front-desk login\nEmail: ${done.email}\nPassword: ${done.password}\nSign in: https://corefitness-admin.vercel.app`;
    return (
      <StepModal title={`${done.name} can sign in`} steps={STEPS} step={0} onStep={() => undefined} canNext={false} onNext={() => undefined}
        onBack={() => undefined} onClose={onClose} finishLabel="" hideNav>
        <pre className="text-xs rounded-lg p-3 whitespace-pre-wrap" style={{ background: 'var(--color-surface-high)', color: MUTED }}>{login}</pre>
        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(login).then(() => setCopied(true))}><Copy size={13} /> {copied ? 'Copied' : 'Copy to send them'}</Button>
        <Button variant="secondary" className="w-full" onClick={onClose}>Done</Button>
      </StepModal>
    );
  }

  const ready = step === 0 ? !!f.firstName.trim() && !!f.lastName.trim() : step === 1 ? !!f.email.trim() && f.password.length >= 8 : f.areas.length > 0;
  return (
    <StepModal title="Add front-desk staff" subtitle="A login for the dashboard — only the parts of the desk you choose"
      steps={STEPS} step={step} onStep={setStep} canNext={ready} onNext={() => void next()} onBack={() => setStep(step - 1)}
      onClose={onClose} finishLabel="Add staff" busy={busy}>
      {step === 0 && (<>
        <div className="grid grid-cols-2 gap-3">
          <StepField label="First name"><input autoFocus value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} aria-label="First name" className={STEP_INPUT} style={STEP_INPUT_STYLE} /></StepField>
          <StepField label="Last name"><input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} aria-label="Last name" className={STEP_INPUT} style={STEP_INPUT_STYLE} /></StepField>
        </div>
        <StepField label="Mobile number (optional)"><input value={f.phone} inputMode="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} aria-label="Mobile number" placeholder="0917 123 4567" className={STEP_INPUT} style={STEP_INPUT_STYLE} /></StepField>
      </>)}
      {step === 1 && (<>
        <StepField label="Email" hint="They sign in to this dashboard with it."><input autoFocus type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Email" className={STEP_INPUT} style={STEP_INPUT_STYLE} /></StepField>
        <StepField label="Password" hint="Made for you — shown again at the end to hand over.">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input type={showPw ? 'text' : 'password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-label="Password" className={`${STEP_INPUT} pr-9 font-mono`} style={STEP_INPUT_STYLE} />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 p-1" style={{ color: MUTED }}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button variant="ghost" onClick={() => setF({ ...f, password: readablePassword() })}><RefreshCw size={13} /> New one</Button>
          </div>
        </StepField>
      </>)}
      {step === 2 && (
        <StepField label="What may they do?" hint="Everything is ticked — untick what this person should not touch. Pricing, coaches, settings and these permissions are always the owner's.">
          <AreaPicker value={f.areas} onChange={(v) => setF({ ...f, areas: v })} />
        </StepField>
      )}
      {err && <p className="text-xs" style={{ color: 'var(--color-secondary)' }}>{err}</p>}
    </StepModal>
  );
}
