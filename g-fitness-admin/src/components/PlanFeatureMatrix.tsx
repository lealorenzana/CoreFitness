import { useEffect, useState } from 'react';
import { moduleOn, useGymModules } from '../hooks/useGymModules';
import { updatePlan } from '../lib/api/membershipPlans';
import { Check, Lock, AlertTriangle } from 'lucide-react';
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
  /** Called after a booking row changes a plan, so the cards above match. */
  onPlanChanged?: () => void;
}

/**
 * The groups the table reads in (D3, 0186), and the gym switch behind each
 * feature — a feature the gym has switched off is shown, greyed, and says so,
 * rather than looking as if it unlocks something. Unknown keys (a feature
 * added later) land in "Other": the rows come from the catalogue, never a list.
 */
const GROUP_OF: Record<string, string> = {
  can_book_classes: 'Booking', can_book_pt: 'Booking',
  workout_tracker: 'Training', premium_programs: 'Training', plan_builder: 'AI coach', ai_model: 'AI coach',
  challenges: 'Points and challenges', points_earn: 'Points and challenges', points_redeem: 'Points and challenges',
  coaching_rooms: 'Coaching',
};
const SWITCH_OF: Record<string, string> = {
  can_book_classes: 'classes', can_book_pt: 'coaching', workout_tracker: 'progress', premium_programs: 'programs',
  plan_builder: 'assistant', ai_model: 'assistant', challenges: 'engagement', points_earn: 'points', points_redeem: 'points',
  coaching_rooms: 'rooms',
};
const GROUP_ORDER = ['Booking', 'Training', 'Coaching', 'Points and challenges', 'AI coach', 'Other'];
const BOOKING_ROWS: FeatureDef[] = [
  { key: 'can_book_classes', label: 'Book classes', description: 'Members on the plan book seats in group classes.' } as FeatureDef,
  { key: 'can_book_pt', label: 'Book 1-on-1 and have a coach', description: 'Members on the plan book 1-on-1 sessions, and (when coaching is included) pick a coach.' } as FeatureDef,
];

export default function PlanFeatureMatrix({ plans, onPlanChanged }: Props) {
  const modules = useGymModules();
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

  const isBooking = (key: string) => key === 'can_book_classes' || key === 'can_book_pt';
  const [booking, setBooking] = useState<Record<string, boolean>>({});
  const isOn = (planId: string, key: string) => {
    if (isBooking(key)) {
      const local = booking[`${planId}:${key}`];
      if (local !== undefined) return local;
      const p = plans.find((x) => x.id === planId) as unknown as Record<string, unknown> | undefined;
      return !!p?.[key];
    }
    return cells.find((c) => c.plan_id === planId && c.feature_key === key)?.enabled ?? false;
  };

  const toggle = async (planId: string, key: string) => {
    const next = !isOn(planId, key);
    const id = `${planId}:${key}`;
    if (isBooking(key)) {
      // Booking is a column on the plan (0017), not a plan feature — same table, its own save.
      setSaving(id);
      setBooking((b) => ({ ...b, [id]: next }));
      try {
        await updatePlan(planId, { [key]: next } as Partial<MembershipPlanRow>);
        onPlanChanged?.();
      } catch {
        setBooking((b) => ({ ...b, [id]: !next }));
        showToast('Could not save that change', 'error');
      } finally {
        setSaving(null);
      }
      return;
    }
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
    return <div className="a-card" style={{ flex: 1 }}><p className="a-sub">Loading plan access…</p></div>;
  }

  if (failed) {
    // Says so rather than rendering an empty grid, which would read as "this plan includes nothing".
    return (
      <div className="a-card" style={{ flex: 1 }}>
        <div className="a-hint"><AlertTriangle size={14} /><span><b style={{ color: '#fff' }}>Couldn't load plan access.</b> This is a connection problem, not an empty configuration — no plan has been changed. Reload to try again.</span></div>
      </div>
    );
  }

  return (
    <div className="a-card" style={{ flex: 1 }} data-plan-matrix>
      <div className="a-ct"><h3><Lock size={16} />What each plan unlocks</h3>
        <small>a member without a tick sees the feature locked and explained — never hidden</small></div>
      {/* Wide content scrolls inside its own box — the page must not. */}
      <div className="a-scroll grow">
        <table className="a-table" style={{ minWidth: 460 }}>
          <thead>
            <tr>
              <th>Feature</th>
              {plans.map((p) => <th key={p.id} style={{ textAlign: 'center', minWidth: 96 }}>{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {GROUP_ORDER.flatMap((group) => {
              const rows = [...BOOKING_ROWS, ...features].filter((f) => (GROUP_OF[f.key] ?? 'Other') === group);
              if (rows.length === 0) return [];
              return [
                <tr key={`g-${group}`} data-matrix-group={group}>
                  <td colSpan={plans.length + 1} className="a-lbl" style={{ color: 'var(--a-p300)', paddingTop: 12 }}>{group}</td>
                </tr>,
                ...rows.map((f) => {
                  const off = !moduleOn(modules, SWITCH_OF[f.key]);
                  return (
                    <tr key={f.key} data-matrix-row={f.key}>
                      <td data-tip={f.description}>
                        <b>{f.label}</b>{off && <> <span className="a-pill a">off at your gym</span></>}
                        <div className="a-sub" style={{ marginTop: 2 }}>{off ? 'switch it on in Your app → What you run' : f.description}</div>
                      </td>
                      {plans.map((p) => {
                        const on = isOn(p.id, f.key);
                        const busy = saving === `${p.id}:${f.key}`;
                        return (
                          <td key={p.id} style={{ textAlign: 'center' }}>
                            <button type="button" className={`a-tick ${on ? 'on' : ''}`} style={{ opacity: off ? 0.35 : undefined }}
                              onClick={() => toggle(p.id, f.key)} disabled={busy} aria-pressed={on} aria-label={`${f.label} on ${p.name}`}>
                              {on && <Check size={13} />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
      <div className="a-sub" style={{ paddingTop: 8 }}>The free workout library is never locked — it exists for members who cannot pay.</div>
    </div>
  );
}
