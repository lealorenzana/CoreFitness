import { useEffect, useState } from 'react';
import {
  CalendarCheck, CheckCircle2, Coins, Dumbbell, Flag, Flame, Handshake, Plus, Power, ShoppingBag, Target, Trophy, UserPlus, Users,
  BookOpen, Banknote, type LucideIcon,
} from 'lucide-react';
import Modal from '../ui/Modal';
import { RdCard, RdButton, Pill } from '../ui/rd';
import { TONE } from '../ui/rdTokens';
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
  squad_week: 'Their team reaches its weekly target.',
  gym_goal: 'The whole gym reaches its goal — everyone who helped.',
  referral: 'A friend they invited pays for a membership — at most five a month.',
  referral_welcome: 'Joining through a friend, once they first pay.',
  classwork_on_time: 'Turning in classwork in a coaching room on time.',
  streak_milestone: 'Reaching a 4, 12, 26 or 52-week streak.',
  shop_purchase: 'For every whole ₱100 spent at the counter, when the till names them under “Who is buying?”. A void takes it back.',
  membership_paid: 'When a membership payment above ₱0 is completed at the desk.',
};
const ICON: Record<string, LucideIcon> = {
  checkin: CalendarCheck, workout_logged: Dumbbell, class_attended: Users, pt_session: Handshake, goal_achieved: Target,
  challenge_complete: Flag, personal_record: Trophy, squad_week: Users, gym_goal: Trophy, referral: UserPlus, referral_welcome: UserPlus,
  classwork_on_time: BookOpen, streak_milestone: Flame, shop_purchase: ShoppingBag, membership_paid: Banknote,
};
const per = (r: PointRule) => (r.key === 'shop_purchase' ? ' per ₱100' : '');
const FIELD = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' };

/**
 * Rewards → How members earn points (0051's point_rules; 0159 adds two). The
 * member's Rewards screen lists the switched-on ones under "How you earn",
 * word for word. A change applies from now on; points already earned stay.
 *
 * 2026-10-25: one full-height list — what is on, each editable in place, and
 * below it everything that is off with one tap to switch it on (the old page
 * hid those behind a picker and left the screen empty).
 */
export default function EarningRules() {
  const [rules, setRules] = useState<PointRule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Record<string, { label: string; points: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState<PointRule | null>(null);
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
    <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-earning>
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Coins size={20} style={{ color: TONE.violet.fg }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold text-white">How members earn points</h2>
          <p className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>Members read these words under “How you earn”. Changes apply from now on; points already earned stay.</p>
        </div>
        <Pill tone="violet">{on.length} on</Pill>
      </div>
      <div className="rd-fit-scroll p-4">
        {failed ? (
          <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>The point rules could not be loaded — a connection problem, not an empty list.</p>
        ) : !rules ? (
          <div className="h-24 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
        ) : (
          <>
            {on.length === 0 && <p className="text-[13px] pb-3" style={{ color: TONE.amber.fg }}>No way to earn is switched on, so members earn nothing. Switch one on below.</p>}
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))' }}>
              {on.map((r) => {
                const d = draft[r.key] ?? { label: r.label, points: String(r.points) };
                const dirty = d.label !== r.label || d.points !== String(r.points);
                const Icon = ICON[r.key] ?? CheckCircle2;
                return (
                  <div key={r.key} className="rounded-xl p-3.5 flex gap-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }} data-rule={r.key}>
                    <span className="w-10 h-10 rounded-xl grid place-items-center flex-none" style={{ background: TONE.violet.bg, color: TONE.violet.fg }}><Icon size={18} /></span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <input className="flex-1 min-w-0 h-9 rounded-lg px-2.5 text-[13.5px] text-white outline-none" value={d.label} aria-label={`What members read for ${r.label}`}
                          style={FIELD} onChange={(e) => setDraft((x) => ({ ...x, [r.key]: { ...d, label: e.target.value } }))} />
                        <input className="w-16 h-9 rounded-lg px-2 text-[13.5px] font-bold text-right tabular-nums outline-none" value={d.points} inputMode="numeric" aria-label={`Points for ${r.label}`}
                          style={{ ...FIELD, color: '#C4B5FD' }} onChange={(e) => setDraft((x) => ({ ...x, [r.key]: { ...d, points: e.target.value.replace(/\D/g, '') } }))} />
                        <span className="text-[12px] whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>pts{per(r)}</span>
                      </div>
                      <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>{WHEN[r.key] ?? 'Paid by the system when this happens.'}</p>
                      <div className="flex gap-1.5">
                        {dirty && <RdButton size="sm" variant="primary" disabled={busy === r.key} onClick={() => void save(r, { label: d.label.trim(), points: Number(d.points) }, 'Saved — members see it next time they open Rewards')}>Save</RdButton>}
                        <RdButton size="sm" variant="ghost" icon={Power} disabled={busy === r.key} onClick={() => void save(r, { is_active: false }, `${r.label}: switched off`)}>Switch off</RdButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {off.length > 0 && (
              <>
                <p className="text-[12px] font-semibold uppercase tracking-wide mt-5 mb-2" style={{ color: 'var(--color-text-muted)' }}>Switched off — members cannot earn these</p>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))' }}>
                  {off.map((r) => {
                    const Icon = ICON[r.key] ?? CheckCircle2;
                    return (
                      <button key={r.key} type="button" onClick={() => { setAdding(r); setNewPoints(String(r.points)); }} data-rule-off={r.key}
                        className="text-left rounded-xl px-3.5 py-3 flex items-start gap-3 hover:bg-white/[0.04]" style={{ border: '1px dashed rgba(255,255,255,0.12)' }}>
                        <Icon size={16} className="mt-0.5 flex-none" style={{ color: 'var(--color-text-muted)' }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{r.label}</span>
                          <span className="block text-[12px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{WHEN[r.key] ?? ''}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold flex-none" style={{ color: TONE.amber.fg }}><Plus size={13} />Switch on</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <Modal isOpen={adding !== null} onClose={() => setAdding(null)} title={adding ? adding.label : ''} subtitle="How many points, then switch it on" size="md"
        onConfirm={adding ? async () => {
          const n = Number(newPoints);
          if (!Number.isInteger(n) || n <= 0) { showToast('Points are a whole number above zero', 'error'); return; }
          if (await save(adding, { is_active: true, points: n }, `${adding.label}: on — members earn it from now`)) setAdding(null);
        } : undefined}
        confirmLabel="Switch it on" confirmDisabled={busy !== null || !newPoints}>
        {adding && (
          <div className="space-y-3">
            <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>{WHEN[adding.key]}</p>
            <label className="block">
              <span className="text-[12px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Points{per(adding)}</span>
              <input autoFocus value={newPoints} inputMode="numeric" onChange={(e) => setNewPoints(e.target.value.replace(/\D/g, ''))} aria-label="Points"
                className="w-full h-10 px-3 rounded-lg text-sm text-white mt-1 outline-none" style={FIELD} />
            </label>
            {adding.key === 'shop_purchase' && Number(newPoints) > 0 && (
              <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>A ₱450 sale would earn {Number(newPoints) * 4} points (four whole ₱100s).</p>
            )}
          </div>
        )}
      </Modal>
    </RdCard>
  );
}
