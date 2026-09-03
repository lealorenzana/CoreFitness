import { useEffect, useState } from 'react';
import { Check, Lock, AlertTriangle } from 'lucide-react';
import Card from './ui/Card';
import { showToast } from '../utils/toast';
import {
  listFeatures, listPlanFeatures, setPlanFeature,
  type FeatureDef, type PlanFeatureCell,
} from '../lib/api/planFeatures';
import type { MembershipPlanRow } from '../types/db';

/**
 * What each plan unlocks in the member app (migration 0049).
 *
 * One row per feature, one column per plan. The gym adds a subscription type by
 * creating a plan — the database seeds its whole column from the tier defaults
 * — and then tunes it here.
 *
 * ## Optimistic, then corrected
 *
 * A checkbox that waits for a round trip on every tap feels broken on a desk PC
 * on gym wifi. The cell flips immediately and reverts if the write fails, with
 * a toast saying so. Silently keeping the new state after a failed save would
 * tell the admin they had changed a member's access when they had not.
 */

interface Props {
  plans: MembershipPlanRow[];
}

export default function PlanFeatureMatrix({ plans }: Props) {
  const [features, setFeatures] = useState<FeatureDef[]>([]);
  const [cells, setCells] = useState<PlanFeatureCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [f, c] = await Promise.all([listFeatures(), listPlanFeatures()]);
        if (!alive) return;
        setFeatures(f);
        setCells(c);
        setFailed(false);
      } catch {
        // Says so rather than rendering an empty grid, which would read as
        // "this plan includes nothing".
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const isOn = (planId: string, key: string) =>
    cells.find((c) => c.plan_id === planId && c.feature_key === key)?.enabled ?? false;

  const toggle = async (planId: string, key: string) => {
    const next = !isOn(planId, key);
    const id = `${planId}:${key}`;
    setSaving(id);
    setCells((prev) => {
      const found = prev.some((c) => c.plan_id === planId && c.feature_key === key);
      return found
        ? prev.map((c) => (c.plan_id === planId && c.feature_key === key ? { ...c, enabled: next } : c))
        : [...prev, { plan_id: planId, feature_key: key, enabled: next }];
    });
    try {
      await setPlanFeature(planId, key, next);
    } catch {
      setCells((prev) =>
        prev.map((c) => (c.plan_id === planId && c.feature_key === key ? { ...c, enabled: !next } : c))
      );
      showToast('Could not save that change', 'error');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Card className="!p-4">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading plan access…</p>
      </Card>
    );
  }

  if (failed) {
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
          <div>
            <p className="text-xs font-semibold text-white">Couldn't load plan access</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              This is a connection problem, not an empty configuration — no plan has
              been changed. Reload to try again.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="!p-4">
      <div className="flex items-start gap-2 mb-4">
        <Lock size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
        <div>
          <h3 className="text-sm font-bold text-white">What each plan unlocks</h3>
          <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Members on a plan without a tick see the feature explained and locked, not
            hidden — so they can see what upgrading gets them. Class and personal
            training limits are set per plan above; these are the app's own features.
            A new plan starts from its tier's defaults and can be changed here.
          </p>
        </div>
      </div>

      {/* Wide content scrolls inside its own container — the page must not. */}
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: 460, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="text-left pb-2 pr-3 text-[10px] font-semibold uppercase"
                  style={{ color: 'var(--color-text-muted)' }}>
                Feature
              </th>
              {plans.map((p) => (
                <th key={p.id} className="pb-2 px-2 text-[10px] font-semibold text-center"
                    style={{ color: 'var(--color-text-secondary)', minWidth: 84 }}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.key} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td className="py-2.5 pr-3 align-top">
                  <p className="text-xs font-semibold text-white">{f.label}</p>
                  <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    {f.description}
                  </p>
                </td>
                {plans.map((p) => {
                  const on = isOn(p.id, f.key);
                  const busy = saving === `${p.id}:${f.key}`;
                  return (
                    <td key={p.id} className="py-2.5 px-2 text-center align-top">
                      <button
                        onClick={() => toggle(p.id, f.key)}
                        disabled={busy}
                        aria-pressed={on}
                        aria-label={`${f.label} on ${p.name}`}
                        className="w-6 h-6 rounded-md inline-flex items-center justify-center disabled:opacity-50"
                        style={{
                          background: on ? 'var(--color-primary)' : 'transparent',
                          border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        }}
                      >
                        {on && <Check size={13} style={{ color: '#fff' }} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
