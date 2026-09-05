import { useEffect, useMemo, useState } from 'react';
import { Plus, Gift, Check, X, AlertTriangle, Clock, History, Coins, Package } from 'lucide-react';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  PageHeader, StatTiles, Section, EmptyState, CardGrid, TileCard,
  SearchBox, Chips, Toolbar, PageSummary,
} from '../components/ui/kit';
import { usePaged } from '../hooks/usePaged';
import { showToast } from '../utils/toast';
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
 * ## The screen
 *
 * Three stacked full-width panels, two of which existed only to say "nothing
 * here" — on a gym with no rewards yet that was most of the page. Now: the
 * queue leads because someone is waiting on it, the catalogue is a grid of
 * fixed-width tiles, and history is paged behind a toggle rather than a fourth
 * panel. Adding a reward and rejecting a request both float above the page;
 * the add form used to unfold between the queue and the catalogue and push
 * both of them down.
 */

interface Reward {
  id: string;
  name: string;
  description: string | null;
  cost_points: number;
  stock: number | null;
  is_active: boolean;
}

interface Redemption {
  id: string;
  member_id: string;
  cost_points: number;
  status: string;
  requested_at: string;
  decision_note: string | null;
  rewards: { name: string } | null;
  member_profiles: { profiles: { first_name: string; last_name: string } | null } | null;
}

const emptyForm = { name: '', description: '', cost_points: '', stock: '' };
const HISTORY_PER_PAGE = 8;

type CatalogueFilter = 'all' | 'live' | 'hidden';

export default function Rewards() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [queue, setQueue] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CatalogueFilter>('all');
  const [showHistory, setShowHistory] = useState(false);
  /** The request being rejected, and the reason typed for it. */
  const [rejecting, setRejecting] = useState<Redemption | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [toApprove, setToApprove] = useState<Redemption | null>(null);

  /** Fetch and apply. `loading` is owned by the caller, so this is safe to
   *  call again from a button without flashing the whole screen away. */
  const load = async () => {
    const [r, q] = await Promise.all([
      supabase.from('rewards')
        .select('id, name, description, cost_points, stock, is_active')
        .order('cost_points'),
      supabase.from('reward_redemptions')
        .select('id, member_id, cost_points, status, requested_at, decision_note, rewards(name), member_profiles(profiles(first_name, last_name))')
        .order('requested_at', { ascending: false })
        .limit(100),
    ]);
    if (r.error || q.error) {
      setFailed(true);
    } else {
      setRewards((r.data ?? []) as Reward[]);
      setQueue((q.data ?? []) as unknown as Redemption[]);
      setFailed(false);
    }
  };

  useEffect(() => {
    let alive = true;
    // The first statement is an await, so every setState below it is deferred
    // rather than synchronous — which is what react-hooks/set-state-in-effect
    // is actually asking for, and it is better code besides.
    (async () => {
      await load();
      if (!alive) return;
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const addReward = async () => {
    const cost = Number(form.cost_points);
    if (!form.name.trim() || !Number.isFinite(cost) || cost <= 0) {
      showToast('Name and a positive point cost are required', 'error');
      return;
    }
    setBusy('add');
    const { error } = await supabase.from('rewards').insert({
      name: form.name.trim(),
      description: form.description.trim() || null,
      cost_points: cost,
      // Blank means unlimited, which the column stores as NULL. 0 would mean
      // "out of stock forever", which is a different thing entirely.
      stock: form.stock.trim() === '' ? null : Number(form.stock),
    });
    setBusy(null);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Reward added', 'success');
    setForm(emptyForm);
    setAdding(false);
    await load();
  };

  /**
   * The decision write, unchanged.
   *
   * The rejection reason used to come from `window.prompt`, which is a browser
   * chrome box in the middle of a dark dashboard, cannot be styled, cannot be
   * cancelled without also cancelling the rejection, and returns `''` for both
   * "no reason" and "changed my mind". It is a real message the member reads,
   * so it is typed in the app now — but the write below is the same one.
   */
  const decide = async (row: Redemption, status: 'approved' | 'rejected', note: string) => {
    setBusy(row.id);
    const { data: me } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('reward_redemptions')
      .update({
        status,
        decided_by: me.user?.id ?? null,
        decided_at: new Date().toISOString(),
        decision_note: note || null,
      })
      .eq('id', row.id);
    setBusy(null);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(status === 'approved' ? 'Approved' : 'Rejected', 'success');
    await load();
  };

  const toggleReward = async (r: Reward) => {
    const { error } = await supabase.from('rewards')
      .update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) { showToast(error.message, 'error'); return; }
    setRewards((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: !x.is_active } : x)));
  };

  const memberName = (row: Redemption) => {
    const p = row.member_profiles?.profiles;
    return p ? `${p.first_name} ${p.last_name}` : 'Member';
  };

  const pending = useMemo(() => queue.filter((q) => q.status === 'pending'), [queue]);
  const decided = useMemo(() => queue.filter((q) => q.status !== 'pending'), [queue]);

  const catalogue = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rewards.filter((r) => {
      if (filter === 'live' && !r.is_active) return false;
      if (filter === 'hidden' && r.is_active) return false;
      if (q && !r.name.toLowerCase().includes(q)
        && !(r.description ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rewards, search, filter]);

  const history = usePaged(decided, HISTORY_PER_PAGE);
  const liveCount = rewards.filter((r) => r.is_active).length;

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading rewards…</div>;
  }

  if (failed) {
    return (
      <Section title="Couldn't load rewards" icon={AlertTriangle}>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          A connection problem, not an empty catalogue — no request has been
          missed. Reload to try again.
        </p>
      </Section>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="CORE Points & Rewards"
        subtitle="What members can spend their points on, and who is waiting on a decision"
        actions={
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add reward
          </Button>
        }
      />

      <StatTiles items={[
        { label: 'Waiting', value: pending.length, icon: Clock, tone: pending.length > 0 ? 'secondary' : 'primary' },
        { label: 'Live rewards', value: liveCount, icon: Gift },
        { label: 'Hidden', value: rewards.length - liveCount, icon: Package },
        { label: 'Decided', value: decided.length, icon: History },
      ]} />

      {/* ── The queue first: it is the thing with someone waiting on it ───── */}
      <Section title="Waiting for you" icon={Clock} count={pending.length}
        hint={pending.length > 0 ? 'stock only drops when you approve' : undefined}>
        {pending.length === 0 ? (
          <EmptyState compact icon={Check} title="Nothing to approve"
            hint="Requests land here the moment a member spends their points." />
        ) : (
          <CardGrid min={300}>
            {pending.map((row) => (
              <TileCard key={row.id} accent>
                <p className="text-[12px] font-semibold text-white truncate">{memberName(row)}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {row.rewards?.name ?? 'Reward'}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {row.cost_points} points · asked {new Date(row.requested_at).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}
                </p>
                <div className="flex gap-1.5 mt-2.5">
                  <button onClick={() => setToApprove(row)} disabled={busy === row.id}
                    className="flex-1 h-8 rounded-lg text-[11px] font-bold disabled:opacity-50"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}>
                    <Check size={12} className="inline mr-1" />Approve
                  </button>
                  <button
                    onClick={() => { setRejecting(row); setRejectNote(''); }}
                    disabled={busy === row.id}
                    className="px-3 h-8 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                    style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                    <X size={12} className="inline mr-1" />Reject
                  </button>
                </div>
              </TileCard>
            ))}
          </CardGrid>
        )}
      </Section>

      {/* ── The catalogue ─────────────────────────────────────────────────── */}
      <Section
        title="What points buy" icon={Gift} count={rewards.length}
        actions={
          rewards.length > 0 ? (
            <Toolbar>
              <SearchBox value={search} onChange={setSearch} placeholder="Search rewards…" width={190} />
              <Chips
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All', count: rewards.length },
                  { value: 'live', label: 'Live', count: liveCount },
                  { value: 'hidden', label: 'Hidden', count: rewards.length - liveCount },
                ]}
              />
            </Toolbar>
          ) : undefined
        }
      >
        {rewards.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="No rewards yet"
            hint="Members are already earning points — they just have nothing to spend them on."
            action={<Button variant="secondary" onClick={() => setAdding(true)}><Plus size={14} /> Add the first one</Button>}
          />
        ) : catalogue.length === 0 ? (
          <EmptyState compact icon={Gift} title="Nothing matches"
            hint="No reward matches that search and filter." />
        ) : (
          <CardGrid min={230}>
            {catalogue.map((r) => (
              <TileCard key={r.id} dim={!r.is_active}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white truncate">{r.name}</p>
                    {r.description && (
                      <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                        {r.description}
                      </p>
                    )}
                  </div>
                  {/* An inactive reward is hidden from members, not deleted — the
                      requests already decided against it stay readable. */}
                  <button onClick={() => toggleReward(r)}
                    className="text-[9px] font-semibold flex-shrink-0 px-2 py-1 rounded"
                    style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }}>
                    {r.is_active ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold"
                    style={{ color: 'var(--color-primary)' }}>
                    <Coins size={11} />{r.cost_points}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {/* NULL stock is unlimited. 0 is out of stock, and says so. */}
                    {r.stock == null ? 'unlimited' : `${r.stock} left`}
                  </span>
                </div>
              </TileCard>
            ))}
          </CardGrid>
        )}
      </Section>

      {/* ── History, behind a button ──────────────────────────────────────────
          It was a fourth always-open panel listing 20 rows. Decisions already
          made are the least urgent thing on the page, so they wait to be asked
          for — and they page rather than growing forever. */}
      {decided.length > 0 && (
        <Section
          title="Already decided" icon={History} count={decided.length}
          actions={
            <div className="flex items-center gap-2">
              {showHistory && (
                <PageSummary page={history.page} perPage={history.perPage}
                  total={history.total} noun="decisions" />
              )}
              <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
                {showHistory ? 'Hide' : 'Show'}
              </Button>
            </div>
          }
        >
          {showHistory ? (
            <>
              <div className="space-y-1">
                {history.visible.map((row) => (
                  <div key={row.id}
                    className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg"
                    style={{ background: 'var(--color-surface-high)' }}>
                    <div className="min-w-0">
                      <p className="text-[11px] text-white truncate">
                        {memberName(row)} — {row.rewards?.name ?? 'Reward'}
                      </p>
                      {row.decision_note && (
                        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                          “{row.decision_note}”
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
                      style={{ color: row.status === 'rejected'
                        ? 'var(--color-secondary)' : 'var(--color-primary)' }}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
              <Pagination currentPage={history.page} totalItems={history.total}
                itemsPerPage={history.perPage} onPageChange={history.setPage} />
            </>
          ) : (
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {decided.length} decision{decided.length === 1 ? '' : 's'} on record.
            </p>
          )}
        </Section>
      )}

      {/* ── Add a reward, floating ────────────────────────────────────────── */}
      <Modal
        isOpen={adding}
        onClose={() => { setAdding(false); setForm(emptyForm); }}
        title="Add a reward"
        subtitle="What a member can turn their points into"
        onConfirm={addReward}
        confirmLabel={busy === 'add' ? 'Adding…' : 'Add reward'}
        confirmDisabled={busy === 'add' || !form.name.trim() || !form.cost_points.trim()}
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Reward</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. One free week"
              className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Description</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What the member gets"
              className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Points</span>
              <input value={form.cost_points} onChange={(e) => setForm({ ...form, cost_points: e.target.value })}
                placeholder="500" inputMode="numeric"
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Stock</span>
              <input value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })}
                placeholder="Leave blank for ∞" inputMode="numeric"
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            Leave stock blank for unlimited. Stock only drops when you approve a
            request, so a rejected one never costs you one.
          </p>
        </div>
      </Modal>

      {/* ── Rejecting: the member reads this, so it is written properly ───── */}
      <Modal
        isOpen={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject this request?"
        subtitle={rejecting ? `${memberName(rejecting)} — ${rejecting.rewards?.name ?? 'Reward'}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>Keep it waiting</Button>
            <Button variant="secondary"
              disabled={!!busy}
              onClick={async () => {
                const row = rejecting;
                if (!row) return;
                setRejecting(null);
                await decide(row, 'rejected', rejectNote.trim());
              }}>
              Reject
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>
            Reason — the member sees this
          </span>
          <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3}
            placeholder="e.g. Out of stock this month — try again in April."
            className="w-full px-3 py-2 rounded-lg text-xs text-white mt-1 resize-none"
            style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
        </label>
        <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Optional, but a rejection with no reason reads as a mistake. The
          member keeps their points either way.
        </p>
      </Modal>

      {/* Approving hands something over and drops stock, so it asks first. */}
      <ConfirmDialog
        isOpen={!!toApprove}
        onClose={() => setToApprove(null)}
        onConfirm={() => { if (toApprove) void decide(toApprove, 'approved', ''); }}
        title="Approve this redemption?"
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
