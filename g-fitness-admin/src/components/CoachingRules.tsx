import { useEffect, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { showToast } from '../utils/toast';
import { getHouseRules, PAUSE_WORDS, saveHouseRules, type HouseRules, type PauseRule } from '../lib/api/coachingRules';
import type { FeeMode } from '../lib/api/coaching';

const PAUSES: PauseRule[] = ['never', 'with_membership', 'coach_decides'];

/**
 * The gym's own coaching rules (0235) — the three questions the owner answers
 * in Setup → How coaching works and Settings → Personal training:
 *   does coaching pause when a membership freezes;
 *   does the gym take a share of what members pay coaches directly;
 *   do coaches pay the gym dues.
 * Each defaults to "no" (what the system always did). Switching the share or
 * dues on asks for the number; nothing is saved until a real one is typed —
 * the app never invents a gym's percent or price. Renders nothing before 0235.
 */
export default function CoachingRules({ feeMode }: { feeMode: FeeMode }) {
  const [r, setR] = useState<HouseRules | null>(null);
  const [saving, setSaving] = useState(false);
  // Switched on but not yet given a number: shown as on, saved once the number is real.
  const [cutWanted, setCutWanted] = useState(false);
  const [duesWanted, setDuesWanted] = useState(false);
  const [percent, setPercent] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    void (async () => {
      const got = await getHouseRules();
      setR(got);
      if (got) {
        setCutWanted(got.cutOn); setDuesWanted(got.duesOn);
        setPercent(got.cutOn ? String(got.cutPercent) : '');
        setAmount(got.duesOn ? String(got.duesAmount) : '');
      }
    })();
  }, []);
  if (!r) return null;

  const save = async (next: HouseRules) => {
    const before = r;
    setR(next);
    setSaving(true);
    try { await saveHouseRules(next); showToast('Saved', 'success'); }
    catch (e) { setR(before); showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setSaving(false); }
  };
  const pct = Number(percent);
  const pctOk = percent.trim() !== '' && pct > 0 && pct <= 50;
  const amt = Number(amount);
  const amtOk = amount.trim() !== '' && amt > 0;
  const direct = feeMode === 'trainer_direct';

  const muted = { color: 'var(--color-text-secondary)' };
  const box = (on: boolean) => ({ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', background: 'var(--color-bg)' });
  const dot = (on: boolean) => on
    ? <Check size={16} style={{ color: 'var(--color-primary)' }} />
    : <span className="block h-4 w-4 rounded-full border" style={{ borderColor: 'var(--color-border)' }} />;
  const field = 'w-28 rounded-lg border px-2.5 py-1.5 text-sm';
  const fieldStyle = { borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' };

  const yesNo = (on: boolean, onNo: () => void, onYes: () => void, name: string, disabled = false) => (
    <div className="mt-2 flex gap-2" role="radiogroup" aria-label={name}>
      {[false, true].map((v) => (
        <button key={String(v)} type="button" role="radio" aria-checked={on === v} disabled={saving || disabled}
          onClick={() => { if (on !== v) (v ? onYes : onNo)(); }}
          className="h-9 px-4 rounded-lg border text-sm font-semibold disabled:opacity-60"
          style={{ ...box(on === v), color: on === v ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
          {v ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6" data-coaching-rules>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>When a member freezes, does their coaching pause?</p>
        <p className="text-xs mt-0.5" style={muted}>Members see your answer before they ask to freeze.</p>
        <div className="mt-2 grid gap-2">
          {PAUSES.map((p) => {
            const on = r.pause === p;
            return (
              <button key={p} type="button" role="radio" aria-checked={on} disabled={saving} data-pause-rule={p}
                onClick={() => { if (!on) void save({ ...r, pause: p }); }}
                className="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left" style={box(on)}>
                <span className="mt-0.5 shrink-0">{dot(on)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{PAUSE_WORDS[p].title}</span>
                  <span className="block text-xs mt-0.5" style={muted}>{PAUSE_WORDS[p].blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div data-cut-rule>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Do coaches give the gym a share of what members pay them?</p>
        {direct ? (
          <p className="text-xs mt-0.5" style={muted}>Counted from coaching packages your coaches mark Received. Single 1-on-1 sessions record no price, so they are not counted.</p>
        ) : (
          <p className="text-xs mt-0.5 inline-flex items-start gap-1.5" style={muted} data-cut-locked>
            <Lock size={12} className="mt-0.5 flex-none" />
            Only when members pay coaches directly — choose “Paid to the coach” above. Now the gym is paid, so there is no share to take.
          </p>
        )}
        {yesNo(cutWanted, () => { setCutWanted(false); if (r.cutOn) void save({ ...r, cutOn: false }); },
          () => { setCutWanted(true); if (pctOk) void save({ ...r, cutOn: true, cutPercent: pct }); }, 'Gym share', !direct && !r.cutOn)}
        {cutWanted && (
          <label className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
            The gym's share
            <input aria-label="The gym's share, percent" inputMode="decimal" value={percent} data-cut-percent
              onChange={(e) => setPercent(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={() => { if (pctOk && (!r.cutOn || pct !== r.cutPercent)) void save({ ...r, cutOn: true, cutPercent: pct }); }}
              className={field} style={fieldStyle} placeholder="e.g. 5" />
            %
            {!pctOk && <span className="text-xs" style={{ color: 'var(--color-secondary)' }}>Type a percent from 0.1 to 50 to switch it on.</span>}
          </label>
        )}
      </div>

      <div data-dues-rule>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Do coaches pay the gym to train here?</p>
        <p className="text-xs mt-0.5" style={muted}>Due every month from the month you switch it on. The desk records each payment; a coach who is behind is shown to you — never locked out.</p>
        {yesNo(duesWanted, () => { setDuesWanted(false); if (r.duesOn) void save({ ...r, duesOn: false }); },
          () => { setDuesWanted(true); if (amtOk) void save({ ...r, duesOn: true, duesAmount: amt }); }, 'Coach dues')}
        {duesWanted && (
          <label className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
            ₱
            <input aria-label="Coach dues, pesos a month" inputMode="decimal" value={amount} data-dues-amount
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={() => { if (amtOk && (!r.duesOn || amt !== r.duesAmount)) void save({ ...r, duesOn: true, duesAmount: amt }); }}
              className={field} style={fieldStyle} placeholder="e.g. 500" />
            a month
            {!amtOk && <span className="text-xs" style={{ color: 'var(--color-secondary)' }}>Type the amount to switch it on.</span>}
          </label>
        )}
      </div>
    </div>
  );
}
