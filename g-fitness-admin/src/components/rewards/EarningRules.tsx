import { useEffect, useState } from 'react';
import { Coins, Plus, Power } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { Section } from '../ui/kit';
import { showToast } from '../../utils/toast';
import { listPointRules, updatePointRule, type PointRule } from '../../lib/api/engagementRules';

/**
 * When the database pays each rule — what the owner needs to decide whether to
 * turn it on. A key that is not here is still listed (with its own label); one
 * is never invented here, because a rule nothing awards would be a promise the
 * app cannot keep.
 */
const WHEN: Record<string, string> = {
  checkin: 'Each visit, when they check in at the desk or kiosk.',
  workout_logged: 'When they finish a workout in the app.',
  class_attended: 'A booked class they attended.',
  pt_session: 'A completed 1-on-1 session with a coach.',
  goal_achieved: 'A goal with a number, reached — the app checks it; a hand-ticked goal earns nothing.',
  challenge_complete: 'Finishing a challenge.',
  personal_record: 'A new personal record on a lift — at most three a week, since weights are typed in.',
  squad_week: 'Their squad reaches its weekly target.',
  gym_goal: 'The whole gym reaches its goal — everyone who helped.',
  referral: 'A friend they invited pays for a membership — at most five a month.',
  referral_welcome: 'Joining through a friend, once they first pay.',
  classwork_on_time: 'Turning in classwork in a coaching room on time.',
  streak_milestone: 'Reaching a 4, 12, 26 or 52-week streak.',
  shop_purchase: 'For every whole ₱100 spent at the counter, when the till names them under “Who is buying?”. A void takes it back.',
  membership_paid: 'When a membership payment above ₱0 is completed at the desk.',
};
const per = (r: PointRule) => (r.key === 'shop_purchase' ? ' per ₱100' : '');

/**
 * Rewards → How members earn points (0051's point_rules; 0159 adds two). The
 * member's Rewards screen lists the switched-on ones under "How you earn",
 * word for word. A change applies from now on; points already earned stay.
 */
export default function EarningRules() {
  const [rules, setRules] = useState<PointRule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Record<string, { label: string; points: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState<PointRule | null | 'pick'>(null);
  const [newPoints, setNewPoints] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try { const r = await listPointRules(); if (alive) setRules(r); }
      catch { if (alive) setFailed(true); }
    })();
    return () => { alive = false; };
  }, []);

  const save = async (rule: PointRule, patch: Partial<Pick<PointRule, 'label' | 'points' | 'is_active'>>, ok: string) => {
    setBusy(rule.key);
    try {
      await updatePointRule(rule.key, patch);
      setRules((rs) => rs?.map((r) => (r.key === rule.key ? { ...r, ...patch } : r)) ?? null);
      setDraft((d) => { const n = { ...d }; delete n[rule.key]; return n; });
      showToast(ok, 'success');
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save', 'error');
      return false;
    } finally { setBusy(null); }
  };

  const on = rules?.filter((r) => r.is_active) ?? [];
  const off = rules?.filter((r) => !r.is_active) ?? [];

  return (
    <Section title="How members earn points" icon={Coins} count={on.length}
      hint="members read these words under “How you earn”; changes apply from now on"
      actions={off.length > 0 ? <Button size="sm" variant="secondary" onClick={() => setAdding('pick')}><Plus size={13} /> Add a way to earn</Button> : undefined}>
      {failed ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>The point rules could not be loaded.</p>
      ) : !rules ? (
        <div className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
      ) : on.length === 0 ? (
        <p className="text-xs py-4" style={{ color: 'var(--color-text-muted)' }}>No way to earn is switched on, so members earn nothing. Add one.</p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))' }}>
          {on.map((r) => {
            const d = draft[r.key] ?? { label: r.label, points: String(r.points) };
            const dirty = d.label !== r.label || d.points !== String(r.points);
            return (
              <div key={r.key} className="rounded-xl p-3 space-y-2" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                  <input className="flex-1 min-w-0 h-8 rounded-lg px-2.5 text-xs text-white" value={d.label} aria-label={`What members read for ${r.label}`}
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                    onChange={(e) => setDraft((x) => ({ ...x, [r.key]: { ...d, label: e.target.value } }))} />
                  <input className="w-16 h-8 rounded-lg px-2 text-xs text-white text-right tabular-nums" value={d.points} inputMode="numeric" aria-label={`Points for ${r.label}`}
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                    onChange={(e) => setDraft((x) => ({ ...x, [r.key]: { ...d, points: e.target.value.replace(/\D/g, '') } }))} />
                  <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>pts{per(r)}</span>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{WHEN[r.key] ?? 'Paid by the system when this happens.'}</p>
                <div className="flex gap-1.5">
                  {dirty && <Button size="sm" disabled={busy === r.key} onClick={() => void save(r, { label: d.label.trim(), points: Number(d.points) }, 'Saved — members see it next time they open Rewards')}>Save</Button>}
                  <Button size="sm" variant="ghost" disabled={busy === r.key} onClick={() => void save(r, { is_active: false }, `${r.label}: switched off`)}><Power size={12} /> Switch off</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={adding !== null} onClose={() => setAdding(null)} title={adding && adding !== 'pick' ? adding.label : 'Add a way to earn'}
        subtitle={adding && adding !== 'pick' ? 'How many points, then switch it on' : 'Each one is paid by the system when it happens — nothing to track by hand'}
        size="md"
        onConfirm={adding && adding !== 'pick' ? async () => {
          const n = Number(newPoints);
          if (!Number.isInteger(n) || n <= 0) { showToast('Points are a whole number above zero', 'error'); return; }
          if (await save(adding, { is_active: true, points: n }, `${adding.label}: on — members earn it from now`)) setAdding(null);
        } : undefined}
        confirmLabel="Switch it on" confirmDisabled={busy !== null || !newPoints}>
        {adding === 'pick' ? (
          <div className="space-y-1.5">
            {off.map((r) => (
              <button key={r.key} type="button" onClick={() => { setAdding(r); setNewPoints(String(r.points)); }}
                className="w-full text-left rounded-xl px-3 py-2.5 flex items-start gap-3 hover:brightness-125"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
                <Plus size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-white">{r.label}</span>
                  <span className="block text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{WHEN[r.key] ?? ''}</span>
                </span>
              </button>
            ))}
          </div>
        ) : adding ? (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{WHEN[adding.key]}</p>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Points{per(adding)}</span>
              <input autoFocus value={newPoints} inputMode="numeric" onChange={(e) => setNewPoints(e.target.value.replace(/\D/g, ''))} aria-label="Points"
                className="w-full h-10 px-3 rounded-lg text-sm text-white mt-1" style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
            {adding.key === 'shop_purchase' && Number(newPoints) > 0 && (
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>A ₱450 sale would earn {Number(newPoints) * 4} points (four whole ₱100s).</p>
            )}
            <Button size="sm" variant="ghost" onClick={() => setAdding('pick')}>← Another way</Button>
          </div>
        ) : null}
      </Modal>
    </Section>
  );
}
