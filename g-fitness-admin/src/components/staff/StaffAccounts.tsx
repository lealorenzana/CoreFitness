import { useCallback, useEffect, useState } from 'react';
import { Archive, Check, KeyRound, ShieldCheck, UserCheck, UserPlus, UserX } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import StepModal, { StepField } from '../ui/StepModal';
import { STEP_INPUT, STEP_INPUT_STYLE } from '../ui/stepStyles';
import { createStaffAccount } from '../../lib/api/settings';
import { isEmailTaken } from '../../lib/api/members';
import { listStaffPermissions, setStaffPermissions, STAFF_AREAS, type StaffArea } from '../../lib/api/staffPermissions';
import { showToast } from '../../utils/toast';
import { myLogin, realEmail, suggestUsername, usernameAvailable, usernameShape, USERNAME_HINT } from '../../lib/api/logins';
import LoginSlip from '../LoginSlip';
import type { ProfileRow, ProfileStatus } from '../../types/db';

const MUTED = 'var(--color-text-secondary)';
const PANEL = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };
const ALL = STAFF_AREAS.map((a) => a.key);

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
                  <p className="text-[11px] truncate" style={{ color: MUTED }}>{realEmail(a.email) ?? (a.username ? `@${a.username}` : 'No email')}</p>
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
            <span className="text-[11px]" style={{ color: MUTED }}>{realEmail(a.email) ?? (a.username ? `@${a.username}` : 'No email')}</span>
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
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; email: string | null; username: string | null; password: string | null } | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  // 0236: no typed password — a one-time one is made and shown on the login slip.
  const [f, setF] = useState({ firstName: '', lastName: '', phone: '', email: '', username: '', areas: [...ALL] as StaffArea[] });
  const [usernamesOn, setUsernamesOn] = useState(false);
  useEffect(() => { void myLogin().then((l) => setUsernamesOn(l !== null)); }, []);

  const next = async () => {
    setErr(null);
    if (step === 1) {
      const em = f.email.trim();
      if (!em && !f.username.trim()) { setErr(usernamesOn ? 'Give an email or a username — they sign in with it.' : 'They sign in with this — type a real address.'); return; }
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setErr('That is not an email address.'); return; }
      if (em && await isEmailTaken(em)) { setErr('This email already has an account.'); return; }
      if (f.username.trim()) {
        const why = usernameShape(f.username) ?? await usernameAvailable(f.username).catch(() => null);
        if (why) { setErr(`Username: ${why}`); return; }
      }
    }
    if (step < STEPS.length - 1) {
      if (step === 0 && usernamesOn && !f.username) setF((x) => ({ ...x, username: suggestUsername(x.firstName, x.lastName) }));
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const created = await createStaffAccount({ firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, username: f.username.trim() || undefined });
      if (permsLive && f.areas.length < ALL.length) {
        await setStaffPermissions(created.id, f.areas).catch(() => showToast('They were added with the whole desk — set what they may do from the list.', 'error'));
      }
      setDone({ name: `${f.firstName.trim()} ${f.lastName.trim()}`, email: created.email ?? null, username: created.username ?? null, password: created.password ?? null });
      setSlipOpen(true);
      await onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add them');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <StepModal title={`${done.name} can sign in`} steps={STEPS} step={0} onStep={() => undefined} canNext={false} onNext={() => undefined}
        onBack={() => undefined} onClose={onClose} finishLabel="" hideNav>
        <p className="text-xs" style={{ color: MUTED }}>A one-time password was made for them. At their first sign-in they choose their own.</p>
        <Button size="sm" variant="ghost" onClick={() => setSlipOpen(true)} data-show-slip><KeyRound size={13} /> Show the login slip</Button>
        <Button variant="secondary" className="w-full" onClick={onClose}>Done</Button>
        {slipOpen && (
          <LoginSlip name={done.name} role="staff" username={done.username} email={done.email} password={done.password}
            emailed={null} onClose={() => setSlipOpen(false)} />
        )}
      </StepModal>
    );
  }

  const ready = step === 0 ? !!f.firstName.trim() && !!f.lastName.trim() : step === 1 ? !!f.email.trim() || !!f.username.trim() : f.areas.length > 0;
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
        <StepField label={usernamesOn ? 'Email (optional with a username)' : 'Email'} hint="They sign in to this dashboard with it."><input autoFocus type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Email" className={STEP_INPUT} style={STEP_INPUT_STYLE} /></StepField>
        {usernamesOn && (
          <StepField label={f.email.trim() ? 'Username (optional)' : 'Username'} hint={`${USERNAME_HINT}. They sign in with their email or this.`}>
            <input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s+/g, '') })} aria-label="Username"
              autoCapitalize="off" spellCheck={false} className={`${STEP_INPUT} font-mono`} style={STEP_INPUT_STYLE} />
          </StepField>
        )}
        <p className="text-xs flex items-start gap-2 rounded-lg p-2.5" style={{ background: 'var(--color-surface-high)', color: MUTED }}>
          <KeyRound size={14} className="flex-none mt-0.5" />
          A one-time password is made for them and shown on a login slip. At their first sign-in they choose their own.
        </p>
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
