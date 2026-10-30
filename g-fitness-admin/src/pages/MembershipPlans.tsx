import { useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  Plus, Check, X, Users, Tag, LockOpen, Archive, Pencil, Copy, GripVertical, Smartphone, RotateCcw, Trash2, Lock, Bell,
} from 'lucide-react';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PlanFeatureMatrix from '../components/PlanFeatureMatrix';
import { Av, Pager } from './attendance/parts';
import './attendance/att.css';
import { showToast } from '../utils/toast';
import { recordReason, REASON_FIELD } from '../lib/api/reasons';
import ReasonDialog from '../components/ui/ReasonDialog';
import { todayKey, addDays } from '../utils/dates';
import { usePaged } from '../hooks/usePaged';
import { useFitRows } from '../hooks/useFitRows';
import {
  listPlans, createPlan, updatePlan, retirePlan, getPlanMemberCounts,
} from '../lib/api/membershipPlans';
import { listMemberships, type MembershipWithPlan } from '../lib/api/memberships';
import { listMembers } from '../lib/api/members';
import { listPayments } from '../lib/api/payments';
import { notifyUser } from '../lib/api/notify';
import type { MembershipPlanRow, PlanTier, PaymentRow } from '../types/db';

/** The lengths the mock-up offers, in days; null = never ends (0024). Any other stored length shows as its own chip. */
const LENGTHS: [number | null, string][] = [[1, '1 day'], [7, '1 week'], [30, '1 month'], [90, '3 months'], [180, '6 months'], [365, '1 year'], [null, 'Never ends']];

function lengthWord(days: number | null): string {
  if (days == null) return 'never expires';
  const named = LENGTHS.find(([d]) => d === days);
  if (named) return named[1];
  if (days % 30 === 0) return `${days / 30} months`;
  return `${days} days`;
}
/** "/ month", "· 30 days" — how a price reads on the card. */
function perWord(p: Pick<MembershipPlanRow, 'tier' | 'duration_days'>): string {
  if (p.duration_days == null) return '· never expires';
  if (p.tier === 'freemium') return `· ${lengthWord(p.duration_days)}, then the free plan`;
  return `/ ${lengthWord(p.duration_days).replace(/^1 /, '')}`;
}
const KIND: Record<PlanTier, [string, string]> = { free: ['Free', ''], freemium: ['Trial', 'a'], premium: ['Paid', 'v'], pro: ['Pro (retired)', 'v'] };
const peso = (n: number) => `₱${Math.round(n).toLocaleString()}`;
const monthYear = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : '—');
const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const daysUntil = (d: string, today: string) => Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);

interface Draft {
  id: string | null;
  name: string;
  tier: PlanTier;
  price: string;
  days: number | null;
  isActive: boolean;
  canBookClasses: boolean;
  classesPerWeek: string;
  canBookPt: boolean;
  ptPerMonth: string;
  lines: string[];
}
const fromPlan = (p: MembershipPlanRow): Draft => ({
  id: p.id, name: p.name, tier: p.tier, price: p.price_unset ? '' : String(p.price), days: p.duration_days, isActive: p.is_active,
  canBookClasses: p.can_book_classes, classesPerWeek: p.class_bookings_per_week == null ? '' : String(p.class_bookings_per_week),
  canBookPt: p.can_book_pt, ptPerMonth: p.pt_sessions_per_month == null ? '' : String(p.pt_sessions_per_month),
  lines: (p.description ?? '').split('\n').filter((l) => l.trim()),
});
const BLANK: Draft = { id: null, name: '', tier: 'premium', price: '', days: 30, isActive: true, canBookClasses: true, classesPerWeek: '', canBookPt: true, ptPerMonth: '', lines: [] };

interface Person { id: string; name: string; photo: string | null }

/**
 * Plans (2026-10-20, the approved mock-up): what the gym sells as cards, the one
 * being edited beside them with what members will read, and who is on it below,
 * sorted by renewal. "What each unlocks" is the plan-feature table (0049);
 * "Retired" holds plans off sale — restored, or deleted through retire_plan()
 * (0062), which moves everyone on it to the free plan first.
 */
export default function MembershipPlans() {
  const [today] = useState(() => todayKey());
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [active, setActive] = useState<Record<string, number>>({});
  const [total, setTotal] = useState<Record<string, number>>({});
  const [countsAreServerSide, setCountsAreServerSide] = useState(true);
  const [mships, setMships] = useState<MembershipWithPlan[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [view, setView] = useState<'sell' | 'unlock' | 'retired'>('sell');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newLine, setNewLine] = useState('');
  const [dragAt, setDragAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<MembershipPlanRow | null>(null);
  const [reminded, setReminded] = useState<Set<string>>(new Set());

  const loadData = async (keep?: string | null) => {
    try {
      const planRows = await listPlans();
      setPlans(planRows);
      try {
        // Counted in SQL (0062); the browser tally below only knows `active`, and says so on the page.
        const counts = await getPlanMemberCounts();
        setActive(Object.fromEntries(counts.map((c) => [c.plan_id, c.active_count])));
        setTotal(Object.fromEntries(counts.map((c) => [c.plan_id, c.total_count])));
        setCountsAreServerSide(true);
      } catch {
        const rows = await listMemberships();
        const a: Record<string, number> = {}; const t: Record<string, number> = {};
        for (const m of rows) { t[m.plan_id] = (t[m.plan_id] ?? 0) + 1; if (m.status === 'active') a[m.plan_id] = (a[m.plan_id] ?? 0) + 1; }
        setActive(a); setTotal(t); setCountsAreServerSide(false);
      }
      const [ms, members, pays] = await Promise.all([listMemberships(), listMembers().catch(() => []), listPayments().catch(() => [])]);
      setMships(ms);
      setPeople(new Map(members.map((m) => [m.profile.id, { id: m.profile.id, name: `${m.profile.first_name} ${m.profile.last_name}`.trim(), photo: m.profile.photo_url ?? null }])));
      setPayments(pays);
      setFailed(false);
      const pick = planRows.find((p) => p.id === keep) ?? planRows.find((p) => p.is_active && p.tier === 'premium') ?? planRows.find((p) => p.is_active) ?? null;
      setDraft(pick ? fromPlan(pick) : { ...BLANK });
    } catch (err) {
      setFailed(true);
      showToast(err instanceof Error ? err.message : 'Could not load the plans', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void (async () => { await loadData(); })(); }, []);

  const onSale = plans.filter((p) => p.is_active);
  const retired = plans.filter((p) => !p.is_active);
  const planOf = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  /** Each member's newest membership — what they are on now. */
  const current = useMemo(() => {
    const seen = new Map<string, MembershipWithPlan>();
    for (const m of mships) if (!seen.has(m.member_id)) seen.set(m.member_id, m); // newest first
    return [...seen.values()];
  }, [mships]);
  const usable = current.filter((m) => m.status === 'active');
  const tierOf = (m: MembershipWithPlan) => planOf.get(m.plan_id)?.tier ?? m.membership_plans?.tier;
  const paidNow = usable.filter((m) => (planOf.get(m.plan_id)?.price ?? 0) > 0);
  const freeNow = usable.filter((m) => tierOf(m) === 'free');
  const trialNow = usable.filter((m) => tierOf(m) === 'freemium');
  const otherNow = usable.length - paidNow.length - freeNow.length - trialNow.length;
  const monthly = paidNow.reduce((s, m) => {
    const p = planOf.get(m.plan_id);
    return s + (p && p.duration_days ? (p.price * 30) / p.duration_days : 0);
  }, 0);

  /** Trials that became paid: of everyone whose trial is over (someone still on one has not decided yet), who later paid. */
  const conversion = useMemo(() => {
    const stillTrying = new Set(current.filter((m) => m.status === 'active' && (planOf.get(m.plan_id)?.tier ?? m.membership_plans?.tier) === 'freemium').map((m) => m.member_id));
    const firstTrial = new Map<string, string>();
    for (const m of mships) if (!stillTrying.has(m.member_id) && (planOf.get(m.plan_id)?.tier ?? m.membership_plans?.tier) === 'freemium') {
      const at = firstTrial.get(m.member_id); if (!at || m.created_at < at) firstTrial.set(m.member_id, m.created_at);
    }
    let became = 0;
    for (const [who, at] of firstTrial) if (mships.some((m) => m.member_id === who && m.created_at > at && (planOf.get(m.plan_id)?.price ?? 0) > 0)) became++;
    return { tried: firstTrial.size, became };
  }, [mships, planOf, current]);

  const soon = usable.filter((m) => m.expiry_date && !m.never_expires && (planOf.get(m.plan_id)?.price ?? 0) > 0
    && m.expiry_date.slice(0, 10) >= today && m.expiry_date.slice(0, 10) <= addDays(today, 7));
  const soonDue = soon.reduce((s, m) => s + (planOf.get(m.plan_id)?.price ?? 0), 0);

  // Who is on the plan being edited, sorted by renewal.
  const selected = draft?.id ? planOf.get(draft.id) ?? null : null;
  const roster = useMemo(() => {
    if (!selected) return [];
    return current.filter((m) => m.plan_id === selected.id && (m.status === 'active' || m.status === 'frozen'))
      .map((m) => {
        const since = mships.filter((x) => x.member_id === m.member_id && x.plan_id === selected.id).map((x) => x.start_date ?? x.created_at).sort()[0] ?? null;
        const paid = payments.filter((p) => p.member_id === m.member_id && p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
        return { m, person: people.get(m.member_id) ?? null, since, paid };
      })
      .filter((r) => r.person) // a missed lookup renders nothing, never a stand-in name
      .sort((a, b) => (a.m.expiry_date ?? '9999').localeCompare(b.m.expiry_date ?? '9999'));
  }, [selected, current, mships, payments, people]);
  const { ref: fitRef, perPage } = useFitRows(6);
  const paged = usePaged(roster, perPage);

  const remind = async (m: MembershipWithPlan, name: string) => {
    const plan = planOf.get(m.plan_id);
    try {
      await notifyUser({
        userId: m.member_id, type: 'membership', title: 'Your membership renews soon',
        message: `${plan?.name ?? 'Your plan'} ends on ${shortDay(m.expiry_date!.slice(0, 10))}. Renew at the front desk to keep your access.`,
        actionUrl: '/member/membership', dedupe: `plan-remind:${m.id}:${today}`,
      });
      setReminded((s) => new Set(s).add(m.id));
      showToast(`${name} has been reminded`, 'success');
    } catch {
      // The dedupe index refuses a second reminder today — that is the guard, not a failure.
      setReminded((s) => new Set(s).add(m.id));
      showToast(`${name} was already reminded today`, 'info');
    }
  };

  /** A price change and taking a plan off sale ask why (owner, 2026-10-28). */
  const [askPrice, setAskPrice] = useState(false);
  const [toRetire, setToRetire] = useState<MembershipPlanRow | null>(null);
  const save = async (why?: string) => {
    if (!draft) return;
    if (!draft.name.trim()) { showToast('Give the plan the name members will see', 'error'); return; }
    if (draft.price.trim() === '' || Number(draft.price) < 0) { showToast('Set a price — ₱0 for a free plan or a trial', 'error'); return; }
    if (draft.lines.length === 0) { showToast('Add at least one line — it is what a member reads when choosing', 'error'); return; }
    const payload = {
      name: draft.name.trim(), tier: draft.tier, price: Number(draft.price), price_unset: false, duration_days: draft.days,
      description: draft.lines.join('\n'), is_active: draft.isActive,
      // A blank limit is unlimited (NULL); a plan that cannot book carries no stale limit.
      can_book_classes: draft.canBookClasses, can_book_pt: draft.canBookPt,
      class_bookings_per_week: draft.canBookClasses && draft.classesPerWeek.trim() !== '' ? Number(draft.classesPerWeek) : null,
      pt_sessions_per_month: draft.canBookPt && draft.ptPerMonth.trim() !== '' ? Number(draft.ptPerMonth) : null,
    };
    const before = draft.id ? plans.find((p) => p.id === draft.id) : null;
    const priceChanged = !!before && Number(before.price) !== payload.price;
    if (priceChanged && !why) { setAskPrice(true); return; }
    setSaving(true);
    try {
      if (draft.id) {
        await updatePlan(draft.id, payload);
        if (priceChanged && why) await recordReason({ action: 'plan.price_changed', subjectType: 'membership_plan', subjectId: draft.id,
          summary: `Changed ${payload.name}'s price from ₱${Number(before!.price).toLocaleString('en-PH')} to ₱${payload.price.toLocaleString('en-PH')}`, reason: why });
        setAskPrice(false);
        showToast(`${payload.name} saved`, 'success');
        await loadData(draft.id);
      } else {
        const made = await createPlan(payload);
        showToast(`${payload.name} is on sale`, 'success');
        await loadData(made.id);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save the plan', 'error');
    } finally {
      setSaving(false);
    }
  };

  /** Retire = off sale; whoever is on it keeps it until it ends. Restore puts it back. */
  const setOnSale = async (p: MembershipPlanRow, on: boolean, why?: string) => {
    try {
      await updatePlan(p.id, { is_active: on });
      if (!on && why) await recordReason({ action: 'plan.off_sale', subjectType: 'membership_plan', subjectId: p.id, summary: `Took ${p.name} off sale`, reason: why });
      setToRetire(null);
      showToast(on ? `${p.name} is on sale again` : `${p.name} is off sale — members on it keep it until it ends`, 'success');
      await loadData(on ? p.id : null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not change that plan', 'error');
    }
  };
  const handleDelete = async (plan: MembershipPlanRow, why?: string) => {
    try {
      const r = await retirePlan(plan.id);
      if (why) await recordReason({ action: 'plan.retired', subjectType: 'membership_plan', subjectId: plan.id,
        summary: `Deleted the plan ${r.planName}${r.moved > 0 ? `; ${r.moved} moved to ${r.movedTo}` : ''}`, reason: why });
      showToast(r.moved > 0 ? `${r.planName} deleted — ${r.moved} moved to ${r.movedTo}` : `${r.planName} deleted`, 'success');
      await loadData();
    } catch (err) {
      // retire_plan raises with a reason (no free plan to fall back to, a claimed trial, not an admin) — show it.
      showToast(err instanceof Error ? err.message : 'Could not delete the plan', 'error');
    }
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const addLine = () => { if (!draft || !newLine.trim()) return; set({ lines: [...draft.lines, newLine.trim()] }); setNewLine(''); };
  const drop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (!draft || dragAt == null || dragAt === to) return;
    const lines = [...draft.lines]; const [x] = lines.splice(dragAt, 1); lines.splice(to, 0, x);
    set({ lines }); setDragAt(null);
  };

  if (loading) return <div className="att"><p className="a-sub">Loading plans…</p></div>;

  const kindTone = (t: PlanTier) => KIND[t][1];
  const customLength = draft && !LENGTHS.some(([d]) => d === draft.days);
  const lines = (p: MembershipPlanRow) => (p.description ?? '').split('\n').filter((l) => l.trim());

  return (
    <div className="att" data-plans>
      <div className="a-head">
        <div className="min-w-0"><h1>Plans</h1><p>What you sell, what each plan unlocks in the app, and who is on it</p></div>
        <nav className="a-tabs" aria-label="Plans views" data-rd-tabs style={{ marginLeft: 'auto' }}>
          <button type="button" className={view === 'sell' ? 'on' : ''} onClick={() => setView('sell')}><Tag size={14} />Plans on sale <em>{onSale.length}</em></button>
          <button type="button" className={view === 'unlock' ? 'on' : ''} onClick={() => setView('unlock')} data-view="unlock"><LockOpen size={14} />What each unlocks</button>
          <button type="button" className={view === 'retired' ? 'on' : ''} onClick={() => setView('retired')} data-view="retired"><Archive size={14} />Retired <em>{retired.length}</em></button>
        </nav>
        <button type="button" className="a-btn violet" onClick={() => { setView('sell'); setDraft({ ...BLANK }); }} data-new-plan><Plus size={15} />New plan</button>
      </div>

      {failed && <div className="a-hint" style={{ flex: 'none' }}><X size={14} /><span>The plans could not be loaded — a connection problem, not an empty catalogue. Reload to try again.</span></div>}
      {!countsAreServerSide && (
        <div className="a-hint" style={{ flex: 'none' }}><Users size={14} /><span>Member counts are tallied in the browser and only recognise memberships marked active — run migration 0062 to count them in the database.</span></div>
      )}

      <div className="a-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', flex: 'none' }} data-plan-tiles>
        <div className="a-card" style={{ padding: '12px 14px' }}>
          <div className="a-lbl">Members on a paid plan</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{paidNow.length}</div><span className="a-sub">of {usable.length} active</span></div>
          <div className="a-stack">
            {paidNow.length > 0 && <i style={{ flex: paidNow.length, background: 'var(--a-p400, #a78bfa)' }} />}
            {freeNow.length > 0 && <i style={{ flex: freeNow.length, background: '#5eead4' }} />}
            {trialNow.length > 0 && <i style={{ flex: trialNow.length, background: 'var(--a-amber, #f59e0b)' }} />}
            {otherNow > 0 && <i style={{ flex: otherNow, background: '#52525b' }} />}
          </div>
          <div className="a-legend">
            <span><span className="a-dot v" />Paid {paidNow.length}</span><span><span className="a-dot" style={{ background: '#5eead4' }} />Free {freeNow.length}</span><span><span className="a-dot a" />Trial {trialNow.length}</span>
          </div>
        </div>
        <div className="a-card" style={{ padding: '12px 14px' }}>
          <div className="a-lbl">Monthly value</div>
          <div className="a-num">{peso(monthly)}</div>
          <div className="a-sub">{paidNow.length} paid membership{paidNow.length === 1 ? '' : 's'}, each price spread over a month — if everyone renews</div>
        </div>
        <div className="a-card" style={{ padding: '12px 14px' }}>
          <div className="a-lbl">Trials that became paid</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <div className="a-num">{conversion.tried ? `${Math.round((conversion.became / conversion.tried) * 100)}%` : '—'}</div>
            <span className="a-sub">{conversion.tried ? `${conversion.became} of ${conversion.tried} whose trial ended` : 'no trial has ended yet'}</span>
          </div>
        </div>
        <div className="a-card" style={{ padding: '12px 14px', borderColor: soon.length ? '#3e310f' : undefined }}>
          <div className="a-lbl" style={{ color: soon.length ? 'var(--a-a300)' : undefined }}>Renewing in 7 days</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><div className="a-num">{soon.length}</div><span className="a-sub">{soon.length ? `${peso(soonDue)} due` : 'nobody'}</span></div>
        </div>
      </div>

      {view === 'sell' && (
        <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px', flex: 1 }}>
          <div className="a-grid" style={{ gridTemplateRows: 'auto minmax(0, 1fr)' }}>
            <div className="a-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', maxHeight: 238, overflowY: 'auto', alignContent: 'start' }} data-plan-cards>
              {onSale.map((p) => {
                const ls = lines(p);
                const n = active[p.id] ?? 0;
                const ending = usable.filter((m) => m.plan_id === p.id && m.expiry_date && m.expiry_date.slice(0, 10) >= today && m.expiry_date.slice(0, 10) <= addDays(today, 7)).length;
                return (
                  <button key={p.id} type="button" className={`a-plan ${draft?.id === p.id ? 'on' : ''}`} onClick={() => setDraft(fromPlan(p))} data-plan-card={p.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, width: '100%' }}>
                      <b className="truncate">{p.name}</b><span className={`a-pill ${kindTone(p.tier)}`}>{KIND[p.tier][0]}</span>
                    </div>
                    {p.price_unset
                      ? <div className="price" style={{ fontSize: 15, color: 'var(--a-a300)' }} data-price-unset>Set a price <small>· members do not see it yet</small></div>
                      : <div className="price">{peso(p.price)} <small>{perWord(p)}</small></div>}
                    <ul>
                      {ls.slice(0, 3).map((l) => <li key={l}><Check size={13} style={{ color: 'var(--a-p300)', flex: 'none', marginTop: 2 }} /><span className="truncate">{l}</span></li>)}
                      {ls.length > 3 && <li className="a-sub">+{ls.length - 3} more</li>}
                      {!p.can_book_pt && <li style={{ color: 'var(--a-muted)' }}><Lock size={13} style={{ flex: 'none', marginTop: 2 }} />1-on-1 coaching</li>}
                      {!p.can_book_classes && <li style={{ color: 'var(--a-muted)' }}><Lock size={13} style={{ flex: 'none', marginTop: 2 }} />Booking classes</li>}
                    </ul>
                    <div className="a-sub" style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--a-border)', width: '100%' }}>
                      {n} on it{(total[p.id] ?? 0) > n ? ` · ${total[p.id]} any status` : ''}
                      {p.price > 0 && n > 0 && p.duration_days ? ` · ${peso((p.price * 30 * n) / p.duration_days)} a month` : ''}
                      {ending > 0 && <span style={{ color: 'var(--a-p300)' }}> · {ending} end this week</span>}
                    </div>
                  </button>
                );
              })}
              <button type="button" className="a-plan" style={{ borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', color: 'var(--a-text2)', textAlign: 'center', minHeight: 150 }}
                onClick={() => setDraft({ ...BLANK })}>
                <Plus size={22} /><b style={{ color: '#fff' }}>New plan</b><span className="a-sub">or open one and press Copy</span>
              </button>
            </div>

            <div className="a-card" data-plan-roster>
              <div className="a-ct"><h3><Users size={16} />{selected ? `Who is on ${selected.name}` : 'Who is on it'}</h3>
                <small>{selected ? `${roster.length} member${roster.length === 1 ? '' : 's'} · sorted by renewal` : 'a new plan has nobody yet'}</small></div>
              <div ref={fitRef} className="a-scroll grow" data-rd-table>
                {roster.length === 0 ? <p className="a-sub" style={{ padding: '10px 0' }}>{selected ? 'Nobody is on this plan right now.' : 'Save the plan, then members can be put on it at the desk.'}</p> : (
                  <table className="a-table">
                    <thead><tr><th>Member</th><th>Since</th><th>Renews</th><th>Paid so far</th><th /></tr></thead>
                    <tbody>
                      {paged.visible.map(({ m, person, since, paid }) => {
                        const exp = m.expiry_date?.slice(0, 10) ?? null;
                        const left = exp ? daysUntil(exp, today) : null;
                        return (
                          <tr key={m.id} data-roster-row>
                            <td><div className="a-who"><Av name={person!.name} photo={person!.photo} small /><b>{person!.name}</b>{m.status === 'frozen' && <span className="a-pill">Frozen</span>}</div></td>
                            <td className="a-sub">{monthYear(since)}</td>
                            <td>{m.never_expires || !exp ? <span className="a-sub">never ends</span> : <><b>{shortDay(exp)}</b> <span className="a-sub" style={{ color: left != null && left <= 3 ? 'var(--a-a300)' : undefined }}>{left! < 0 ? `${-left!} days ago` : left === 0 ? 'today' : `${left} day${left === 1 ? '' : 's'}`}</span></>}</td>
                            <td>{peso(paid)}</td>
                            <td style={{ textAlign: 'right' }}>
                              {exp && left != null && left >= 0 && left <= 7 && (selected?.price ?? 0) > 0 && (
                                <button type="button" className="a-btn soft sm" disabled={reminded.has(m.id)} onClick={() => void remind(m, person!.name)}><Bell size={13} />{reminded.has(m.id) ? 'Reminded' : 'Remind'}</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {paged.totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
                  <span className="a-sub">{(paged.page - 1) * paged.perPage + 1}–{Math.min(paged.total, paged.page * paged.perPage)} of {paged.total}</span>
                  <Pager page={paged.page} pages={paged.totalPages} onPage={paged.setPage} />
                </div>
              )}
            </div>
          </div>

          {draft && (
            <div className="a-card glow" style={{ overflowY: 'auto' }} data-plan-editor>
              <div className="a-ct">
                <h3><Pencil size={16} />{draft.id ? draft.name || 'Untitled plan' : 'New plan'}</h3>
                {draft.id && <button type="button" className="a-btn ghost sm" onClick={() => setDraft({ ...draft, id: null, name: `${draft.name} copy`, isActive: true })}><Copy size={13} />Copy</button>}
              </div>
              <div className="a-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="a-fld" style={{ gridColumn: '1 / -1' }}><label htmlFor="plan-name">Name members see</label>
                  <input id="plan-name" className="a-in" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Premium" /></div>
                <div className="a-fld"><label htmlFor="plan-price">Price (₱)</label>
                  <input id="plan-price" className="a-in" type="number" min="0" value={draft.price} onChange={(e) => set({ price: e.target.value })} placeholder="1500" /></div>
                <div className="a-fld"><span className="l">Kind</span>
                  <div className="a-seg" role="group" aria-label="Kind">
                    {(['free', 'freemium', 'premium'] as PlanTier[]).map((t) => (
                      <button key={t} type="button" className={draft.tier === t ? 'on' : ''} aria-pressed={draft.tier === t} onClick={() => set({ tier: t })} style={{ flex: 1, justifyContent: 'center', padding: '6px 4px' }}>{KIND[t][0]}</button>
                    ))}
                  </div>
                  {draft.tier === 'pro' && <span className="a-sub">Pro was retired — pick Paid to move this plan off it.</span>}
                </div>
              </div>
              {draft.tier === 'freemium' && <div className="a-sub" style={{ marginTop: 6 }}>A trial is one per member; when it ends they move to the free plan.</div>}

              <div className="a-lbl" style={{ margin: '12px 0 6px' }}>Length</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Length">
                {LENGTHS.map(([d, l]) => <button key={l} type="button" className={`a-chip ${draft.days === d ? 'on' : ''}`} aria-pressed={draft.days === d} onClick={() => set({ days: d })}>{l}</button>)}
                {customLength && <span className="a-chip on">{lengthWord(draft.days)}</span>}
              </div>

              <div className="a-lbl" style={{ margin: '12px 0 2px' }}>Booking limits <span style={{ fontWeight: 500 }}>· enforced when a member books</span></div>
              {([['canBookClasses', 'classesPerWeek', 'Classes a week', 'blank = unlimited'], ['canBookPt', 'ptPerMonth', '1-on-1 sessions a month', 'with any coach']] as const).map(([flag, limit, label, hint]) => (
                <div key={flag} className="a-setting" style={{ padding: '8px 0' }}>
                  <button type="button" className={`a-toggle ${draft[flag] ? '' : 'off'}`} aria-pressed={draft[flag]} aria-label={label} onClick={() => set({ [flag]: !draft[flag] } as Partial<Draft>)} />
                  <div className="t"><b>{label}</b><small>{draft[flag] ? hint : 'not on this plan — members see it locked'}</small></div>
                  <input className="a-in" type="number" min="1" style={{ width: 70, textAlign: 'center', padding: 7 }} aria-label={`${label} limit`} disabled={!draft[flag]}
                    value={draft[limit]} placeholder="∞" onChange={(e) => set({ [limit]: e.target.value } as Partial<Draft>)} />
                </div>
              ))}

              <div className="a-lbl" style={{ margin: '12px 0 6px' }}>Lines on the plan card <span style={{ fontWeight: 500 }}>· members read these</span></div>
              <div data-plan-lines>
                {draft.lines.map((l, i) => (
                  <div key={`${i}-${l}`} className="a-row" style={{ padding: '6px 0', opacity: dragAt === i ? 0.4 : 1 }} draggable
                    onDragStart={() => setDragAt(i)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, i)} onDragEnd={() => setDragAt(null)}>
                    <GripVertical size={14} className="a-sub" style={{ cursor: 'grab' }} aria-hidden />
                    <div className="t" style={{ fontSize: 12.5 }}>{l}</div>
                    <button type="button" className="a-link" onClick={() => set({ lines: draft.lines.filter((_, j) => j !== i) })} aria-label={`Remove ${l}`}><X size={14} /></button>
                  </div>
                ))}
              </div>
              <label className="a-input" style={{ padding: '8px 11px', fontSize: 12, marginTop: 6 }}><Plus size={14} />
                <input value={newLine} onChange={(e) => setNewLine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLine(); } }} onBlur={addLine}
                  placeholder="Add a line…" aria-label="Add a line" /></label>

              <div className="a-hint" style={{ marginTop: 12 }}><Smartphone size={14} />
                <span>Members see this plan as <b style={{ color: '#fff' }}>“{draft.name.trim() || 'Untitled'} · {draft.price.trim() === '' ? 'no price yet' : Number(draft.price) === 0 ? 'free' : `${peso(Number(draft.price))} ${draft.days == null ? 'once' : `a ${lengthWord(draft.days).replace(/^1 /, '')}`}`}”</b>
                  {draft.lines.length ? ` with the ${draft.lines.length === 1 ? 'line' : `${draft.lines.length} lines`} above` : ''}, on Renew in the app.</span></div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {selected && (selected.is_active
                  ? <button type="button" className="a-btn ghost" style={{ flex: 1 }} onClick={() => setToRetire(selected)} data-plan-retire><Archive size={15} />Retire</button>
                  : <button type="button" className="a-btn ghost" style={{ flex: 1 }} onClick={() => void setOnSale(selected, true)}><RotateCcw size={15} />Restore</button>)}
                <button type="button" className="a-btn violet" style={{ flex: 2 }} disabled={saving} onClick={() => void save()} data-plan-save>
                  <Check size={15} />{draft.id ? `Save ${draft.name.trim() || 'plan'}` : 'Put it on sale'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'unlock' && (plans.length > 0
        ? <PlanFeatureMatrix plans={onSale} onPlanChanged={() => void loadData(draft?.id)} />
        : <div className="a-card"><p className="a-sub">No plans yet — make one first.</p></div>)}

      {view === 'retired' && (
        <div className="a-card" style={{ flex: 1 }} data-retired>
          <div className="a-ct"><h3><Archive size={16} />Retired plans</h3><small>off sale · members already on one keep it until it ends</small></div>
          <div className="a-scroll grow">
            {retired.length === 0 ? <p className="a-sub" style={{ padding: '10px 0' }}>Nothing is retired. Retire a plan from its editor to take it off sale without touching anyone on it.</p> : (
              <table className="a-table">
                <thead><tr><th>Plan</th><th>Price</th><th>Still on it</th><th /></tr></thead>
                <tbody>
                  {retired.map((p) => (
                    <tr key={p.id} data-retired-row={p.name}>
                      <td><b>{p.name}</b> <span className={`a-pill ${kindTone(p.tier)}`}>{KIND[p.tier][0]}</span></td>
                      <td>{peso(p.price)} <span className="a-sub">{perWord(p)}</span></td>
                      <td>{active[p.id] ?? 0} active{(total[p.id] ?? 0) > (active[p.id] ?? 0) ? <span className="a-sub"> · {total[p.id]} any status</span> : ''}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button type="button" className="a-btn soft sm" onClick={() => void setOnSale(p, true)}><RotateCcw size={13} />Restore</button>{' '}
                        <button type="button" className="a-btn ghost sm" onClick={() => setToDelete(p)}><Trash2 size={13} />Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="a-sub" style={{ paddingTop: 8 }}>Deleting moves every membership on the plan to the free plan first — their dates and status stay; what changes is what the plan lets them do.</div>
        </div>
      )}

      {/* retire_plan() (0062/0063): the confirmation says what happens to real people, because "Delete this plan?" does not. */}
      <ReasonDialog isOpen={askPrice} onClose={() => setAskPrice(false)} title="Change the price"
        message={<>Members who renew from now pay the new price; whoever paid already keeps what they paid for.</>}
        confirmText="Save the new price" quick={['Costs went up', 'A promo', 'Matching other gyms']} onConfirm={(why) => save(why)} />
      <ReasonDialog isOpen={!!toRetire} onClose={() => setToRetire(null)} title="Take the plan off sale"
        message={<>Take <b className="text-white">{toRetire?.name}</b> off sale? Nobody new can buy it; members on it keep it until it ends.</>}
        confirmText="Take it off sale" quick={['Replaced by a new plan', 'Nobody buys it', 'Seasonal plan ended']}
        onConfirm={async (why) => { if (toRetire) await setOnSale(toRetire, false, why); }} />
      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={(why) => { const p = toDelete; setToDelete(null); if (p) void handleDelete(p, why); }} reason={REASON_FIELD}
        title={toDelete ? `Delete ${toDelete.name}` : 'Delete plan'}
        message={toDelete ? ((total[toDelete.id] ?? 0) > 0
          ? `${total[toDelete.id]} membership${total[toDelete.id] === 1 ? '' : 's'} will move to the free plan. They keep their dates and status; what changes is what the plan lets them do.`
          : 'Nobody is on it. It disappears from the catalogue.') : ''}
        confirmText="Delete"
        type="danger"
      />
    </div>
  );
}
