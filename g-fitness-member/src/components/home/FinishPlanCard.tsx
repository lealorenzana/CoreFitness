import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Storefront } from '@phosphor-icons/react';
import { NocButton, Panel } from '../ui/noc';
import { supabase } from '../../lib/supabaseClient';
import { getGymContext } from '../../lib/gymContext';
import { listPlans } from '../../lib/api/membershipPlans';
import { getCurrentMembership } from '../../lib/api/memberships';
import { gymOnlinePay } from '../../lib/api/paymongo';
import { todayKey } from '../../utils/dates';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

/**
 * "Finish your plan" (2026-10-12). Everyone joins on the free plan — the plan a
 * person taps at sign-up is only what they are after (Register says so) — and
 * nothing ever came back to it: someone who chose Premium landed on Free and
 * was never asked again. This card asks once, on Today:
 *
 *   - only an active member of the gym they signed up to;
 *   - only when the plan they chose is a paid plan this gym still sells, with a price;
 *   - only while they are not already on a running paid plan;
 *   - paying is the member's own step (PayMongo confirms it — no desk approval),
 *     or, at a gym with no online payments, the desk's.
 *
 * The plan they chose lives on their account (`user_metadata.requested_plan_id`,
 * written at sign-up — a Google sign-up writes it too), and "Not now" records the
 * plan it was answered for (`plan_nudge_done`) on the same account — never in
 * this browser (CLAUDE.md: per-user state never lives in localStorage).
 */
export default function FinishPlanCard() {
  const navigate = useNavigate();
  const [card, setCard] = useState<{ planId: string; name: string; price: number; online: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      const meta = (user?.user_metadata ?? {}) as { requested_plan_id?: string | null; gym_id?: string | null; plan_nudge_done?: string | null };
      const planId = meta.requested_plan_id || null;
      if (!user || !planId || meta.plan_nudge_done === planId) return;
      const ctx = await getGymContext();
      if (!alive || ctx?.role !== 'member' || ctx.status !== 'active') return;
      // The plan belongs to the gym they signed up to; at another gym it means nothing.
      if (meta.gym_id && ctx.gymId && meta.gym_id !== ctx.gymId) return;
      const [plans, membership, pay] = await Promise.all([
        listPlans().catch(() => []),
        getCurrentMembership(user.id).catch(() => null),
        gymOnlinePay().catch(() => null),
      ]);
      if (!alive) return;
      // An unpriced plan never reaches a member (0186 hides it in the database), so it never reaches here.
      const plan = plans.find((p) => p.id === planId && p.is_active !== false);
      if (!plan || Number(plan.price) <= 0) return;
      // Already on a running paid plan (this one or another): nothing to finish.
      const m = membership;
      const running = !!m && ['active', 'frozen'].includes(m.status) && (m.never_expires || !m.expiry_date || m.expiry_date >= todayKey());
      if (running && Number(m?.membership_plans?.price ?? 0) > 0) return;
      setCard({ planId, name: plan.name, price: Number(plan.price), online: !!pay?.gym });
    })();
    return () => { alive = false; };
  }, []);

  if (!card) return null;

  const notNow = async () => {
    setBusy(true);
    // Recorded for this plan only: choosing another later asks again.
    await supabase.auth.updateUser({ data: { plan_nudge_done: card.planId } }).catch(() => undefined);
    setCard(null);
  };

  return (
    <div data-finish-plan>
    <Panel glow="action" style={{ padding: '14px 16px' }}>
      <div className="flex items-start" style={{ gap: 12 }}>
        <span className="grid place-items-center flex-none" style={{ width: 40, height: 40, borderRadius: 12,
          background: 'color-mix(in srgb, var(--color-secondary) 14%, transparent)', color: 'var(--color-secondary)' }}>
          {card.online ? <CreditCard size={20} weight="fill" /> : <Storefront size={20} weight="fill" />}
        </span>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>You picked {card.name}</p>
          <p style={{ fontSize: 13, lineHeight: 1.45, marginTop: 2, color: 'var(--color-text-secondary)' }}>
            You are on the free plan for now. {card.online
              ? <>Pay {peso(card.price)} here and {card.name} starts the moment it goes through.</>
              : <>Pay {peso(card.price)} at the front desk and they will start {card.name} for you.</>}
          </p>
        </div>
      </div>
      <div className="flex" style={{ gap: 8, marginTop: 12 }}>
        <NocButton variant="fill" className="flex-1" onClick={() => navigate(`/member/renew?plan=${card.planId}`)}>
          {card.online ? `Pay ${peso(card.price)}` : 'See how to pay'}
        </NocButton>
        <NocButton variant="ghost" onClick={() => void notNow()} disabled={busy}>Not now</NocButton>
      </div>
    </Panel>
    </div>
  );
}
