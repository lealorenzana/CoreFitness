import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Gift, Check, X, AlertTriangle, Clock, History, Coins, Package, HandHeart, Pin, Pencil, Star, Eye, EyeOff,
  CalendarClock, Repeat, Sparkles, Trophy, UserPlus, Copy, TrendingUp,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import DatePicker from '../components/ui/DatePicker';
import PhotoPicker from '../components/ui/PhotoPicker';
import EarningRules from '../components/rewards/EarningRules';
import SeasonSection from '../components/SeasonSection';
import ReferralsSection from '../components/ReferralsSection';
import {
  RdHeader, RdCard, StatTile, PageTabs, FilterChips, SearchField, RdSelect, RdButton, Pill, DotMenu, EmptyBlock,
  TableFooter, Initials, RdField, FitBody,
} from '../components/ui/rd';
import { TONE, RD_INPUT, RD_INPUT_STYLE } from '../components/ui/rdTokens';
import { usePaged } from '../hooks/usePaged';
import { showToast } from '../utils/toast';
import { todayKey } from '../utils/dates';
import { supabase } from '../lib/supabaseClient';

/**
 * CORE Points — the reward catalogue and the approval queue (migration 0051).
 *
 * ## Approving is a commitment, so it is admin-only
 *
 * Staff take payments and check people in; both are reversible front-desk
 * transactions. Approving a redemption commits the gym to giving something
 * away, which is the same class of decision as setting a price. Staff can see
 * the queue — they are the ones handing the reward over — but the policy
 * refuses their UPDATE.
 *
 * ## Nothing here can create points
 *
 * There is no "give this member 500 points" button, and the database would
 * refuse one: `point_ledger` has no INSERT policy for any role, including
 * admin. Points come from things members actually did. A gym that wants to be
 * generous adds a cheaper reward, which is recorded and auditable.
 *
 * ## Deciding and handing over (0092, 2026-09-19)
 *
 * Decisions go through `decide_redemption()` — the member is notified either
 * way, and a zero-row decision can no longer read as success. Approved requests
 * wait under **Ready to collect**, where whoever hands the reward over (admin
 * or front desk) marks it with `mark_redemption_collected()`. Each reward also
 * shows how many members are saving for it — the demand the gym could not see
 * before, and the thing to check before hiding one.
 *
 * ## The catalogue (0197, 2026-10-12)
 *
 * A reward has a photo (the gym's own upload — the database refuses any other
 * URL), a category, a featured flag, a last day and a per-member monthly limit;
 * the last two are enforced on the member's request by a trigger. Before 0197 is
 * pasted the page reads the old columns and hides the new fields.
 *
 * ## The screen (2026-10-12)
 *
 * Fits the screen: tiles, one tab bar, and the section in a box that scrolls
 * itself. The catalogue is a grid of photo cards; the form shows the member's
 * card as you type.
 */

interface Reward {
  id: string;
  name: string;
  description: string | null;
  cost_points: number;
  stock: number | null;
  is_active: boolean;
  image_url?: string | null;
  category?: string | null;
  featured?: boolean;
  available_until?: string | null;
  per_member_monthly?: number | null;
}

interface Redemption {
  id: string;
  member_id: string;
  reward_id: string;
  cost_points: number;
  status: string;
  requested_at: string;
  decision_note: string | null;
  /** 0092 — when the desk handed it over. */
  fulfilled_at?: string | null;
  rewards: { name: string } | null;
  member_profiles: { profiles: { first_name: string; last_name: string } | null } | null;
}

interface Stat { this_month: number; all_time: number; points_spent: number }

const emptyForm = {
  id: null as string | null, name: '', description: '', cost_points: '', stock: '',
  image_url: null as string | null, category: '', featured: false, available_until: '', per_member_monthly: '',
};
type Form = typeof emptyForm;
const HISTORY_PER_PAGE = 12;
const OLD_COLUMNS = 'id, name, description, cost_points, stock, is_active';
const NEW_COLUMNS = `${OLD_COLUMNS}, image_url, category, featured, available_until, per_member_monthly`;
const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const LINE = '1px solid rgba(255,255,255,0.06)';

type CatalogueFilter = 'all' | 'live' | 'hidden' | 'out' | 'featured';
type Tab = 'requests' | 'catalogue' | 'earning' | 'season' | 'referrals' | 'history';
const TAB_KEYS: Tab[] = ['requests', 'catalogue', 'earning', 'season', 'referrals', 'history'];

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
const ymdWords = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const ended = (r: Pick<Reward, 'available_until'>) => !!r.available_until && r.available_until < todayKey();
const outOf = (r: Pick<Reward, 'stock'>) => r.stock != null && r.stock <= 0;

/** A reward's picture: its photo, or a tinted card with its initials — never a stock image. */
function RewardArt({ r, size }: { r: Pick<Reward, 'name' | 'image_url'>; size?: number }) {
  const init = r.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  if (size) {
    return r.image_url
      ? <img src={r.image_url} alt="" className="rounded-xl object-cover flex-none" style={{ width: size, height: size }} />
      : <span className="rounded-xl grid place-items-center flex-none font-bold" style={{ width: size, height: size, fontSize: Math.round(size * 0.34),
          background: 'linear-gradient(135deg, rgba(124,58,237,0.45), rgba(245,158,11,0.25))', color: '#EDE9FE' }}>{init || <Gift size={size * 0.4} />}</span>;
  }
  return r.image_url
    ? <img src={r.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
    : (
      <div className="absolute inset-0 grid place-items-center" style={{ background: 'radial-gradient(120% 120% at 0% 0%, rgba(124,58,237,0.5), transparent 60%), radial-gradient(100% 100% at 100% 100%, rgba(245,158,11,0.28), transparent 60%), #17122A' }}>
        <div className="text-center">
          <Gift size={30} style={{ color: '#C4B5FD' }} className="mx-auto" />
          <p className="text-[22px] font-bold mt-1" style={{ color: 'rgba(237,233,254,0.85)' }}>{init}</p>
        </div>
      </div>
    );
}

/** One catalogue card: photo, badges, price, stock, demand. Module-level (never declared in a render body). */
function RewardCard({ r, saving, stat, busy, hasExtras, onEdit, onToggle, onRestock, onDuplicate, onFeature }: {
  r: Reward; saving: number; stat: Stat | undefined; busy: boolean; hasExtras: boolean;
  onEdit: () => void; onToggle: () => void; onRestock: (n: number) => void; onDuplicate: () => void; onFeature: () => void;
}) {
  const out = outOf(r);
  const gone = ended(r);
  return (
    <RdCard className="overflow-hidden flex flex-col" style={{ opacity: r.is_active ? 1 : 0.6 }} data-reward-card={r.name}>
      <div className="relative" style={{ aspectRatio: '16 / 10' }}>
        <RewardArt r={r} />
        <div className="absolute top-2.5 left-2.5 flex gap-1.5 flex-wrap">
          {r.featured && <span className="h-7 px-2.5 rounded-full text-[12px] font-semibold inline-flex items-center gap-1" style={{ background: 'rgba(245,158,11,0.9)', color: '#1A1205' }}><Star size={12} fill="currentColor" /> Featured</span>}
          {!r.is_active && <span className="h-7 px-2.5 rounded-full text-[12px] font-semibold inline-flex items-center gap-1 text-white" style={{ background: 'rgba(0,0,0,0.6)' }}><EyeOff size={12} /> Hidden</span>}
          {gone && <span className="h-7 px-2.5 rounded-full text-[12px] font-semibold inline-flex items-center text-white" style={{ background: 'rgba(0,0,0,0.6)' }}>Ended</span>}
        </div>
        <div className="absolute top-2 right-2">
          <DotMenu label={`More for ${r.name}`} items={[
            { label: 'Edit', icon: Pencil, onClick: onEdit },
            { label: r.featured ? 'Stop featuring' : 'Feature it', icon: Star, onClick: onFeature, hidden: !hasExtras },
            { label: 'Duplicate', icon: Copy, onClick: onDuplicate },
            { label: r.is_active ? 'Hide from members' : 'Show to members', icon: r.is_active ? EyeOff : Eye, onClick: onToggle, tone: r.is_active ? 'warn' : undefined },
          ]} />
        </div>
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-semibold text-white truncate">{r.name}</p>
            {r.description && <p className="text-[12.5px] mt-0.5 line-clamp-2" style={{ color: SECOND }}>{r.description}</p>}
          </div>
          <button type="button" onClick={onEdit} aria-label={`Edit ${r.name}`} data-tip="Edit"
            className="w-8 h-8 rounded-lg grid place-items-center flex-none hover:bg-white/[0.06]" style={{ color: MUTED, border: LINE }}>
            <Pencil size={14} />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[15px] font-bold" style={{ color: '#C4B5FD' }}><Coins size={15} />{r.cost_points.toLocaleString('en-PH')} pts</span>
          {r.category && <Pill tone="gray">{r.category}</Pill>}
        </div>
        <div className="flex items-center gap-2 text-[12.5px]" style={{ color: out ? TONE.amber.fg : SECOND }}>
          <Package size={14} />
          {/* NULL stock is unlimited. 0 is out of stock, and says so. */}
          <span>{r.stock == null ? 'Unlimited' : out ? 'Out of stock' : `${r.stock} left`}</span>
          {r.stock != null && (
            <span className="ml-auto flex gap-1">
              {[1, 5].map((n) => (
                <button key={n} type="button" disabled={busy} onClick={() => onRestock(n)} aria-label={`Add ${n} to ${r.name}`}
                  className="h-7 px-2 rounded-lg text-[12px] font-semibold hover:bg-white/[0.06] disabled:opacity-50" style={{ border: LINE, color: 'var(--color-text-primary)' }}>
                  +{n}
                </button>
              ))}
            </span>
          )}
        </div>
        {(r.available_until || r.per_member_monthly) && (
          <div className="flex flex-col gap-1 text-[12px]" style={{ color: MUTED }}>
            {r.available_until && <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} />{gone ? 'Ended' : 'Until'} {ymdWords(r.available_until)}</span>}
            {r.per_member_monthly && <span className="inline-flex items-center gap-1.5"><Repeat size={13} />{r.per_member_monthly} a member a month</span>}
          </div>
        )}
        <div className="mt-auto pt-2 flex items-center gap-3 text-[12px]" style={{ borderTop: LINE }}>
          {/* Demand (0092): members who pinned it on their Rewards screen. */}
          <span className="inline-flex items-center gap-1" style={{ color: saving > 0 ? TONE.amber.fg : MUTED }}><Pin size={12} /> {saving} saving for this</span>
          {stat && <span className="ml-auto tabular-nums" style={{ color: MUTED }} data-tip="Asked for this month · all time">{stat.this_month} this month · {stat.all_time} all</span>}
        </div>
      </div>
    </RdCard>
  );
}

/** What a member will see, as the owner types. */
function MemberPreview({ f }: { f: Form }) {
  const cost = Number(f.cost_points) || 0;
  return (
    <div>
      <span className="block text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>In the members&rsquo; app</span>
      <div className="rounded-2xl overflow-hidden" style={{ border: LINE, background: 'var(--color-surface)' }}>
        <div className="relative" style={{ aspectRatio: '16 / 10' }}>
          <RewardArt r={{ name: f.name || 'Reward', image_url: f.image_url }} />
          {f.featured && <span className="absolute top-2 left-2 h-6 px-2 rounded-full text-[11px] font-semibold inline-flex items-center gap-1" style={{ background: 'rgba(245,158,11,0.9)', color: '#1A1205' }}><Star size={11} fill="currentColor" /> Featured</span>}
        </div>
        <div className="p-3">
          <p className="text-[14px] font-semibold text-white truncate">{f.name || 'Reward name'}</p>
          {f.description && <p className="text-[12px] line-clamp-2" style={{ color: SECOND }}>{f.description}</p>}
          <p className="text-[13px] font-bold mt-1.5" style={{ color: '#C4B5FD' }}>{cost ? `${cost.toLocaleString('en-PH')} points` : '— points'}</p>
          {(f.available_until || f.per_member_monthly) && (
            <p className="text-[11.5px] mt-1" style={{ color: MUTED }}>
              {f.available_until ? `Until ${ymdWords(f.available_until)}` : ''}{f.available_until && f.per_member_monthly ? ' — ' : ''}
              {f.per_member_monthly ? `${f.per_member_monthly} a month each` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The right-hand column on every Rewards tab (2026-10-25): what the month has
 * cost, what members are saving for, and what is running out — read from the
 * catalogue, 0092's wishlist and reward_stats. Each line is a real count.
 */
function InsightRail({ rewards, wishlist, stats, spentThisMonth, onOpen, onRestock }: {
  rewards: Reward[]; wishlist: Map<string, number> | null; stats: Map<string, Stat>; spentThisMonth: number;
  onOpen: () => void; onRestock: (r: Reward) => void;
}) {
  const wanted = wishlist ? rewards.filter((r) => r.is_active).map((r) => ({ r, n: wishlist.get(r.id) ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5) : [];
  const top = Math.max(1, ...wanted.map((x) => x.n));
  const low = rewards.filter((r) => r.is_active && r.stock != null && r.stock <= 3).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0)).slice(0, 5);
  const pointsAll = [...stats.values()].reduce((n, x) => n + x.points_spent, 0);
  const cheapest = rewards.filter((r) => r.is_active).sort((a, b) => a.cost_points - b.cost_points)[0];
  const head = (Icon: typeof Gift, title: string) => (
    <div className="flex items-center gap-2 mb-2.5"><Icon size={17} style={{ color: TONE.violet.fg }} /><h3 className="text-[15px] font-semibold text-white">{title}</h3></div>
  );
  return (
    <>
      <RdCard className="p-4" data-rail-month>
        {head(Sparkles, 'This month')}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: LINE }}>
            <p className="text-[12px]" style={{ color: SECOND }}>Requests</p>
            <p className="text-[20px] font-bold text-white tabular-nums">{stats.size ? spentThisMonth : '—'}</p>
            <p className="text-[11.5px]" style={{ color: MUTED }}>declined left out</p>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: LINE }}>
            <p className="text-[12px]" style={{ color: SECOND }}>Points spent</p>
            <p className="text-[20px] font-bold tabular-nums" style={{ color: '#C4B5FD' }}>{stats.size ? pointsAll.toLocaleString('en-PH') : '—'}</p>
            <p className="text-[11.5px]" style={{ color: MUTED }}>on rewards, all time</p>
          </div>
        </div>
        {cheapest && <p className="text-[12px] mt-2.5" style={{ color: MUTED }}>Cheapest reward: <span className="text-white">{cheapest.name}</span>, {cheapest.cost_points.toLocaleString('en-PH')} points.</p>}
      </RdCard>
      <RdCard className="p-4" data-rail-wanted>
        {head(TrendingUp, 'Most wanted')}
        {wishlist === null ? <p className="text-[12.5px]" style={{ color: MUTED }}>Saving-for counts need migration 0092.</p>
          : wanted.length === 0 ? <p className="text-[12.5px]" style={{ color: MUTED }}>Nobody has pinned a reward to save for yet. Members pin one on their Rewards screen.</p>
          : wanted.map(({ r, n }) => (
            <button key={r.id} type="button" onClick={onOpen} className="w-full flex items-center gap-2.5 py-1.5 text-left">
              <RewardArt r={r} size={34} />
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-2 text-[13px]"><span className="text-white truncate">{r.name}</span><span className="tabular-nums" style={{ color: TONE.amber.fg }}>{n}</span></span>
                <span className="block h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <span className="block h-full rounded-full" style={{ width: `${(n / top) * 100}%`, background: 'linear-gradient(90deg,#6D28D9,#8B5CF6)' }} />
                </span>
              </span>
            </button>
          ))}
        {wanted.length > 0 && <p className="text-[11.5px] mt-2" style={{ color: MUTED }}>Members saving for each — check before you hide or reprice one.</p>}
      </RdCard>
      <RdCard className="p-4" style={{ flexGrow: 1 }} data-rail-low>
        {head(Package, 'Running low')}
        {low.length === 0 ? <p className="text-[12.5px]" style={{ color: MUTED }}>Nothing on sale has 3 or fewer left.</p>
          : low.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 py-1.5">
              <RewardArt r={r} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-white truncate">{r.name}</span>
                <span className="block text-[12px]" style={{ color: outOf(r) ? TONE.amber.fg : MUTED }}>{outOf(r) ? 'Out of stock' : `${r.stock} left`}</span>
              </span>
              <RdButton size="sm" variant="ghost" onClick={() => onRestock(r)}>Restock</RdButton>
            </div>
          ))}
      </RdCard>
    </>
  );
}

export default function Rewards() {
  // One section at a time; the tab lives in the address, so a link or a reload lands where you were.
  const [params, setParams] = useSearchParams();
  const tab = (TAB_KEYS.includes(params.get('tab') as Tab) ? params.get('tab') : 'requests') as Tab;
  const setTab = (t: Tab) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', t); return n; }, { replace: true });
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [queue, setQueue] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** 0197 is live: photos, categories, featured, last day, monthly limit. */
  const [hasExtras, setHasExtras] = useState(false);
  const [stats, setStats] = useState<Map<string, Stat>>(new Map());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CatalogueFilter>('all');
  const [category, setCategory] = useState('');
  /** The request being rejected, and the reason typed for it. */
  const [rejecting, setRejecting] = useState<Redemption | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [toApprove, setToApprove] = useState<Redemption | null>(null);
  /** reward id → members saving for it (0092). Null before it is live. */
  const [wishlist, setWishlist] = useState<Map<string, number> | null>(null);

  /** Fetch and apply. `loading` is owned by the caller, so this is safe to
   *  call again from a button without flashing the whole screen away. */
  const load = async () => {
    let r = await supabase.from('rewards').select(NEW_COLUMNS).order('cost_points');
    const extras = !r.error;
    if (r.error) r = await supabase.from('rewards').select(OLD_COLUMNS).order('cost_points') as typeof r;
    const q = await supabase.from('reward_redemptions')
      .select('*, rewards(name), member_profiles(profiles(first_name, last_name))')
      .order('requested_at', { ascending: false })
      .limit(200);
    if (r.error || q.error) {
      setFailed(true);
    } else {
      setRewards((r.data ?? []) as Reward[]);
      setQueue((q.data ?? []) as unknown as Redemption[]);
      setHasExtras(extras);
      setFailed(false);
    }
    const w = await supabase.rpc('reward_wishlist_counts');
    setWishlist(w.error ? null : new Map(((w.data ?? []) as { reward_id: string; members: number }[])
      .map((x) => [x.reward_id, x.members])));
    const s = await supabase.rpc('reward_stats');
    setStats(s.error ? new Map() : new Map(((s.data ?? []) as (Stat & { reward_id: string })[]).map((x) => [x.reward_id, x])));
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (!alive) return;
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const openForm = (f: Form) => { setForm(f); setAdding(true); };
  const editForm = (r: Reward): Form => ({
    id: r.id, name: r.name, description: r.description ?? '', cost_points: String(r.cost_points),
    stock: r.stock == null ? '' : String(r.stock), image_url: r.image_url ?? null, category: r.category ?? '',
    featured: !!r.featured, available_until: r.available_until ?? '', per_member_monthly: r.per_member_monthly ? String(r.per_member_monthly) : '',
  });

  const saveReward = async () => {
    const cost = Number(form.cost_points);
    if (!form.name.trim() || !Number.isFinite(cost) || cost <= 0) {
      showToast('Name and a positive point cost are required', 'error');
      return;
    }
    const limit = form.per_member_monthly.trim() === '' ? null : Number(form.per_member_monthly);
    if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) { showToast('The monthly limit is a whole number above 0, or blank for none', 'error'); return; }
    const row: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      cost_points: cost,
      // Blank means unlimited, which the column stores as NULL. 0 would mean
      // "out of stock forever", which is a different thing entirely.
      stock: form.stock.trim() === '' ? null : Number(form.stock),
    };
    if (hasExtras) {
      Object.assign(row, {
        image_url: form.image_url, category: form.category.trim() || null, featured: form.featured,
        available_until: form.available_until || null, per_member_monthly: limit,
      });
    }
    setBusy('add');
    const res = form.id
      ? await supabase.from('rewards').update(row).eq('id', form.id).select('id')
      : await supabase.from('rewards').insert(row).select('id');
    setBusy(null);
    if (res.error) { showToast(res.error.message, 'error'); return; }
    // A zero-row update reports success (CLAUDE.md): only an admin may edit rewards.
    if (!res.data || res.data.length === 0) { showToast('That reward was not changed — only an admin can edit the catalogue.', 'error'); return; }
    showToast(form.id ? 'Reward saved' : 'Reward added', 'success');
    setForm(emptyForm);
    setAdding(false);
    await load();
  };

  const patch = async (rw: Reward, change: Partial<Reward>, done: string) => {
    setBusy(rw.id);
    const { data, error } = await supabase.from('rewards').update(change).eq('id', rw.id).select('id');
    setBusy(null);
    if (error || !data || data.length === 0) { showToast(error?.message ?? 'Only an admin can change the catalogue', 'error'); return false; }
    showToast(done, 'success');
    await load();
    return true;
  };

  /** Restock: adds to what is on the shelf; a reward with unlimited stock has nothing to add to. */
  const restock = (rw: Reward, add: number) => {
    if (rw.stock == null) return;
    void patch(rw, { stock: rw.stock + add }, `${rw.name}: ${rw.stock + add} in stock`);
  };

  /**
   * The decision write. decide_redemption (0092): admin-only, stamps who and
   * when, refuses a request already decided, and notifies the member either way.
   */
  const decide = async (row: Redemption, status: 'approved' | 'rejected', note: string) => {
    setBusy(row.id);
    let { error } = await supabase.rpc('decide_redemption', { p_id: row.id, p_status: status, p_note: note || null });
    // Before 0092 is pasted the function does not exist (PGRST202): fall back
    // to 0051's direct update — admin-only by RLS — with the zero-row check.
    if (error?.code === 'PGRST202') {
      const { data: me } = await supabase.auth.getUser();
      const res = await supabase.from('reward_redemptions')
        .update({ status, decided_by: me.user?.id ?? null, decided_at: new Date().toISOString(), decision_note: note || null })
        .eq('id', row.id).eq('status', 'pending').select('id');
      error = res.error ?? (!res.data || res.data.length === 0
        ? { message: 'That request was not changed — it may already be decided.' } as typeof error : null);
    }
    setBusy(null);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(status === 'approved' ? 'Approved — the member has been told to collect it' : 'Rejected — the member has been told why', 'success');
    await load();
  };

  /** The reward left the desk — the member's app says Collected from now on. */
  const handOver = async (row: Redemption) => {
    setBusy(row.id);
    const { error } = await supabase.rpc('mark_redemption_collected', { p_id: row.id });
    setBusy(null);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Marked as collected', 'success');
    await load();
  };

  const toggleReward = async (r: Reward) => {
    const ok = await patch(r, { is_active: !r.is_active }, r.is_active ? `${r.name} is hidden from members` : `${r.name} is back in the catalogue`);
    const saving = wishlist?.get(r.id) ?? 0;
    if (ok && r.is_active && saving > 0) {
      showToast(`${saving} member${saving === 1 ? ' was' : 's were'} saving for it — it drops off their target.`, 'info');
    }
  };

  const memberName = (row: Redemption) => {
    const p = row.member_profiles?.profiles;
    return p ? `${p.first_name} ${p.last_name}` : 'Member';
  };
  const rewardOf = (row: Redemption) => rewards.find((x) => x.id === row.reward_id);

  const pending = useMemo(() => queue.filter((q) => q.status === 'pending'), [queue]);
  const ready = useMemo(() => queue.filter((q) => q.status === 'approved'), [queue]);
  const decided = useMemo(() => queue.filter((q) => q.status !== 'pending'), [queue]);
  const categories = useMemo(() => [...new Set(rewards.map((r) => r.category).filter((c): c is string => !!c))].sort(), [rewards]);

  const catalogue = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rewards.filter((r) => {
      if (filter === 'live' && !r.is_active) return false;
      if (filter === 'hidden' && r.is_active) return false;
      if (filter === 'out' && !outOf(r)) return false;
      if (filter === 'featured' && !r.featured) return false;
      if (category && r.category !== category) return false;
      if (q && !r.name.toLowerCase().includes(q) && !(r.description ?? '').toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || Number(b.is_active) - Number(a.is_active) || a.cost_points - b.cost_points);
  }, [rewards, search, filter, category]);

  const history = usePaged(decided, HISTORY_PER_PAGE);
  const liveCount = rewards.filter((r) => r.is_active).length;
  const outCount = rewards.filter((r) => r.is_active && outOf(r)).length;
  const spentThisMonth = [...stats.values()].reduce((s, x) => s + x.this_month, 0);

  if (loading) {
    return <div className="text-sm" style={{ color: MUTED }}>Loading rewards…</div>;
  }

  if (failed) {
    return (
      <RdCard className="p-6 flex items-start gap-3">
        <AlertTriangle size={20} style={{ color: TONE.amber.fg }} />
        <div>
          <p className="text-[16px] font-semibold text-white">Rewards could not be loaded</p>
          <p className="text-[13.5px] mt-1" style={{ color: SECOND }}>A connection problem, not an empty catalogue — no request has been missed. Reload to try again.</p>
        </div>
      </RdCard>
    );
  }

  const requestRow = (row: Redemption, kind: 'pending' | 'ready') => {
    const rw = rewardOf(row);
    const out = kind === 'pending' && !!rw && outOf(rw);
    return (
      <div key={row.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.045)' }} data-request-row>
        {rw ? <RewardArt r={rw} size={52} /> : <Initials name={memberName(row)} size={52} />}
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-white truncate">{row.rewards?.name ?? 'Reward'}</p>
          <p className="text-[12.5px] truncate" style={{ color: SECOND }}>
            {memberName(row)} — {row.cost_points.toLocaleString('en-PH')} points, asked {shortDate(row.requested_at)}
          </p>
          {out && <p className="text-[12px] mt-0.5" style={{ color: TONE.amber.fg }}>Out of stock — restock it under Catalogue, or decline.</p>}
        </div>
        {kind === 'pending' ? (
          <div className="flex gap-1.5 flex-none">
            <RdButton size="sm" variant="primary" icon={Check} onClick={() => setToApprove(row)} disabled={busy === row.id || out}>Approve</RdButton>
            <RdButton size="sm" variant="ghost" icon={X} onClick={() => { setRejecting(row); setRejectNote(''); }} disabled={busy === row.id}>Decline</RdButton>
          </div>
        ) : (
          <RdButton size="sm" variant="amber" icon={HandHeart} onClick={() => void handOver(row)} disabled={busy === row.id}>Handed over</RdButton>
        )}
      </div>
    );
  };

  const boxHead = (icon: typeof Gift, title: string, sub: string, count?: number, tone: 'violet' | 'amber' = 'violet') => {
    const Icon = icon;
    return (
      <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: LINE }}>
        <Icon size={20} style={{ color: TONE[tone].fg }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold text-white">{title}</h2>
          <p className="text-[12.5px]" style={{ color: SECOND }}>{sub}</p>
        </div>
        {count ? <Pill tone={tone}>{count}</Pill> : null}
      </div>
    );
  };

  return (
    <div className="rd-fit" data-rewards>
      <RdHeader title="Rewards" subtitle="What members can spend their CORE Points on, and who is waiting on you."
        actions={<>
          <PageTabs<Tab> label="Rewards sections" value={tab} onChange={setTab} tabs={[
            { key: 'requests', label: 'Requests', count: pending.length + ready.length, icon: Clock },
            { key: 'catalogue', label: 'Catalogue', icon: Gift },
            { key: 'earning', label: 'How members earn', icon: Coins },
            { key: 'season', label: 'Monthly season', icon: Trophy },
            { key: 'referrals', label: 'Referrals', icon: UserPlus },
            { key: 'history', label: 'History', icon: History },
          ]} />
          <RdButton variant="primary" icon={Plus} onClick={() => openForm(emptyForm)}>Add reward</RdButton>
        </>} />

      <div className="rd-tiles-rail">
        <StatTile compact icon={Clock} tone={pending.length ? 'amber' : 'violet'} label="Waiting" value={pending.length} sub="for your decision" onClick={() => setTab('requests')} />
        <StatTile compact icon={HandHeart} label="Ready to collect" value={ready.length} sub="at the front desk" onClick={() => setTab('requests')} />
        <StatTile compact icon={Gift} label="Live rewards" value={liveCount} sub={`${rewards.length - liveCount} hidden`} onClick={() => { setFilter('live'); setTab('catalogue'); }} />
        <StatTile compact icon={Package} tone={outCount ? 'amber' : 'violet'} label="Out of stock" value={outCount} sub="needs restocking" onClick={() => { setFilter('out'); setTab('catalogue'); }} />
      </div>

      <FitBody rail={<InsightRail rewards={rewards} wishlist={wishlist} stats={stats} spentThisMonth={spentThisMonth}
        onOpen={() => setTab('catalogue')} onRestock={(r) => { setFilter('all'); setSearch(r.name); setTab('catalogue'); }} />}>
      {tab === 'requests' && (
        // One card, the queue first and what waits at the desk under it — two half-empty columns read as nothing to do.
        <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-requests>
          <div className="rd-fit-scroll">
            <div data-waiting>
              {boxHead(Clock, 'Waiting for you', 'Approving agrees to hand it over and drops the stock by one; the points are already spent', pending.length, 'amber')}
              {pending.length === 0
                ? <EmptyBlock compact icon={Check} title="Nothing to approve" body="Requests land here the moment a member spends their points." />
                : pending.map((row) => requestRow(row, 'pending'))}
            </div>
            {/* Approved, waiting at the desk. Whoever hands it over marks it; the member's app then says Collected. */}
            <div data-ready>
              {boxHead(HandHeart, 'Ready to collect', 'Mark it when it leaves the desk', ready.length)}
              {ready.length === 0
                ? <EmptyBlock compact icon={HandHeart} title="Nothing waiting at the desk" body="Approved rewards wait here until they are handed over." />
                : ready.map((row) => requestRow(row, 'ready'))}
            </div>
          </div>
        </RdCard>
      )}

      {tab === 'catalogue' && (
        <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-catalogue>
          <div className="flex items-center gap-2.5 flex-wrap px-4 py-3" style={{ borderBottom: LINE }}>
            <div className="flex-1 min-w-[220px] max-w-[360px]"><SearchField value={search} onChange={setSearch} placeholder="Search rewards" /></div>
            <FilterChips<CatalogueFilter> compact value={filter} onChange={setFilter} items={[
              { key: 'all', label: 'All', count: rewards.length },
              { key: 'live', label: 'Live', count: liveCount },
              { key: 'hidden', label: 'Hidden', count: rewards.length - liveCount },
              { key: 'out', label: 'Out of stock', count: outCount, tone: outCount ? 'amber' : undefined },
              ...(hasExtras ? [{ key: 'featured' as const, label: 'Featured', count: rewards.filter((r) => r.featured).length }] : []),
            ]} />
            {categories.length > 0 && (
              <RdSelect value={category} onChange={setCategory} label="Category" className="w-[170px]">
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </RdSelect>
            )}
          </div>
          <div className="rd-fit-scroll p-4">
            {rewards.length === 0 ? (
              <EmptyBlock icon={Gift} title="No rewards yet" body="Members are already earning points — they just have nothing to spend them on."
                action={<RdButton variant="primary" icon={Plus} onClick={() => openForm(emptyForm)}>Add the first one</RdButton>} />
            ) : catalogue.length === 0 ? (
              <EmptyBlock compact icon={Gift} title="Nothing matches" body="No reward matches that search and filter." />
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
                {catalogue.map((r) => (
                  <RewardCard key={r.id} r={r} saving={wishlist?.get(r.id) ?? 0} stat={stats.get(r.id)} busy={busy === r.id} hasExtras={hasExtras}
                    onEdit={() => openForm(editForm(r))}
                    onDuplicate={() => openForm({ ...editForm(r), id: null, name: `${r.name} (copy)` })}
                    onToggle={() => void toggleReward(r)}
                    onFeature={() => void patch(r, { featured: !r.featured }, r.featured ? `${r.name} is no longer featured` : `${r.name} is featured`)}
                    onRestock={(n) => restock(r, n)} />
                ))}
              </div>
            )}
          </div>
        </RdCard>
      )}

      {/* How points are earned (0051's point_rules, 0159's two more) — admin-only by RLS. */}
      {tab === 'earning' && <EarningRules />}
      {/* The monthly season (0123): tiers and the rewards waiting at the desk. */}
      {tab === 'season' && <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-season-tab><div className="rd-fit-scroll p-4"><SeasonSection isAdmin /></div></RdCard>}
      {/* Who brought whom (0125). */}
      {tab === 'referrals' && <ReferralsSection />}

      {tab === 'history' && (
        <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-history>
          {boxHead(History, 'Already decided', 'Approved, declined and collected requests', decided.length)}
          <div className="rd-fit-scroll">
            {decided.length === 0 ? <EmptyBlock compact icon={History} title="No decisions yet" body="Approved, declined and collected requests are kept here." />
              : history.visible.map((row) => {
                const tone = row.status === 'rejected' ? 'amber' : row.status === 'fulfilled' ? 'green' : 'violet';
                const rw = rewardOf(row);
                return (
                  <div key={row.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
                    {rw ? <RewardArt r={rw} size={36} /> : <Gift size={18} style={{ color: MUTED }} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-white truncate">{memberName(row)} — {row.rewards?.name ?? 'Reward'}</p>
                      {row.decision_note && <p className="text-[12px] truncate" style={{ color: MUTED }}>&ldquo;{row.decision_note}&rdquo;</p>}
                    </div>
                    <span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{row.cost_points.toLocaleString('en-PH')} pts</span>
                    <Pill tone={tone}>
                      {row.status === 'fulfilled'
                        ? `Collected${row.fulfilled_at ? ` ${shortDate(row.fulfilled_at)}` : ''}`
                        : row.status === 'approved' ? 'Ready' : row.status === 'rejected' ? 'Declined' : row.status}
                    </Pill>
                  </div>
                );
              })}
          </div>
          <div style={{ borderTop: LINE }}>
            <TableFooter page={history.page} perPage={history.perPage} total={history.total} noun="decisions" onPage={history.setPage} />
          </div>
        </RdCard>
      )}

      </FitBody>

      {/* ── Add or edit a reward, with the member's card beside the form ── */}
      <Modal
        isOpen={adding}
        onClose={() => { setAdding(false); setForm(emptyForm); }}
        title={form.id ? 'Edit reward' : 'Add a reward'}
        subtitle={form.id ? 'Members see the change at once; requests already made keep their price' : 'What a member can turn their points into'}
        onConfirm={() => void saveReward()}
        confirmLabel={busy === 'add' ? 'Saving…' : form.id ? 'Save' : 'Add reward'}
        confirmDisabled={busy === 'add' || uploading || !form.name.trim() || !form.cost_points.trim()}
        size="lg"
      >
        <div className="grid gap-5" style={{ gridTemplateColumns: hasExtras ? 'minmax(0, 1.35fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
          <div className="space-y-3.5">
            <RdField label="Reward">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. One free week" className={RD_INPUT} style={RD_INPUT_STYLE} />
            </RdField>
            <RdField label="Description">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                placeholder="What the member gets" className={`${RD_INPUT} h-auto py-2.5 resize-none`} style={RD_INPUT_STYLE} />
            </RdField>
            <div className="grid grid-cols-2 gap-3">
              <RdField label="Points">
                <input value={form.cost_points} onChange={(e) => setForm({ ...form, cost_points: e.target.value })} placeholder="500" inputMode="numeric" className={RD_INPUT} style={RD_INPUT_STYLE} />
              </RdField>
              <RdField label="Stock" hint="Blank = unlimited. It drops only when you approve.">
                <input value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="Leave blank for ∞" inputMode="numeric" className={RD_INPUT} style={RD_INPUT_STYLE} />
              </RdField>
            </div>
            {hasExtras && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <RdField label="Category">
                    <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} list="reward-categories" maxLength={40}
                      placeholder="e.g. Drinks" className={RD_INPUT} style={RD_INPUT_STYLE} />
                    <datalist id="reward-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                  </RdField>
                  <RdField label="Limit a member a month" hint="Blank = no limit. Declined requests do not count.">
                    <input value={form.per_member_monthly} onChange={(e) => setForm({ ...form, per_member_monthly: e.target.value })} placeholder="No limit" inputMode="numeric" className={RD_INPUT} style={RD_INPUT_STYLE} />
                  </RdField>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <span className="block text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>Last day (optional)</span>
                    <DatePicker mode="future" value={form.available_until} onChange={(v) => setForm({ ...form, available_until: v })} placeholder="No end" />
                    {form.available_until && <button type="button" className="text-[12px] mt-1" style={{ color: MUTED }} onClick={() => setForm({ ...form, available_until: '' })}>Clear the last day</button>}
                  </div>
                  <label className="h-11 px-3.5 rounded-xl flex items-center gap-2.5 cursor-pointer" style={RD_INPUT_STYLE}>
                    <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} className="accent-amber-500" />
                    <Star size={15} style={{ color: TONE.amber.fg }} />
                    <span className="text-[14px] text-white">Feature it first</span>
                  </label>
                </div>
              </>
            )}
          </div>
          {hasExtras && (
            <div className="space-y-4">
              <PhotoPicker value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} onBusy={setUploading} aspect="16 / 10" />
              <MemberPreview f={form} />
            </div>
          )}
        </div>
      </Modal>

      {/* ── Rejecting: the member reads this, so it is written properly ── */}
      <Modal
        isOpen={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Decline this request"
        subtitle={rejecting ? `${memberName(rejecting)} — ${rejecting.rewards?.name ?? 'Reward'}` : undefined}
        size="sm"
        footer={
          <>
            <RdButton variant="ghost" onClick={() => setRejecting(null)}>Keep it waiting</RdButton>
            <RdButton variant="amber"
              disabled={!!busy || !rejectNote.trim()}
              onClick={async () => {
                const row = rejecting;
                if (!row) return;
                setRejecting(null);
                await decide(row, 'rejected', rejectNote.trim());
              }}>
              Decline
            </RdButton>
          </>
        }
      >
        <RdField label="Why — the member reads this" hint="Needed — a decline with no reason reads as a mistake. The member keeps their points.">
          <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3}
            placeholder="e.g. Out of stock this month — try again in April."
            className={`${RD_INPUT} h-auto py-2.5 resize-none`} style={RD_INPUT_STYLE} />
        </RdField>
      </Modal>

      {/* Approving hands something over and drops stock, so it asks first. */}
      <ConfirmDialog
        isOpen={!!toApprove}
        onClose={() => setToApprove(null)}
        onConfirm={() => { if (toApprove) void decide(toApprove, 'approved', ''); }}
        title="Approve this redemption"
        message={
          toApprove
            ? `${memberName(toApprove)} gets “${toApprove.rewards?.name ?? 'the reward'}” for ${toApprove.cost_points} points. ` +
              `Their points are already spent; approving is you agreeing to hand it over, and it drops the stock by one.`
            : ''
        }
        confirmText="Approve"
        type="info"
      />
    </div>
  );
}
