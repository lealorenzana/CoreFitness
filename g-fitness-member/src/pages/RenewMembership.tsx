import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Lock, X } from '@phosphor-icons/react';
import { toast } from '../components/ui/Toast';
import { SkeletonList } from '../components/ui/Skeleton';
import { errorMessage } from '../utils/errorMessage';
import { membershipTerm } from '../utils/membershipTerm';
import { planAccess } from '../utils/planAccess';
import { getPlanFeatureMatrix } from '../lib/api/planFeatures';
import { getGymSettings, type GymSettingsRow } from '../lib/api/settings';
import { getCurrentMemberId } from '../services/bookingService';
import { listPlans } from '../lib/api/membershipPlans';
import {
  getCurrentMembership, hasUsedFreemiumTrial, type MembershipWithPlan,
} from '../lib/api/memberships';
import type { MembershipPlanRow, PlanTier } from '../types/db';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, NocButton, Panel, SectionHead, StatusPill } from '../components/ui/noc';

/**
 * The membership screen: where a member sees what they have, what else exists,
 * and what it would take to move (Nocturne redesign).
 *
 * ## Why this is not just "Renew"
 *
 * It was called Renew Membership and it only ever framed itself that way — one
 * flat list of plans, a button reading "Renew Premium — ₱1,500", and a success
 * screen with a large tick. Three things were wrong with that, and they
 * compounded:
 *
 *  1. **Most people arriving here are not renewing.** They are on Free Access
 *     and want to know what Premium buys. The screen answered a question they
 *     had not asked and buried the one they had.
 *  2. **The plan cards showed a price and a duration and nothing about access.**
 *     `can_book_classes` / `can_book_pt` and the two quotas have been enforced
 *     in SQL since 0017; the member could not read any of it. Choosing between
 *     ₱0 and ₱1,500 with no statement of what separates them is not a choice.
 *  3. **"Renew Free Access — ₱0"** was a real button. So was renewing a plan
 *     that never expires — a payment for nothing, on a tier with nothing to
 *     extend.
 *
 * So the screen now names the move it is actually offering — renew, upgrade, or
 * switch down — and every plan states its access before its price.
 *
 * ## Still nothing is written here, and that is deliberate
 *
 * An earlier version wrote `SharedStorage.addPayment({ status: 'Pending' })` on
 * submit. That row went nowhere: the admin reads `payments` in Postgres, so the
 * "request" was invisible to the gym while telling the member it was submitted.
 * RLS blocks a member writing `payments` for good reason — a payment record is
 * the gym's evidence that cash changed hands, and only the person who took the
 * cash can assert it.
 *
 * The confirmation step is therefore worded as an instruction, not a receipt.
 *
 * Prices and rules come from `membership_plans`, the table the admin edits; the
 * gym's name and address come from `gym_settings` (both were typed in here).
 * The plans shown are exactly the active rows — the prototype's extra tiers and
 * guest passes do not exist, so they are not drawn.
 */

/** Cheapest commitment first, so the list reads as a ladder. Typed as a full
 *  Record on purpose: a new tier without a rank is a compile error. */
const TIER_ORDER: Record<PlanTier, number> = { free: 0, freemium: 1, premium: 2, pro: 3 };

/** What moving from the current plan to this one actually is. */
type Move = 'current' | 'upgrade' | 'downgrade' | 'sidegrade';

function describeTerm(plan: MembershipPlanRow): string {
  if (plan.duration_days == null) return 'No expiry';
  if (plan.duration_days % 30 === 0) {
    const months = plan.duration_days / 30;
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }
  return `${plan.duration_days} days`;
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

/** Included in violet with a tick; excluded muted, struck through, with a cross. */
function AccessList({ included, excluded }: { included: string[]; excluded: string[] }) {
  return (
    <ul className="flex flex-col" style={{ gap: 6 }}>
      {included.map((item) => (
        <li key={item} className="flex items-start" style={{ gap: 8, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
          <Check size={13} weight="bold" className="flex-none" style={{ marginTop: 3, color: 'var(--color-primary-300)' }} />
          {item}
        </li>
      ))}
      {/* Struck through, not merely dimmed: skimmed as plain text, an excluded
          item under a small cross reads exactly like an included one. */}
      {excluded.map((item) => (
        <li key={item} className="flex items-start" style={{ gap: 8, fontSize: 12.5, color: 'var(--color-text-muted)' }}>
          <X size={13} className="flex-none" style={{ marginTop: 3 }} />
          <span className="line-through">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function RenewMembership() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [current, setCurrent] = useState<MembershipWithPlan | null>(null);
  const [trialUsed, setTrialUsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [gym, setGym] = useState<GymSettingsRow | null>(null);
  // What each plan unlocks (0049), for every plan rather than just this
  // member's. Empty on failure, which degrades to the pre-0049 wording instead
  // of claiming a tier includes nothing.
  const [matrix, setMatrix] = useState<Record<string, { key: string; label: string; enabled: boolean }[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        const [available, membership, usedTrial, features, settings] = await Promise.all([
          listPlans(),
          id ? getCurrentMembership(id).catch(() => null) : Promise.resolve(null),
          id ? hasUsedFreemiumTrial(id) : Promise.resolve(false),
          getPlanFeatureMatrix().catch(() => ({})),
          getGymSettings().catch(() => null),
        ]);
        if (cancelled) return;
        setMatrix(features);
        setGym(settings);
        setPlans(available
          .filter((p) => p.is_active)
          .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]));
        setCurrent(membership);
        setTrialUsed(usedTrial);
        // Nothing is pre-selected. The old screen defaulted to the plan the
        // member was already on, so the button read "Renew Free Access — ₱0"
        // before they had touched anything.
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load the plans'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const currentPlan = current?.membership_plans ?? null;
  const selected = plans.find((p) => p.id === selectedId) ?? null;

  /**
   * A plan the member cannot choose, and the reason why. Only the Freemium trial
   * locks, and only once spent — the rule lives in 0041's trigger; this is the
   * explanation, so it is read here rather than discovered at the desk.
   */
  const lockedReason = useMemo(
    () => (plan: MembershipPlanRow): string | null => {
      if (plan.tier !== 'freemium') return null;
      if (plan.id === currentPlan?.id) return null;
      if (!trialUsed) return null;
      return 'Trial already used — one per member';
    },
    [trialUsed, currentPlan]
  );

  const moveFor = (plan: MembershipPlanRow): Move => {
    if (plan.id === currentPlan?.id) return 'current';
    if (!currentPlan) return 'sidegrade';
    const from = TIER_ORDER[currentPlan.tier];
    const to = TIER_ORDER[plan.tier];
    return to > from ? 'upgrade' : to < from ? 'downgrade' : 'sidegrade';
  };

  const move = selected ? moveFor(selected) : null;

  /**
   * The primary button's wording, and whether pressing it means anything.
   * Renewing a plan that never expires is guarded: there is no term to extend,
   * so the button would be asking for cash in exchange for nothing.
   */
  const action: { label: string; enabled: boolean; note?: string } = (() => {
    if (!selected) return { label: 'Choose a plan above', enabled: false };
    if (move === 'current') {
      if (selected.duration_days == null) {
        return {
          label: 'This plan never expires',
          enabled: false,
          note: 'There is nothing to renew — it keeps running until you change it.',
        };
      }
      return { label: `Renew ${selected.name}`, enabled: true };
    }
    if (Number(selected.price) === 0) return { label: `Switch to ${selected.name}`, enabled: true };
    return {
      label: `${move === 'downgrade' ? 'Switch to' : 'Upgrade to'} ${selected.name} — ${peso(Number(selected.price))}`,
      enabled: true,
    };
  })();

  if (confirmed && selected) {
    const free = Number(selected.price) === 0;
    const steps = [
      `Visit the front desk${gym?.gym_name ? ` at ${gym.gym_name}` : ''}.`,
      free ? `Ask to be moved to ${selected.name}.` : `Hand over ${peso(Number(selected.price))} in cash for ${selected.name}.`,
      'Staff record it on the spot — that is what activates the change.',
      // Named because it is the most common reason a member waits until the
      // last day, which is exactly when a lapse happens. recordPayment() carries
      // unused days forward.
      'Your access updates immediately, and any days already paid for carry over.',
    ];
    return (
      <Page>
        {/* Back returns to the plan list, not to the previous screen: this is a
            step of this screen, not a page of its own. */}
        <button onClick={() => setConfirmed(false)} className="self-start"
          style={{ fontSize: 13, height: 44, marginBottom: -12, color: 'var(--color-primary-300)' }}>
          ← Plans
        </button>
        <PageTitle title="At the front desk" subtitle="Nothing is charged in the app" />

        {/* Deliberately not a tick in a circle. Nothing has been paid or
            recorded, and the membership is exactly as it was a second ago. */}
        <Panel glow="action" filled>
          <Eyebrow>What to ask for</Eyebrow>
          <p style={{ fontSize: 'var(--text-display)', fontWeight: 600, marginTop: 6, color: 'var(--color-text-primary)' }}>
            {selected.name}
          </p>
          <p style={{ fontSize: 15, marginTop: 4, color: 'var(--color-secondary)' }}>
            {free ? 'No payment' : `${peso(Number(selected.price))} in cash`}
            <span style={{ fontSize: 12.5, marginLeft: 8, color: 'var(--color-text-muted)' }}>{describeTerm(selected)}</span>
          </p>
        </Panel>

        <section>
          <SectionHead title="How this works" />
          <ol className="flex flex-col" style={{ gap: 10, marginTop: 12 }}>
            {steps.map((s, i) => (
              <li key={i} className="flex" style={{ gap: 12, fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                <span className="flex-none" style={{ width: 18, color: 'var(--color-primary-300)' }}>{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          {gym?.address && (
            <p style={{ fontSize: 12.5, marginTop: 14, color: 'var(--color-text-muted)' }}>{gym.address}</p>
          )}
        </section>

        <NocButton variant="ghost" onClick={() => navigate('/member/payments')} className="w-full">
          See payment history
        </NocButton>
      </Page>
    );
  }

  return (
    <Page>
      <PageTitle back fallback="/member/membership" title="Plans" subtitle="Renew, upgrade or change your plan" />

      {loading ? (
        <SkeletonList count={3} />
      ) : plans.length === 0 ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          No plans are available right now. Ask at the front desk about current membership options.
        </p>
      ) : (
        <>
          {/* ── What you have ── */}
          {current && currentPlan && (() => {
            const today = new Date();
            const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const daysLeft = current.expiry_date
              ? Math.round((new Date(`${current.expiry_date}T00:00:00`).getTime() - midnight.getTime()) / 86_400_000)
              : null;
            const usable = current.status === 'active' && (current.never_expires || (daysLeft ?? -1) >= 0);
            const term = membershipTerm(daysLeft, current.never_expires);
            const access = planAccess(currentPlan, matrix[currentPlan.id]);

            return (
              <Panel glow="structure" filled>
                <div className="flex items-start justify-between" style={{ gap: 12 }}>
                  <div className="min-w-0">
                    <Eyebrow>Your plan today</Eyebrow>
                    <p style={{ fontSize: 20, fontWeight: 600, marginTop: 6, color: 'var(--color-text-primary)' }}>{currentPlan.name}</p>
                  </div>
                  <StatusPill label={usable ? 'Active' : current.status} tone={usable ? 'structure' : 'action'} />
                </div>

                <div className="rule" style={{ margin: '14px 0' }} />

                {term.kind === 'unlimited' ? (
                  <p style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{term.caption}</p>
                ) : current.expiry_date ? (
                  <div className="flex items-end justify-between" style={{ gap: 12 }}>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Valid until</p>
                      <p style={{ fontSize: 14, marginTop: 3, color: 'var(--color-text-primary)' }}>
                        {new Date(`${current.expiry_date}T00:00:00`).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="flex items-baseline justify-end" style={{ gap: 5 }}>
                        <span style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, color: 'var(--color-text-primary)' }}>{term.value}</span>
                        {term.unit && <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{term.unit}</span>}
                      </p>
                      <p style={{ fontSize: 12, marginTop: 3, color: 'var(--color-text-muted)' }}>{term.caption}</p>
                    </div>
                  </div>
                ) : (
                  // No date and not a lifetime plan: never activated. Saying
                  // nothing is how this used to render as a blank card.
                  <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                    Not activated yet — the front desk starts it when you first pay.
                  </p>
                )}

                {access && (
                  <div style={{ marginTop: 14 }}>
                    <AccessList included={access.included} excluded={access.excluded} />
                  </div>
                )}
              </Panel>
            );
          })()}

          {/* ── What else exists ── */}
          <section>
            <SectionHead title="All plans" meta={`${plans.length} offered`} />
            <div role="radiogroup" aria-label="Plans" className="flex flex-col" style={{ gap: 10, marginTop: 12 }}>
              {plans.map((plan) => {
                const isSelected = plan.id === selectedId;
                const isCurrent = plan.id === currentPlan?.id;
                const locked = lockedReason(plan);
                const access = planAccess(plan, matrix[plan.id]);
                const kind = moveFor(plan);

                return (
                  <button
                    key={plan.id}
                    role="radio"
                    aria-checked={isSelected}
                    disabled={locked != null}
                    onClick={() => setSelectedId(plan.id)}
                    className="w-full text-left"
                    style={{
                      padding: 'var(--card-pad)',
                      borderRadius: 'var(--radius-card)',
                      background: isSelected ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))' : 'transparent',
                      border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-hairline)'}`,
                      boxShadow: isSelected ? '0 0 22px -12px var(--color-primary)' : 'none',
                      opacity: locked ? 0.6 : 1,
                    }}
                  >
                    <div className="flex items-start justify-between" style={{ gap: 12 }}>
                      <div className="min-w-0">
                        <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
                          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{plan.name}</span>
                          {isCurrent && <StatusPill label="Current" tone="structure" />}
                          {/* The move is named on the plan, not only on the
                              button, so the ladder reads while scanning. */}
                          {!isCurrent && kind === 'upgrade' && <StatusPill label="Upgrade" tone="action" />}
                          {!isCurrent && kind === 'downgrade' && <StatusPill label="Costs less" tone="muted" />}
                        </div>
                        <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-muted)' }}>
                          {describeTerm(plan)}
                          {plan.tier === 'freemium' && ' · one per member'}
                        </p>
                      </div>
                      <span className="flex-none" style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-secondary)' }}>
                        {Number(plan.price) === 0 ? 'Free' : peso(Number(plan.price))}
                      </span>
                    </div>

                    {/* Access before description: the admin's free-text
                        description is a sales line; these are the columns the
                        booking triggers actually enforce. */}
                    {access && (
                      <div style={{ marginTop: 12 }}>
                        <AccessList included={access.included} excluded={access.excluded} />
                      </div>
                    )}

                    {locked && (
                      <p className="flex items-center" style={{ gap: 6, marginTop: 10, fontSize: 12.5, color: 'var(--color-secondary)' }}>
                        <Lock size={13} className="flex-none" /> {locked}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
            {gym?.gym_name ?? 'The gym'} takes <span style={{ color: 'var(--color-text-primary)' }}>cash at the front desk</span>.
            Your plan changes the moment staff record it — nothing is charged through the app, and choosing here does
            not reserve or commit anything.
          </p>

          {action.note && (
            <p className="text-center" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{action.note}</p>
          )}

          <NocButton variant="action" disabled={!action.enabled} onClick={() => setConfirmed(true)} className="w-full">
            {action.label}
          </NocButton>
        </>
      )}
    </Page>
  );
}
