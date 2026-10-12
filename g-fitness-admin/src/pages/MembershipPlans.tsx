import { useEffect, useState } from 'react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  RdHeader, RdCard, StatTile, RdButton, RdSelect, Pill, DotMenu, EmptyBlock, RdField,
} from '../components/ui/rd';
import { TONE, RD_INPUT, RD_INPUT_STYLE, type Tone } from '../components/ui/rdTokens';
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

const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';

/**
 * Membership plans, 2026-10-12: fits the screen — tiles, a strip of compact plan
 * cards, and "What each plan unlocks" filling the rest in a box that scrolls itself.
 */
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
  const [toDelete, setToDelete] = useState<MembershipPlanRow | null>(null);

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

  useEffect(() => { void (async () => { await loadData(); })(); }, []);

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
      price_unset: false,
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

  const tierTone = (tier: PlanTier): Tone => (tier === 'free' ? 'gray' : tier === 'freemium' ? 'violet' : 'amber');
  const tierWord = (tier: PlanTier) => (tier === 'freemium' ? 'Trial' : tier === 'pro' ? 'Pro (retired)' : tier[0].toUpperCase() + tier.slice(1));

  const totalRevenue = plans.reduce((sum, p) => sum + p.price * (activeMembersByPlan[p.id] ?? 0), 0);
  const totalMembers = plans.reduce((sum, p) => sum + (activeMembersByPlan[p.id] ?? 0), 0);
  const selling = plans.filter((p) => p.is_active && !p.price_unset);
  const unpriced = plans.filter((p) => p.price_unset).length;

  if (loading) {
    return <div className="text-sm" style={{ color: MUTED }}>Loading plans…</div>;
  }

  return (
    <div className="rd-fit" data-plans>
      <RdHeader title="Membership plans" subtitle="What the gym sells, and what each plan unlocks in the members' app."
        actions={<RdButton variant="primary" icon={Plus} onClick={openAdd}>Create plan</RdButton>} />

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <StatTile compact icon={CreditCard} label="Plans on sale" value={selling.length} sub={unpriced ? `${unpriced} still need a price` : `${plans.length - selling.length} retired`} tone={unpriced ? 'amber' : 'violet'} />
        <StatTile compact icon={Users} label="Members on a plan" value={totalMembers} sub="active memberships" />
        <StatTile compact icon={Banknote} label="Monthly value" value={`₱${totalRevenue.toLocaleString()}`} sub="price × active members" />
        <StatTile compact icon={Banknote} label="Average price" value={selling.length ? `₱${Math.round(selling.reduce((s, p) => s + p.price, 0) / selling.length).toLocaleString()}` : '₱0'} sub="of plans on sale" />
      </div>

      {/* Says so when the numbers are the old client-side tally rather than a count from the database. */}
      {!countsAreServerSide && (
        <p className="rounded-xl px-4 py-2 text-[12.5px]" style={{ background: TONE.violet.bg, color: '#DDD6FE' }}>
          Member counts are tallied in the browser and only recognise memberships marked active — run migration 0062 to count them in the database.
        </p>
      )}

      {/* The catalogue: one compact card per plan, in a strip that scrolls itself. */}
      {plans.length === 0 ? (
        <RdCard className="rd-fit-fill">
          <EmptyBlock icon={CreditCard} title="No plans yet" body="Nothing can be sold, and nobody can be approved onto a free tier, until one exists."
            action={<RdButton variant="primary" icon={Plus} onClick={openAdd}>Create the first plan</RdButton>} />
        </RdCard>
      ) : (
        <div className="grid gap-3 max-h-[236px] overflow-y-auto pr-1 flex-none" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', scrollbarWidth: 'thin' }} data-plan-cards>
          {plans.map((plan) => {
            const features = (plan.description ?? '').split('\n').filter((l) => l.trim().length > 0);
            const activeMembers = activeMembersByPlan[plan.id] ?? 0;
            const totalOnPlan = totalMembersByPlan[plan.id] ?? 0;
            return (
              <RdCard key={plan.id} className="p-4 flex flex-col gap-2" style={{ opacity: plan.is_active ? 1 : 0.6 }} data-plan-card={plan.name}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15.5px] font-semibold text-white truncate">{plan.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Pill tone={tierTone(plan.tier)}>{tierWord(plan.tier)}</Pill>
                      {!plan.is_active && <Pill tone="gray">Retired</Pill>}
                    </div>
                  </div>
                  <DotMenu label={`More for ${plan.name}`} items={[
                    { label: 'Edit', icon: Edit2, onClick: () => openEdit(plan) },
                    { label: 'Delete', icon: Trash2, onClick: () => setToDelete(plan), tone: 'danger' },
                  ]} />
                </div>
                <div className={`flex gap-1.5 ${plan.price_unset ? 'flex-col' : 'items-baseline'}`}>
                  {plan.price_unset
                    ? <span className="text-[14px] font-semibold" data-price-unset style={{ color: TONE.amber.fg }}>Set a price — members do not see it yet</span>
                    : <span className="text-[24px] leading-none font-bold text-white tabular-nums">₱{plan.price.toLocaleString()}</span>}
                  <span className="text-[12.5px]" style={{ color: MUTED }}>/ {durationLabel(plan.duration_days)}</span>
                </div>
                {features.length > 0 && (
                  <p className="text-[12.5px] truncate flex items-center gap-1.5" style={{ color: SECOND }} data-tip={features.join(' — ')}>
                    <Check size={13} className="flex-none" style={{ color: TONE.amber.fg }} />
                    {features[0]}{features.length > 1 ? ` +${features.length - 1} more` : ''}
                  </p>
                )}
                <div className="mt-auto pt-2 flex items-center gap-3 text-[12.5px]" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: MUTED }}><b className="text-white">{activeMembers}</b> active</span>
                  {/* Only when they differ: a lapsed or pending membership still holds the plan. */}
                  {totalOnPlan > activeMembers && <span style={{ color: '#C4B5FD' }}><b>{totalOnPlan}</b> any status</span>}
                  <span className="ml-auto font-semibold tabular-nums" style={{ color: TONE.amber.fg }}>₱{(plan.price * activeMembers).toLocaleString()}</span>
                </div>
              </RdCard>
            );
          })}
        </div>
      )}

      {/* What each plan unlocks in the member app (0049) — a comparison across plans, read as one table. */}
      {plans.length > 0 && <PlanFeatureMatrix plans={plans} onPlanChanged={() => void loadData()} />}

      {/* Deleting is retire_plan() (0062/0063): every membership moves to the free tier first. The
          confirmation says what happens to real people, because "Delete this plan?" does not. */}
      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => { const p = toDelete; setToDelete(null); if (p) void handleDelete(p); }}
        title={toDelete ? `Delete ${toDelete.name}` : 'Delete plan'}
        message={toDelete ? ((totalMembersByPlan[toDelete.id] ?? 0) > 0
          ? `${totalMembersByPlan[toDelete.id]} membership${totalMembersByPlan[toDelete.id] === 1 ? '' : 's'} will move to the free plan. They keep their dates and status; what changes is what the plan lets them do.`
          : 'Nobody is on it. It disappears from the catalogue.') : ''}
        confirmText="Delete"
        type="danger"
      />

      {/* Create / edit */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} size="lg"
        title={editingPlan ? 'Edit plan' : 'Create a membership plan'}
        subtitle="The tier is a label and a starting point — what a plan includes is set below and in the table."
        footer={<>
          <RdButton variant="ghost" onClick={() => setShowModal(false)}>Cancel</RdButton>
          <RdButton variant="primary" onClick={handleSave}>{editingPlan ? 'Save changes' : 'Create plan'}</RdButton>
        </>}>
        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)' }}>
          <div className="space-y-3.5">
            <RdField label="Plan name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Premium Plan" className={RD_INPUT} style={RD_INPUT_STYLE} />
            </RdField>
            <div className="grid grid-cols-2 gap-3">
              <RdField label="Tier">
                {/* Pro was retired in 0060; offered only while editing a plan already on it — a
                    <select> whose value matches no option would silently save it as the first one. */}
                <RdSelect label="Tier" value={form.tier} onChange={(v) => setForm({ ...form, tier: v as PlanTier })} className="w-full">
                  <option value="free">Free</option>
                  <option value="freemium">Trial — one per member</option>
                  <option value="premium">Premium</option>
                  {form.tier === 'pro' && <option value="pro">Pro / VIP (retired)</option>}
                </RdSelect>
              </RdField>
              <RdField label="Price (₱)">
                <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="1200" className={RD_INPUT} style={RD_INPUT_STYLE} />
              </RdField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <RdField label="Length">
                {/* Never expires is duration_days = NULL (0024). */}
                <RdSelect label="Length" value={form.durationMonths} onChange={(v) => setForm({ ...form, durationMonths: v })} className="w-full">
                  <option value="1">1 month</option>
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                  <option value={NEVER}>Never expires</option>
                </RdSelect>
              </RdField>
              <RdField label="Status">
                <RdSelect label="Status" value={form.isActive ? 'Active' : 'Inactive'} onChange={(v) => setForm({ ...form, isActive: v === 'Active' })} className="w-full">
                  <option value="Active">On sale</option>
                  <option value="Inactive">Retired</option>
                </RdSelect>
              </RdField>
            </div>
            {/* Entitlements — enforced by triggers in 0017 when a member books, not just shown here. */}
            <div className="rounded-xl p-3.5 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <p className="text-[14px] font-semibold text-white">Bookings this plan allows</p>
                <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>Enforced when a member books. Leave a limit blank for unlimited.</p>
              </div>
              {([['canBookClasses', 'classesPerWeek', 'Group classes', '∞ a week'], ['canBookPt', 'ptPerMonth', '1-on-1 sessions', '∞ a month']] as const).map(([flag, limit, label, ph]) => (
                <div key={flag} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 flex-1 text-[13.5px] text-white cursor-pointer">
                    <input type="checkbox" className="accent-violet-500" checked={form[flag]} onChange={(e) => setForm({ ...form, [flag]: e.target.checked })} /> {label}
                  </label>
                  <input type="number" min="1" value={form[limit]} disabled={!form[flag]} aria-label={`${label} limit`}
                    onChange={(e) => setForm({ ...form, [limit]: e.target.value })} placeholder={ph}
                    className="w-28 h-10 px-3 rounded-lg text-[13.5px] text-white disabled:opacity-40 outline-none" style={RD_INPUT_STYLE} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>What members read on the plan</span>
            <div className="flex gap-2 mb-2">
              <input value={newFeature} onChange={(e) => setNewFeature(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }}
                placeholder="e.g. Unlimited gym access" className={RD_INPUT} style={RD_INPUT_STYLE} aria-label="Add a feature line" />
              <RdButton variant="amber" onClick={addFeature}>Add</RdButton>
            </div>
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {featureLines.length === 0 && <p className="text-[12.5px] py-3" style={{ color: MUTED }}>At least one line is needed — it is what a member sees when choosing.</p>}
              {featureLines.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <Check size={14} style={{ color: TONE.amber.fg }} />
                  <span className="flex-1 text-[13.5px] text-white">{feature}</span>
                  <button type="button" onClick={() => removeFeature(idx)} aria-label={`Remove ${feature}`} style={{ color: MUTED }}><X size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
