import { useEffect, useState } from 'react';
import { Plus, Flag, AlertTriangle, Users, Clock, Trophy } from 'lucide-react';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { PageHeader, StatTiles, Section, EmptyState, CardGrid, TileCard } from '../components/ui/kit';
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

  /** Fetch and apply. `loading` is owned by the caller, so this is safe to
   *  call again from a button without flashing the whole screen away. */
  const load = async () => {
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
      <Section title="Couldn't load challenges" icon={AlertTriangle}>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          A connection problem, not an empty list. Reload to try again.
        </p>
      </Section>
    );
  }

  const now = today();
  const running = items.filter((c) => c.ends_on >= now);
  const past = items.filter((c) => c.ends_on < now);
  const totalJoined = Object.values(counts).reduce((s, n) => s + n.joined, 0);
  const totalDone = Object.values(counts).reduce((s, n) => s + n.done, 0);

  /** One challenge, as a tile. Shared by both sections so they cannot drift. */
  const tile = (c: typeof items[number]) => {
    const n = counts[c.id] ?? { joined: 0, done: 0 };
    // Progress is computed, never stored (0052) — this bar is the same
    // arithmetic the member sees, not a second number that can disagree.
    const share = n.joined > 0 ? Math.round((n.done / n.joined) * 100) : 0;
    return (
      <TileCard key={c.id} dim={!c.is_active}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-semibold text-white leading-snug">{c.title}</p>
          <button onClick={() => toggle(c)}
            className="text-[9px] font-semibold flex-shrink-0 px-2 py-1 rounded"
            style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }}>
            {c.is_active ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {metricLabel(c.metric_key)} ≥ <span className="font-bold">{c.target}</span>
        </p>
        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {c.starts_on} → {c.ends_on}
          {c.reward_points > 0 && ` · ${c.reward_points} pts`}
        </p>

        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[10px] flex items-center gap-1 flex-shrink-0"
            style={{ color: 'var(--color-text-secondary)' }}>
            <Users size={10} />{n.joined}
          </span>
          {/* The bar only means anything once somebody has joined; with nobody
              in it, an empty track would read as "everyone is failing". */}
          {n.joined > 0 ? (
            <>
              <span className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--color-surface-high)' }}>
                <span className="block h-full rounded-full"
                  style={{ width: `${share}%`, background: 'var(--color-primary)' }} />
              </span>
              <span className="text-[10px] tabular-nums flex-shrink-0"
                style={{ color: 'var(--color-primary)' }}>{n.done} done</span>
            </>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>nobody joined yet</span>
          )}
        </div>
      </TileCard>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Challenges"
        subtitle="Progress is counted from real check-ins, never self-reported"
        actions={
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus size={15} /> New challenge
          </Button>
        }
      />

      <StatTiles items={[
        { label: 'Running', value: running.length, icon: Flag },
        { label: 'Finished', value: past.length, icon: Clock },
        { label: 'Members joined', value: totalJoined, icon: Users },
        { label: 'Completions', value: totalDone, icon: Trophy, tone: 'secondary' },
      ]} />

      {items.length === 0 ? (
        <Section title="Challenges" icon={Flag}>
          <EmptyState
            icon={Flag}
            title="No challenges yet"
            hint="A challenge gives members a reason to come back that is not a renewal reminder."
            action={<Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus size={14} /> Create one</Button>}
          />
        </Section>
      ) : (
        [{ label: 'Running', list: running, icon: Flag },
         { label: 'Finished', list: past, icon: Clock }]
          .filter((s) => s.list.length > 0)
          .map((section) => (
            <Section key={section.label} title={section.label} icon={section.icon} count={section.list.length}>
              <CardGrid min={260}>{section.list.map(tile)}</CardGrid>
            </Section>
          ))
      )}

      {/* Creating one floats. It used to unfold between the header and the
          list, so the challenges you were comparing against jumped down the
          page the moment you went to add another. */}
      <Modal
        isOpen={adding}
        onClose={() => setAdding(false)}
        title="New challenge"
        subtitle="Counted automatically between the two dates"
        size="lg"
        onConfirm={add}
        confirmLabel={busy ? 'Creating…' : 'Create challenge'}
        confirmDisabled={busy || !form.title.trim()}
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Title</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. 15 visits in November"
              className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Description</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Shown to members"
              className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
              style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>What is counted</span>
              <select value={form.metric_key} onChange={(e) => setForm({ ...form, metric_key: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }}>
                {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Target</span>
              <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
                inputMode="numeric"
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Starts</span>
              <input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', colorScheme: 'dark' }} />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Ends</span>
              <input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', colorScheme: 'dark' }} />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Points</span>
              <input value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: e.target.value })}
                inputMode="numeric"
                className="w-full h-10 px-3 rounded-lg text-xs text-white mt-1"
                style={{ background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' }} />
            </label>
          </div>
          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Only metrics that can be counted inside a date range are listed. Streaks and
            &ldquo;days since joining&rdquo; are left out because they describe a whole
            history, so a windowed target for them would be meaningless.
          </p>
        </div>
      </Modal>
    </div>
  );
}
