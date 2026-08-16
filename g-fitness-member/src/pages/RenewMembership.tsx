import { panelStyle } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, CheckCircle, ArrowLeft, AlertCircle, MapPin, Check,
  Infinity as InfinityIcon,
} from 'lucide-react';
import { Pill } from '../components/ui/StatCard';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { membershipTerm } from '../utils/membershipTerm';
import { getCurrentMemberId } from '../services/bookingService';
import { listPlans } from '../lib/api/membershipPlans';
import { getCurrentMembership, type MembershipWithPlan } from '../lib/api/memberships';
import type { MembershipPlanRow } from '../types/db';

/**
 * Renewal, as it actually works: the member picks a plan here and pays cash at
 * the front desk, who record it — which is what activates the membership.
 *
 * This screen used to write a `SharedStorage.addPayment({ status: 'Pending' })`
 * row on submit. That row went nowhere: the admin reads `payments` in Postgres,
 * so the "request" was invisible to the gym while telling the member it had
 * been submitted. RLS blocks a member writing `payments` for good reason — a
 * payment record is the gym's evidence that cash changed hands, and only the
 * person who took the cash can assert that.
 *
 * So nothing is written here. The screen's job is to show the real prices and
 * tell the member exactly what to do next.
 *
 * Prices come from `membership_plans`, the same table the admin edits. They
 * were previously hardcoded here — the fourth place in the codebase that
 * defined plans, with its own prices that matched none of the others.
 */
export default function RenewMembership() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [current, setCurrent] = useState<MembershipWithPlan | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        const [available, membership] = await Promise.all([
          listPlans(),
          id ? getCurrentMembership(id).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const active = available.filter((p) => p.is_active);
        setPlans(active);
        setCurrent(membership);
        // Default to what they're already on — renewal is usually a repeat.
        setSelectedId(membership?.plan_id ?? active[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load the plans'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selected = plans.find((p) => p.id === selectedId) ?? null;

  if (confirmed && selected) {
    return (
      <div className="flex items-center justify-center h-full px-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: 'var(--color-secondary-light)', border: '2px solid var(--color-secondary)' }}>
            <CheckCircle size={44} style={{ color: 'var(--color-secondary)' }} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Ready to renew</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Bring this to the front desk to complete your renewal.
          </p>

          <div className="rounded-2xl p-4 mb-4" style={panelStyle}>
            <div className="flex items-start gap-3 text-left">
              <AlertCircle size={20} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold text-sm mb-1.5">What happens next</p>
                <ul className="text-xs space-y-1" style={{ color: 'var(--color-text-muted)' }}>
                  <li>1. Visit the front desk at Core Fitness Mamburao</li>
                  <li>2. Pay ₱{Number(selected.price).toLocaleString()} in cash for {selected.name}</li>
                  <li>3. Staff record the payment on the spot</li>
                  <li>4. Your membership extends immediately</li>
                </ul>
              </div>
            </div>
          </div>

          <p className="text-xs mb-4 flex items-center justify-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
            <MapPin size={12} /> Mamburao, Occidental Mindoro
          </p>

          <button onClick={() => navigate('/member/payments')}
            className="w-full h-11 rounded-full font-semibold text-sm text-black"
            style={{ background: 'var(--color-secondary)' }}>
            View payment history
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Renew Membership</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Choose your plan</p>
        </div>
      </motion.div>

      {loading ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Loading plans…</p>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={panelStyle}>
          <Wallet size={40} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="font-medium text-white text-sm">No plans available</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Ask at the front desk about current membership options.
          </p>
        </div>
      ) : (
        <>
          {/* The member's real membership. This replaces a separate
              /member/membership screen that showed "Premium · Dec 31 2024 ·
              15 days remaining" — every value a literal in the source, none of
              it from the database, and it contradicted Home on the same phone. */}
          {current && (current.expiry_date || current.never_expires) && (() => {
            const today = new Date();
            const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const daysLeft = current.expiry_date
              ? Math.round(
                  (new Date(`${current.expiry_date}T00:00:00`).getTime() - midnight.getTime()) / 86_400_000
                )
              : null;
            const active = current.status === 'active' && (current.never_expires || (daysLeft ?? -1) >= 0);
            const term = membershipTerm(daysLeft, current.never_expires);
            return (
              <div className="p-4" style={{ ...panelStyle, borderRadius: 'var(--radius-panel)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Current plan</p>
                    <p className="display text-lg text-white mt-0.5">{current.membership_plans?.name}</p>
                  </div>
                  <Pill
                    label={active ? 'Active' : current.status}
                    tone={active ? 'primary' : 'secondary'}
                  />
                </div>

                {term.kind === 'unlimited' ? (
                  <div className="flex items-center gap-2 mt-3 pt-3"
                    style={{ borderTop: '1px solid var(--color-border)' }}>
                    <InfinityIcon size={16} style={{ color: 'var(--color-primary)' }} className="flex-shrink-0" />
                    <p className="text-sm font-bold text-white">{term.caption}</p>
                  </div>
                ) : (
                  <div className="flex items-end justify-between gap-3 mt-3 pt-3"
                    style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Valid until</p>
                      <p className="text-sm font-bold text-white mt-0.5">
                        {new Date(`${current.expiry_date}T00:00:00`).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="flex items-baseline gap-1 justify-end">
                        <span className="display text-2xl text-white">{term.value}</span>
                        {term.unit && (
                          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                            {term.unit}
                          </span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{term.caption}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="space-y-3">
            {plans.map((plan, i) => {
              const isSelected = plan.id === selectedId;
              return (
                <motion.button key={plan.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.06, 0.3) }}
                  onClick={() => setSelectedId(plan.id)}
                  className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
                  style={{
                    background: 'var(--color-surface-raised)',
                    border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white font-bold">{plan.name}</p>
                      {/* The admin stores features one per line. Some rows hold
                          a real newline and some a literal backslash-n, so both
                          are split — otherwise the card reads
                          "Gym floor access\nLocker room access" on one line. */}
                      {plan.description && (
                        <ul className="mt-1.5 space-y-1">
                          {plan.description
                            .split(/\\n|\n/)
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .map((line) => (
                              <li key={line} className="text-xs flex items-start gap-1.5"
                                style={{ color: 'var(--color-text-secondary)' }}>
                                <Check size={12} className="flex-shrink-0 mt-0.5"
                                  style={{ color: 'var(--color-primary)' }} />
                                {line}
                              </li>
                            ))}
                        </ul>
                      )}
                      <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                        {plan.duration_days == null ? 'Never expires' : `${plan.duration_days} days`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold" style={{ color: 'var(--color-secondary)' }}>
                        ₱{Number(plan.price).toLocaleString()}
                      </p>
                      {isSelected && <CheckCircle size={16} className="ml-auto mt-1" style={{ color: 'var(--color-primary)' }} />}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          <div className="rounded-2xl p-4 flex items-start gap-3" style={panelStyle}>
            <Wallet size={18} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Core Fitness accepts <span className="text-white font-semibold">cash at the front desk</span>. Your
              membership extends the moment staff record the payment — nothing is charged through the app.
            </p>
          </div>

          <button
            disabled={!selected}
            onClick={() => setConfirmed(true)}
            className="w-full h-12 rounded-full font-semibold text-black disabled:opacity-50"
            style={{ background: 'var(--color-secondary)' }}>
            {selected ? `Renew ${selected.name} — ₱${Number(selected.price).toLocaleString()}` : 'Select a plan'}
          </button>
        </>
      )}
    </div>
  );
}