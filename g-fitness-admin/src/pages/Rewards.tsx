import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Gift, Check, X, AlertTriangle, Clock, Sparkles } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
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

export default function Rewards() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [queue, setQueue] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
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
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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

  const decide = async (row: Redemption, status: 'approved' | 'rejected') => {
    const note = status === 'rejected'
      ? window.prompt('Why? The member sees this.') ?? ''
      : '';
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

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading rewards…</div>;
  }

  if (failed) {
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" style={{ color: 'var(--color-secondary)' }} />
          <div>
            <p className="text-xs font-semibold text-white">Couldn&apos;t load rewards</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              A connection problem, not an empty catalogue — no request has been
              missed. Reload to try again.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const pending = queue.filter((q) => q.status === 'pending');
  const decided = queue.filter((q) => q.status !== 'pending');

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">CORE Points &amp; Rewards</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {pending.length} request{pending.length === 1 ? '' : 's'} waiting · {rewards.filter((r) => r.is_active).length} rewards live
          </p>
        </div>
        <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} /> Add Reward
        </Button>
      </motion.div>

      {/* ── The queue first: it is the thing with someone waiting on it ───── */}
      <Card className="!p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} style={{ color: 'var(--color-primary)' }} />
          <h3 className="text-sm font-bold text-white">Waiting for you</h3>
        </div>
        {pending.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Nothing to approve right now.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                   style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">
                    {memberName(row)} — {row.rewards?.name ?? 'Reward'}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {row.cost_points} points · asked {new Date(row.requested_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => decide(row, 'approved')} disabled={busy === row.id}
                    className="px-3 h-8 rounded-lg text-[11px] font-bold disabled:opacity-50"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}>
                    <Check size={12} className="inline mr-1" />Approve
                  </button>
                  <button onClick={() => decide(row, 'rejected')} disabled={busy === row.id}
                    className="px-3 h-8 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                    style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                    <X size={12} className="inline mr-1" />Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {adding && (
        <Card className="!p-4">
          <div className="grid grid-cols-4 gap-3">
            <label>
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Reward</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. One free week"
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
            <label className="col-span-2">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Description</span>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What the member gets"
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Points</span>
                <input value={form.cost_points} onChange={(e) => setForm({ ...form, cost_points: e.target.value })}
                  placeholder="500"
                  className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                  style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
              </label>
              <label>
                <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Stock</span>
                <input value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  placeholder="∞"
                  className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                  style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
              </label>
            </div>
          </div>
          <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Leave stock blank for unlimited. Stock only drops when you approve a
            request, so a rejected one never costs you one.
          </p>
          <div className="flex gap-2 mt-3">
            <Button variant="secondary" onClick={addReward} disabled={busy === 'add'}>
              {busy === 'add' ? 'Adding…' : 'Add'}
            </Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setForm(emptyForm); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* ── The catalogue ─────────────────────────────────────────────────── */}
      <Card className="!p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gift size={14} style={{ color: 'var(--color-secondary)' }} />
          <h3 className="text-sm font-bold text-white">What points buy</h3>
        </div>
        {rewards.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No rewards yet. Members are still earning points — they just have
            nothing to spend them on.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {rewards.map((r) => (
              <div key={r.id} className="px-3 py-2.5 rounded-lg"
                   style={{ background: 'var(--color-surface-high)',
                            border: '1px solid var(--color-border)',
                            opacity: r.is_active ? 1 : 0.45 }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{r.name}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-primary)' }}>
                      {r.cost_points} points
                      {r.stock != null && (
                        <span style={{ color: 'var(--color-text-muted)' }}> · {r.stock} left</span>
                      )}
                    </p>
                  </div>
                  <button onClick={() => toggleReward(r)}
                    className="text-[9px] font-semibold flex-shrink-0 px-2 py-1 rounded"
                    style={{ color: 'var(--color-text-muted)' }}>
                    {r.is_active ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── History ───────────────────────────────────────────────────────── */}
      {decided.length > 0 && (
        <Card className="!p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} style={{ color: 'var(--color-text-muted)' }} />
            <h3 className="text-sm font-bold text-white">Already decided</h3>
          </div>
          <div className="space-y-1.5">
            {decided.slice(0, 20).map((row) => (
              <div key={row.id} className="flex items-center justify-between text-[11px]">
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {memberName(row)} — {row.rewards?.name ?? 'Reward'}
                </span>
                <span className="font-semibold"
                      style={{ color: row.status === 'rejected'
                        ? 'var(--color-secondary)' : 'var(--color-primary)' }}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
