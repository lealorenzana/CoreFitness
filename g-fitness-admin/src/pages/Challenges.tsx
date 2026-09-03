import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Flag, AlertTriangle, Users } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';

/**
 * Gym challenges (migration 0052).
 *
 * ## The metric list is short on purpose
 *
 * Only metrics flagged `challengeable` appear. Ten of the twenty-two in
 * `achievement_metrics` are excluded because they cannot be counted inside a
 * window honestly — a streak or a tenure is a property of a whole history, and
 * "best streak >= 3 during November" is not a question the data can answer.
 * Offering them would produce challenges that are nonsense rather than hard.
 *
 * ## There is no "mark complete" button
 *
 * `challenge_participants` has no UPDATE policy for any role, admin included.
 * Completion is decided by `settle_challenges()` from real counts. An admin who
 * could hand out a completion could hand out the points attached to it.
 */

interface Metric { key: string; label: string; unit: string | null }

interface Challenge {
  id: string;
  title: string;
  description: string | null;
  metric_key: string;
  target: number;
  starts_on: string;
  ends_on: string;
  reward_points: number;
  is_active: boolean;
}

function today(): string {
  // Manila, not UTC — `toISOString()` is yesterday for the first eight hours of
  // every local day, which would default a challenge to starting in the past.
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

function inDays(n: number): string {
  return new Date(Date.now() + 8 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
}

export default function Challenges() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [items, setItems] = useState<Challenge[]>([]);
  const [counts, setCounts] = useState<Record<string, { joined: number; done: number }>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', metric_key: 'training_days',
    target: '10', starts_on: today(), ends_on: inDays(30), reward_points: '250',
  });

  const load = async () => {
    setLoading(true);
    const [m, c, p] = await Promise.all([
      supabase.from('achievement_metrics')
        .select('key, label, unit').eq('challengeable', true).order('sort_order'),
      supabase.from('challenges')
        .select('id, title, description, metric_key, target, starts_on, ends_on, reward_points, is_active')
        .order('ends_on', { ascending: false }),
      supabase.from('challenge_participants').select('challenge_id, completed_on'),
    ]);
    if (m.error || c.error || p.error) {
      setFailed(true);
    } else {
      setMetrics((m.data ?? []) as Metric[]);
      setItems((c.data ?? []) as Challenge[]);
      const agg: Record<string, { joined: number; done: number }> = {};
      for (const row of p.data ?? []) {
        const id = row.challenge_id as string;
        agg[id] ??= { joined: 0, done: 0 };
        agg[id].joined += 1;
        if (row.completed_on) agg[id].done += 1;
      }
      setCounts(agg);
      setFailed(false);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    const target = Number(form.target);
    const points = Number(form.reward_points);
    if (!form.title.trim() || !Number.isFinite(target) || target <= 0) {
      showToast('A title and a positive target are required', 'error');
      return;
    }
    if (form.ends_on < form.starts_on) {
      showToast('The challenge cannot end before it starts', 'error');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('challenges').insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      metric_key: form.metric_key,
      target,
      starts_on: form.starts_on,
      ends_on: form.ends_on,
      reward_points: Number.isFinite(points) ? points : 0,
    });
    setBusy(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Challenge created', 'success');
    setAdding(false);
    await load();
  };

  const toggle = async (c: Challenge) => {
    const { error } = await supabase.from('challenges')
      .update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) { showToast(error.message, 'error'); return; }
    setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
  };

  const metricLabel = (key: string) => metrics.find((m) => m.key === key)?.label ?? key;

  if (loading) {
    return <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading challenges…</div>;
  }

  if (failed) {
    return (
      <Card className="!p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5" style={{ color: 'var(--color-secondary)' }} />
          <div>
            <p className="text-xs font-semibold text-white">Couldn&apos;t load challenges</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              A connection problem, not an empty list. Reload to try again.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const now = today();
  const running = items.filter((c) => c.ends_on >= now);
  const past = items.filter((c) => c.ends_on < now);

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Challenges</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {running.length} running · progress is counted from real check-ins, never self-reported
          </p>
        </div>
        <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} /> New Challenge
        </Button>
      </motion.div>

      {adding && (
        <Card className="!p-4">
          <div className="grid grid-cols-3 gap-3">
            <label>
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. 15 visits in November"
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
            <label className="col-span-2">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Description</span>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Shown to members"
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
          </div>
          <div className="grid grid-cols-5 gap-3 mt-3">
            <label className="col-span-2">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>What is counted</span>
              <select value={form.metric_key} onChange={(e) => setForm({ ...form, metric_key: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
                {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <label>
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Target</span>
              <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
            <label>
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Starts</span>
              <input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', colorScheme: 'dark' }} />
            </label>
            <label>
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Ends</span>
              <input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', colorScheme: 'dark' }} />
            </label>
          </div>
          <label className="block mt-3 w-40">
            <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>CORE Points reward</span>
            <input value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: e.target.value })}
              className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
          </label>
          <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Only metrics that can be counted inside a date range are listed. Streaks and
            &ldquo;days since joining&rdquo; are left out because they describe a whole
            history, so a windowed target for them would be meaningless.
          </p>
          <div className="flex gap-2 mt-3">
            <Button variant="secondary" onClick={add} disabled={busy}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {[{ label: 'Running', list: running }, { label: 'Finished', list: past }]
        .filter((s) => s.list.length > 0)
        .map((section) => (
          <Card key={section.label} className="!p-4">
            <div className="flex items-center gap-2 mb-3">
              <Flag size={14} style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-sm font-bold text-white">{section.label}</h3>
            </div>
            <div className="space-y-2">
              {section.list.map((c) => {
                const n = counts[c.id] ?? { joined: 0, done: 0 };
                return (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                       style={{ background: 'var(--color-surface-high)',
                                border: '1px solid var(--color-border)',
                                opacity: c.is_active ? 1 : 0.45 }}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">{c.title}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {metricLabel(c.metric_key)} ≥ {c.target} · {c.starts_on} to {c.ends_on}
                        {c.reward_points > 0 && ` · ${c.reward_points} points`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
                        <Users size={10} /> {n.joined} joined · {n.done} done
                      </span>
                      <button onClick={() => toggle(c)}
                        className="text-[9px] font-semibold px-2 py-1 rounded"
                        style={{ color: 'var(--color-text-muted)' }}>
                        {c.is_active ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

      {items.length === 0 && (
        <Card className="!p-6 text-center">
          <Flag size={22} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No challenges yet. A challenge gives members a reason to come back that
            is not a renewal reminder.
          </p>
        </Card>
      )}
    </div>
  );
}
