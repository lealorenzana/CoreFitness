import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Handshake, Wallet, UserPlus } from 'lucide-react';
import { PageHeader, Section, Chips, EmptyState } from '../components/ui/kit';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import { listMembers } from '../lib/api/members';
import { listTrainers } from '../lib/api/trainers';
import {
  assignCoaching, coachingSweep, confirmCoachingPayment, endCoaching, getCoachingSettings, listCoachings, STATUS_WORDS,
  type CoachingRow, type CoachingSettings,
} from '../lib/api/coaching';

type Filter = 'active' | 'waiting' | 'ended';
const OPEN = ['invited', 'requested', 'awaiting_payment', 'payment_sent'];
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const fmt = (ymd: string | null) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

/**
 * Coaching (0181), the gym's side: who trains with which coach and until when,
 * payments to the gym to confirm (gym_priced), and assigning a coach. Under
 * "paid to the coach" the gym sees the coaching and its dates, never the money.
 */
export default function Coaching() {
  const [settings, setSettings] = useState<CoachingSettings | null | undefined>(undefined);
  const [rows, setRows] = useState<CoachingRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [assign, setAssign] = useState({ member: '', coach: '', months: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    await coachingSweep();
    const [s, list, ms, ts] = await Promise.all([getCoachingSettings(), listCoachings(), listMembers().catch(() => []), listTrainers().catch(() => [])]);
    setSettings(s);
    setRows(list);
    const m = ms.map((x) => ({ id: x.profile.id, name: `${x.profile.first_name} ${x.profile.last_name}` }));
    const t = ts.map((x) => ({ id: x.profile.id, name: `${x.profile.first_name} ${x.profile.last_name}` }));
    setMembers(m);
    setCoaches(t);
    setNames(Object.fromEntries([...m, ...t].map((p) => [p.id, p.name])));
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); showToast(done, 'success'); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setBusy(false); }
  };

  const counts = useMemo(() => ({
    active: (rows ?? []).filter((r) => r.status === 'active').length,
    waiting: (rows ?? []).filter((r) => OPEN.includes(r.status)).length,
    ended: (rows ?? []).filter((r) => ['ended', 'declined', 'cancelled'].includes(r.status)).length,
  }), [rows]);
  const toConfirm = (rows ?? []).filter((r) => r.fee_mode === 'gym_priced' && (r.status === 'payment_sent' || r.status === 'awaiting_payment'));
  const shown = (rows ?? []).filter((r) => filter === 'active' ? r.status === 'active'
    : filter === 'waiting' ? OPEN.includes(r.status) : ['ended', 'declined', 'cancelled'].includes(r.status));
  const name = (id: string) => names[id] ?? 'Someone';

  if (settings === undefined) return <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>;
  if (settings === null) {
    return <div className="space-y-4"><PageHeader title="Coaching" /><EmptyState title="Coaching terms are not set up yet" hint="This needs the 0181 update to the database." /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Coaching" subtitle={settings.feeMode === 'trainer_direct'
        ? 'Members pay their coach directly — you see who has a coach and until when.'
        : settings.feeMode === 'gym_priced' ? 'Members pay the gym for coaching; confirm payments here.' : 'Coaching is included in your plans.'}
        actions={<Link to="/settings?tab=coaching" className="text-xs underline" style={{ color: 'var(--color-text-secondary)' }}>How coaching works here</Link>} />

      {toConfirm.length > 0 && (
        <Section title="Payments to confirm" icon={Wallet} count={toConfirm.length}>
          <div className="space-y-2" data-coaching-confirm>
            {toConfirm.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{name(r.member_id)} · {name(r.trainer_id)}</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {r.months} mo · {r.price != null ? peso(r.price) : 'no price'} · {r.pay_reference ? `ref ${r.pay_reference}` : 'not paid online yet'}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <Button size="sm" variant="primary" disabled={busy}
                    onClick={() => void run(() => confirmCoachingPayment(r.id, true, r.pay_reference ? 'online' : 'cash'), 'Confirmed — the coaching has started')}>
                    {r.pay_reference ? 'Confirm' : 'Paid in cash'}
                  </Button>
                  {r.pay_reference && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => confirmCoachingPayment(r.id, false, null), 'They have been asked to check it')}>Not found</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {settings.modes.includes('desk_assigns') && (
        <Section title="Assign a coach" icon={UserPlus}>
          <div className="grid gap-2 sm:grid-cols-4" data-coaching-assign>
            <select aria-label="Member" value={assign.member} onChange={(e) => setAssign({ ...assign, member: e.target.value })}
              className="rounded-lg border px-2 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
              <option value="">Member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select aria-label="Coach" value={assign.coach} onChange={(e) => setAssign({ ...assign, coach: e.target.value })}
              className="rounded-lg border px-2 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
              <option value="">Coach</option>{coaches.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select aria-label="Length" value={assign.months} onChange={(e) => setAssign({ ...assign, months: e.target.value })}
              className="rounded-lg border px-2 py-2 text-sm" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
              <option value="">Length</option>{settings.lengths.map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
            </select>
            <Button variant="primary" disabled={busy || !assign.member || !assign.coach || !assign.months}
              onClick={() => void run(async () => { await assignCoaching(assign.member, assign.coach, Number(assign.months)); setAssign({ member: '', coach: '', months: '' }); }, 'Coach assigned')}>
              Assign
            </Button>
          </div>
        </Section>
      )}

      <Section title="Coachings" icon={Handshake}
        actions={<Chips<Filter> value={filter} onChange={setFilter} options={[
          { value: 'active', label: 'Active', count: counts.active },
          { value: 'waiting', label: 'Waiting', count: counts.waiting },
          { value: 'ended', label: 'Ended', count: counts.ended },
        ]} />}>
        {rows === null ? <p className="text-sm" style={{ color: 'var(--color-secondary)' }}>Coachings could not be loaded.</p>
          : shown.length === 0 ? <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Nothing here.</p>
          : (
            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }} data-coaching-list>
              {shown.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{name(r.member_id)} <span style={{ color: 'var(--color-text-muted)' }}>with</span> {name(r.trainer_id)}</p>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {r.kind === 'group' ? 'Group' : '1-on-1'} · {r.months} mo · {STATUS_WORDS[r.status]}
                      {r.status === 'active' ? ` · until ${fmt(r.ends_on)}` : ''}
                      {r.started_by === 'desk' ? ' · assigned by the gym' : r.started_by === 'coach' ? ' · the coach offered' : ''}
                    </p>
                  </div>
                  {(r.status === 'active' || OPEN.includes(r.status)) && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => endCoaching(r.id, 'Ended by the gym'), 'Ended')}>End</Button>
                  )}
                </div>
              ))}
            </div>
          )}
      </Section>
    </div>
  );
}
