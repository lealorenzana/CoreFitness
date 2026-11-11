import { useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { getGymSettings, updateGymSettings } from '../lib/api/settings';
import { showToast } from '../utils/toast';

/**
 * The owner's rule for a member switching plans ONLINE while a paid plan still runs (0243, the owner 2026-11-11:
 * "the owner should be able to customize this"). Read by paymongo_prepare_member and stored on each checkout, so a
 * change here applies to switches paid from now on — never to one a member already opened. The desk's own switching
 * (Record payment with another plan) is not changed by this: it keeps the days, as it always has.
 */
type Rule = 'keep_days' | 'start_now' | 'desk';
const RULES: { key: Rule; label: string; says: string }[] = [
  { key: 'keep_days', label: 'Keep their days', says: 'The new plan starts when the current one ends — nothing they paid is lost.' },
  { key: 'start_now', label: 'Start the new plan now', says: 'It starts today; the days left on the old plan end, not refunded. Members are told before they pay.' },
  { key: 'desk', label: 'At the desk only', says: 'Online they can only renew the plan they have; you switch them at the desk.' },
];

export default function PlanSwitchRule() {
  const [rule, setRule] = useState<Rule | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await getGymSettings();
        if (s && s.plan_switch_mode) setRule(s.plan_switch_mode); else setMissing(true);
      } catch { setMissing(true); }
    })();
  }, []);

  const pick = async (next: Rule) => {
    if (busy || next === rule) return;
    setBusy(true);
    try {
      await updateGymSettings({ plan_switch_mode: next });
      setRule(next);
      showToast('Saved — switches paid online from now on follow this', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    } finally { setBusy(false); }
  };

  const now = RULES.find((r) => r.key === rule);
  return (
    <div className="a-card" style={{ padding: '11px 14px', flex: 'none' }} data-plan-switch-rule>
      <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
        <span className="inline-flex items-center flex-none" style={{ gap: 7, fontWeight: 600, fontSize: 13 }}>
          <Repeat size={15} style={{ color: 'var(--a-p300)' }} />Switching plans online
        </span>
        {missing ? (
          <span className="a-sub">Needs migration 0243 — until then a switch mid-term is done at the desk.</span>
        ) : (
          <>
            <div className="flex flex-wrap" style={{ gap: 6 }} role="radiogroup" aria-label="Switching plans online">
              {RULES.map((r) => (
                <button key={r.key} type="button" role="radio" aria-checked={rule === r.key} disabled={busy || rule === null}
                  className={`a-chip ${rule === r.key ? 'on' : ''}`} onClick={() => void pick(r.key)} data-switch-rule={r.key}>
                  {r.label}
                </button>
              ))}
            </div>
            {now && <span className="a-sub min-w-0" style={{ flex: '1 1 260px' }}>{now.says}</span>}
          </>
        )}
      </div>
    </div>
  );
}
