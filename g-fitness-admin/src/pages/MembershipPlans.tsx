import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import {
  PageHeader, StatTiles, Section, EmptyState, CardGrid, TileCard, OpenChevron,
} from '../components/ui/kit';
import { Plus, Edit2, Trash2, X, Check, Users, Banknote, CreditCard } from 'lucide-react';
import { showToast } from '../utils/toast';
import {
  listPlans, createPlan, updatePlan, retirePlan, getPlanMemberCounts,
} from '../lib/api/membershipPlans';
import { listMemberships } from '../lib/api/memberships';
import PlanFeatureMatrix from '../components/PlanFeatureMatrix';
import type { MembershipPlanRow, PlanTier } from '../types/db';

/** `durationMonths` is a form string, so NULL needs a value the <select> can hold. */
const NEVER = 'never';

/** "/ 1 month", "/ never expires" — one wording for the cards and the list. */
function durationLabel(days: number | null): string {
  if (days == null) return 'never expires';
  const months = Math.round(days / 30);
  return months <= 1 ? `${months || 1} month` : `${months} months`;
}

const emptyForm = {
  name: '',
  tier: 'premium' as PlanTier,
  price: '',
  durationMonths: '1',
  description: '',
  isActive: true,
  // What the plan actually includes (0017). Kept as strings because they're
  // form fields; '' means "no limit", which is what NULL means in the column.
  canBookClasses: true,
  classesPerWeek: '',
  canBookPt: true,
  ptPerMonth: '',
};

export default function MembershipPlans() {
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [activeMembersByPlan, setActiveMembersByPlan] = useState<Record<string, number>>({});
  /** Every membership on the plan, whatever its status — what deletion has to move. */
  const [totalMembersByPlan, setTotalMembersByPlan] = useState<Record<string, number>>({});
  const [countsAreServerSide, setCountsAreServerSide] = useState(true);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlanRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [featureLines, setFeatureLines] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const planRows = await listPlans();
      setPlans(planRows);

      // Counted in SQL (0062). The old client-side tally only recognised
      // `status === 'active'`, so a plan somebody was genuinely on reported
      // **0 members** — and the delete guard trusted that number.
      //
      // Falls back to the old tally when the function is not there yet:
      // migrations are pasted by hand here, so this screen has to survive
      // running against a database that has not seen 0062. The fallback is
      // still wrong in the same old way, which is why it says so on the card.
      try {
        const counts = await getPlanMemberCounts();
        const active: Record<string, number> = {};
        const total: Record<string, number> = {};
        for (const c of counts) {
          active[c.plan_id] = c.active_count;
          total[c.plan_id] = c.total_count;
        }
        setActiveMembersByPlan(active);
        setTotalMembersByPlan(total);
        setCountsAreServerSide(true);
      } catch {
        const membershipRows = await listMemberships();
        const active: Record<string, number> = {};
        const total: Record<string, number> = {};
        for (const m of membershipRows) {
          total[m.plan_id] = (total[m.plan_id] ?? 0) + 1;
          if (m.status === 'active') active[m.plan_id] = (active[m.plan_id] ?? 0) + 1;
        }
        setActiveMembersByPlan(active);
        setTotalMembersByPlan(total);
        setCountsAreServerSide(false);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load membership plans', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAdd = () => {
    setEditingPlan(null);
    setForm(emptyForm);
    setFeatureLines([]);
    setShowModal(true);
  };

  const openEdit = (plan: MembershipPlanRow) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      tier: plan.tier,
      price: String(plan.price),
      durationMonths:
        plan.duration_days == null ? NEVER : String(Math.max(1, Math.round(plan.duration_days / 30))),
      description: '',
      isActive: plan.is_active,
      canBookClasses: plan.can_book_classes,
      classesPerWeek: plan.class_bookings_per_week == null ? '' : String(plan.class_bookings_per_week),
      canBookPt: plan.can_book_pt,
      ptPerMonth: plan.pt_sessions_per_month == null ? '' : String(plan.pt_sessions_per_month),
    });
    setFeatureLines((plan.description ?? '').split('\n').filter((l) => l.trim().length > 0));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price || featureLines.length === 0) {
      showToast('Name, price, and at least one feature are required', 'error');
      return;
    }

    const payload = {
      name: form.name,
      tier: form.tier,
      price: Number(form.price),
      duration_days: form.durationMonths === NEVER ? null : Number(form.durationMonths) * 30,
      description: featureLines.join('\n'),
      is_active: form.isActive,
      // A blank quota means unlimited, which the column stores as NULL. A plan
      // that can't book at all carries no quota — the boolean already said no,
      // and leaving a stale number behind would resurface if it's re-enabled.
      can_book_classes: form.canBookClasses,
      can_book_pt: form.canBookPt,
      class_bookings_per_week:
        form.canBookClasses && form.classesPerWeek.trim() !== '' ? Number(form.classesPerWeek) : null,
      pt_sessions_per_month:
        form.canBookPt && form.ptPerMonth.trim() !== '' ? Number(form.ptPerMonth) : null,
    };

    try {
      if (editingPlan) {
        await updatePlan(editingPlan.id, payload);
        showToast('Plan updated!', 'success');
      } else {
        await createPlan(payload);
        showToast('Plan created!', 'success');
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save plan', 'error');
    }
  };

  /**
   * Deleting a plan moves everyone on it to the free tier (0062).
   *
   * This used to refuse outright whenever the page thought the plan had active
   * members — and, worse, went ahead when it wrongly thought it had none, which
   * is how "Failed to delete plan" happened: a foreign key error surfaced as
   * four words that named no cause.
   *
   * The confirmation says what will happen to real people, by name and number,
   * because "Delete this membership plan?" does not tell an admin that somebody
   * is about to change tier.
   */
  const handleDelete = async (plan: MembershipPlanRow) => {
    const onPlan = totalMembersByPlan[plan.id] ?? 0;
    const consequence = onPlan > 0
      ? `\n\n${onPlan} membership${onPlan === 1 ? '' : 's'} will move to the free plan. `
        + 'They keep their current dates and status; what changes is what the plan '
        + 'lets them do.'
      : '';

    if (!window.confirm(`Delete "${plan.name}"?${consequence}`)) return;

    try {
      const result = await retirePlan(plan.id);
      showToast(
        result.moved > 0
          ? `${result.planName} deleted — ${result.moved} moved to ${result.movedTo}`
          : `${result.planName} deleted`,
        'success'
      );
      await loadData();
    } catch (err) {
      // The function raises with a reason (no free plan to fall back to, a
      // claimed trial that cannot be rewritten, not an admin). Show it — that
      // sentence is the whole point of it being written.
      showToast(err instanceof Error ? err.message : 'Failed to delete plan', 'error');
    }
  };

  const addFeature = () => {
    if (!newFeature.trim()) return;
    setFeatureLines([...featureLines, newFeature.trim()]);
    setNewFeature('');
  };

  const removeFeature = (index: number) => {
    setFeatureLines(featureLines.filter((_, i) => i !== index));
  };

  /**
   * The tier chip's two colours.
   *
   * This returned one colour and the chip built its background by appending
   * "20" for alpha — `${color}20`. That works on a hex literal and is silently
   * meaningless on a custom property: `var(--color-text-muted)20` is not a
   * colour, so the browser dropped the declaration and the Free chip rendered
   * with **no background at all**, which is why "FREE" looked like stray text
   * next to two proper chips. Both halves are named now.
   */
  const getTierStyle = (tier: PlanTier): { color: string; background: string } => {
    switch (tier) {
      case 'free': return { color: 'var(--color-text-secondary)', background: 'var(--color-surface-high)' };
      case 'freemium': return { color: 'var(--color-primary)', background: 'var(--color-primary-light)' };
      case 'premium': return { color: 'var(--color-secondary)', background: 'var(--color-secondary-light)' };
      // Pro is retired (0060) but the enum value cannot be dropped, so a row
      // may survive. It keeps Premium's amber rather than introducing a third
      // hue — the app has two, and a new colour per tier is how a palette
      // drifts. Deleting this case would render a surviving Pro plan grey.
      case 'pro': return { color: 'var(--color-secondary)', background: 'var(--color-secondary-light)' };
      default: return { color: 'var(--color-text-secondary)', background: 'var(--color-surface-high)' };
    }
  };

  const totalRevenue = plans.reduce((sum, p) => sum + p.price * (activeMembersByPlan[p.id] ?? 0), 0);
  const totalMembers = plans.reduce((sum, p) => sum + (activeMembersByPlan[p.id] ?? 0), 0);

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading plans…</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Membership plans"
        subtitle="What the gym sells, and what each plan unlocks"
        actions={
          <Button variant="secondary" size="sm" onClick={openAdd}>
            <Plus size={15} /> Create plan
          </Button>
        }
      />

      <StatTiles items={[
        { label: 'Plans', value: plans.length, icon: Banknote },
        { label: 'Members on a plan', value: totalMembers, icon: Users },
        { label: 'Monthly revenue', value: `₱${totalRevenue.toLocaleString()}`, icon: Banknote, tone: 'secondary' },
        { label: 'Average price', value: plans.length ? `₱${Math.round(plans.reduce((s, p) => s + p.price, 0) / plans.length).toLocaleString()}` : '₱0', icon: Banknote },
      ]} />

      {/* Says so when the numbers are the old client-side tally rather than a
          count from the database — that tally is what reported "0 members" for
          a plan somebody was on, and an admin about to delete one deserves to
          know which number they are looking at. */}
      {!loading && !countsAreServerSide && (
        <div className="rounded-xl px-4 py-2.5 text-[11px]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
          Member counts are being tallied in the browser and only recognise memberships
          marked active — a plan may have more on it than shown. Run migration 0062 to
          count them in the database.
        </div>
      )}

      {/* The catalogue.

          It was `grid-cols-2`, so the gym's three plans drew two 800px cards
          and one orphan. Three plans is three cards; `CardGrid` gives them a
          column each and leaves the rest of the row alone. The card is now the
          button — clicking it edits, which is what the pencil icon did. */}
      <Section title="The catalogue" icon={CreditCard} count={plans.length}>
        {plans.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No plans yet"
            hint="Nothing can be sold, and nobody can be approved onto a free tier, until one exists."
            action={<Button variant="secondary" size="sm" onClick={openAdd}><Plus size={14} /> Create the first plan</Button>}
          />
        ) : (
          <CardGrid min={280}>
            {plans.map((plan) => {
              const features = (plan.description ?? '').split('\n').filter((l) => l.trim().length > 0);
              const activeMembers = activeMembersByPlan[plan.id] ?? 0;
              const totalOnPlan = totalMembersByPlan[plan.id] ?? 0;
              return (
                <TileCard key={plan.id} dim={!plan.is_active}
                  onClick={() => openEdit(plan)} title={`Edit ${plan.name}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-[13px] font-bold text-white truncate">{plan.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase"
                          style={getTierStyle(plan.tier)}>
                          {plan.tier}
                        </span>
                        {!plan.is_active && (
                          <Badge variant="Inactive" className="!text-[9px] !px-1.5 !py-0">Retired</Badge>
                        )}
                      </div>
                    </div>
                    <OpenChevron />
                  </div>

                  <div className="flex items-baseline gap-1 mt-2.5">
                    <span className="text-xl font-bold text-white tabular-nums">₱{plan.price}</span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      / {durationLabel(plan.duration_days)}
                    </span>
                  </div>

                  {features.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {features.slice(0, 3).map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                          <Check size={10} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-secondary)' }} />
                          <span className="flex-1 line-clamp-1">{feature}</span>
                        </div>
                      ))}
                      {features.length > 3 && (
                        <p className="text-[9px] pl-4" style={{ color: 'var(--color-text-muted)' }}>
                          +{features.length - 3} more
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-2.5 pt-2.5 flex items-center gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      <span className="font-bold text-white">{activeMembers}</span> active
                    </span>
                    {/* Only shown when they differ. "Active Members 0" on a plan
                        somebody is on is what made deleting it fail with no
                        explanation — a lapsed or pending membership is still a
                        real row holding the plan in place. */}
                    {totalOnPlan > activeMembers && (
                      <span className="text-[10px]" style={{ color: 'var(--color-primary)' }}>
                        <span className="font-bold">{totalOnPlan}</span> any status
                      </span>
                    )}
                    <span className="text-[10px] ml-auto font-bold" style={{ color: 'var(--color-secondary)' }}>
                      ₱{(plan.price * activeMembers).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex gap-1.5 mt-2.5">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(plan); }}
                      className="px-2 h-7 rounded-lg text-[10px] font-semibold"
                      style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      <Edit2 size={11} className="inline mr-1" />Edit
                    </button>
                    {/* Deleting is retire_plan() (0062/0063): every membership
                        moves to the free tier first, so this never raises the
                        foreign key the screen could only call "failed". */}
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(plan); }}
                      className="px-2 h-7 rounded-lg text-[10px] font-semibold"
                      style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                      <Trash2 size={11} className="inline mr-1" />Delete
                    </button>
                  </div>
                </TileCard>
              );
            })}
          </CardGrid>
        )}
      </Section>

      {/* What each plan unlocks in the member app (0049). Below the grid rather
          than inside the edit modal: it is a comparison across plans, and the
          gym reads it as one table when deciding what a tier is worth. */}
      {plans.length > 0 && <PlanFeatureMatrix plans={plans} />}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50" onClick={() => setShowModal(false)} />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-lg font-bold text-white">{editingPlan ? 'Edit Plan' : 'Create Membership Plan'}</h2>
                  <button onClick={() => setShowModal(false)} style={{ color: 'var(--color-text-muted)' }}><X size={18} /></button>
                </div>
                <div className="p-5 space-y-3 max-h-[500px] overflow-y-auto">
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Plan Name *</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Premium Plan"
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Tier *</label>
                      <select value={form.tier} onChange={e => setForm({ ...form, tier: e.target.value as PlanTier })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        {/* The tier is a label and a set of seeding defaults —
                            never a rulebook. What a plan actually includes is
                            the fields below plus the feature matrix, so naming
                            a plan "Premium" grants nothing on its own. */}
                        <option value="free">Free</option>
                        <option value="freemium">Freemium — trial, one per member</option>
                        <option value="premium">Premium</option>
                        {/* Pro was retired in 0060 and is no longer offered.
                            Postgres cannot drop an enum value, so a Pro row can
                            still exist — and a <select> whose value matches no
                            option renders as the first one, which would turn
                            "edit this plan's price" into "silently move it to
                            Free" on save. Offered only while editing a plan
                            that is already on it. */}
                        {form.tier === 'pro' && (
                          <option value="pro">Pro / VIP (retired)</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Price (₱) *</label>
                      <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                        placeholder="1200"
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                    </div>
                    <div>
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Duration</label>
                      <select value={form.durationMonths} onChange={e => setForm({ ...form, durationMonths: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                        <option value="1">1 month</option>
                        <option value="3">3 months</option>
                        <option value="6">6 months</option>
                        <option value="12">12 months</option>
                        {/* Stored as duration_days = NULL (0024). The free tier
                            used to fake this with 3650 days, which the member
                            app then counted down from. */}
                        <option value={NEVER}>Never expires</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Status</label>
                    <select value={form.isActive ? 'Active' : 'Inactive'} onChange={e => setForm({ ...form, isActive: e.target.value === 'Active' })}
                      className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  {/* Entitlements — what this plan actually lets a member do.
                      Enforced by triggers in migration 0017, not just here, so
                      these switches are the real rules rather than a description. */}
                  <div className="rounded-xl p-3 space-y-3"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <div>
                      <p className="text-xs font-semibold text-white">What this plan includes</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        Enforced when a member books. Leave a limit blank for unlimited.
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs text-white flex-1">Can book group classes</label>
                      <select value={form.canBookClasses ? 'yes' : 'no'}
                        onChange={e => setForm({ ...form, canBookClasses: e.target.value === 'yes' })}
                        className="px-3 py-1.5 rounded-lg text-white text-xs"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                      <input type="number" min="1" value={form.classesPerWeek}
                        disabled={!form.canBookClasses}
                        onChange={e => setForm({ ...form, classesPerWeek: e.target.value })}
                        placeholder="∞ / week"
                        className="w-24 px-3 py-1.5 rounded-lg text-white text-xs disabled:opacity-40"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs text-white flex-1">Can book personal training</label>
                      <select value={form.canBookPt ? 'yes' : 'no'}
                        onChange={e => setForm({ ...form, canBookPt: e.target.value === 'yes' })}
                        className="px-3 py-1.5 rounded-lg text-white text-xs"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                      <input type="number" min="1" value={form.ptPerMonth}
                        disabled={!form.canBookPt}
                        onChange={e => setForm({ ...form, ptPerMonth: e.target.value })}
                        placeholder="∞ / month"
                        className="w-24 px-3 py-1.5 rounded-lg text-white text-xs disabled:opacity-40"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs block mb-2" style={{ color: 'var(--color-text-muted)' }}>Features *</label>
                    <div className="flex gap-2 mb-2">
                      <input value={newFeature} onChange={e => setNewFeature(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && addFeature()}
                        placeholder="Add a feature..."
                        className="flex-1 px-4 py-2 rounded-xl text-white text-sm"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                      <button onClick={addFeature}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-black"
                        style={{ background: 'var(--color-secondary)' }}>
                        Add
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {featureLines.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-lg"
                          style={{ background: 'var(--color-bg)' }}>
                          <Check size={12} style={{ color: 'var(--color-secondary)' }} />
                          <span className="flex-1 text-xs text-white">{feature}</span>
                          <button onClick={() => removeFeature(idx)} style={{ color: 'var(--color-text-muted)' }}>
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-5 flex gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm"
                    style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    Cancel
                  </button>
                  <button onClick={handleSave}
                    className="flex-1 py-2.5 rounded-full font-semibold text-sm text-black"
                    style={{ background: 'var(--color-secondary)' }}>
                    {editingPlan ? 'Save Changes' : 'Create Plan'}
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
