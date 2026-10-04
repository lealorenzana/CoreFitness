import { useEffect, useState } from 'react';
import { Plus, Flag, AlertTriangle, Users, Clock, Trophy, Sparkles } from 'lucide-react';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { ChallengeStandingsModal, GoalTemplatesSection } from '../components/ui/EngagementRules';
import ImageField from '../components/ui/ImageField';
import GymGoalSection from '../components/GymGoalSection';
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

/** What each countable metric means, in the words challenge_progress() counts it (0102). */
const COUNTS: Record<string, string> = {
  training_days: 'Days they trained — a check-in or a finished workout; one per day however many.',
  verified_days: 'Days they checked in at the gym.',
  logged_days: 'Days they logged a workout without checking in (training at home).',
  consistent_weeks: 'Weeks with at least two training days.',
  weekend_days: 'Saturdays and Sundays they trained.',
  distinct_activities: 'Different kinds of training — classes, workouts, sessions.',
  early_checkins: 'Check-ins before 7 in the morning.',
  late_checkins: 'Check-ins from 8 in the evening.',
  goals_achieved: 'Goals with a number they reached.',
  measurements: 'Body measurements they recorded.',
  classes_attended: 'Booked classes they attended.',
  pt_sessions_done: 'Completed 1-on-1 sessions.',
};

/** Ready-made challenges an owner can start from and change. */
const PRESETS = [
  { title: '10 training days in 30 days', metric: 'training_days', target: 10, days: 30, points: 250, weekly: false },
  { title: 'Weekend warrior', metric: 'weekend_days', target: 6, days: 30, points: 200, weekly: false },
  { title: 'Early bird week', metric: 'early_checkins', target: 3, days: 7, points: 60, weekly: true },
  { title: 'Class explorer', metric: 'classes_attended', target: 8, days: 28, points: 300, weekly: false },
  { title: 'Steady month', metric: 'consistent_weeks', target: 4, days: 30, points: 300, weekly: false },
];
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

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
  /** Optional picture (0065). NULL is normal. */
  image_url: string | null;
  /** 0123: a template that gives every week its own copy. Absent before 0123. */
  repeats_weekly?: boolean;
  parent_id?: string | null;
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
  /** The challenge whose standings are open (0094). */
  const [standing, setStanding] = useState<{ id: string; title: string; target: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', metric_key: 'training_days',
    target: '10', starts_on: today(), ends_on: inDays(30), reward_points: '250',
    imageUrl: '',
    repeatsWeekly: false,
  });

  /** Fetch and apply. `loading` is owned by the caller, so this is safe to
   *  call again from a button without flashing the whole screen away. */
  const load = async () => {
    // Completions are the database's: settle anyone who reached a target since
    // the last look (0159 — pg_cron is optional here). Before 0159 this is refused and changes nothing.
    await supabase.rpc('settle_challenges').then(() => undefined, () => undefined);
    const [m, c, p] = await Promise.all([
      supabase.from('achievement_metrics')
        .select('key, label, unit').eq('challengeable', true).order('sort_order'),
      supabase.from('challenges')
        .select('id, title, description, metric_key, target, starts_on, ends_on, reward_points, is_active, image_url, repeats_weekly, parent_id')
        .order('ends_on', { ascending: false })
        .then(async (r) => (r.error
          // Before 0123 the two columns do not exist; the list is read as before.
          ? supabase.from('challenges')
              .select('id, title, description, metric_key, target, starts_on, ends_on, reward_points, is_active, image_url')
              .order('ends_on', { ascending: false })
          : r)),
      supabase.from('challenge_participants').select('challenge_id, completed_on'),
    ]);
    if (m.error || c.error || p.error) {
      setFailed(true);
    } else {
      setMetrics((m.data ?? []) as Metric[]);
      // A weekly quest's copies are the template's business, not rows of their
      // own here: the owner edits and hides the template (0123).
      setItems(((c.data ?? []) as Challenge[]).filter((x) => !x.parent_id));
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
      // Empty means no picture; an empty string would render a broken image.
      image_url: form.imageUrl.trim() || null,
      // Only when ticked, so creating a one-off still works before 0123.
      ...(form.repeatsWeekly ? { repeats_weekly: true } : {}),
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
    const state = c.starts_on > now ? 'Starts ' + fmt(c.starts_on) : c.ends_on < now ? 'Ended ' + fmt(c.ends_on) : 'Live · ends ' + fmt(c.ends_on);
    const n = counts[c.id] ?? { joined: 0, done: 0 };
    // Progress is computed, never stored (0052) — this bar is the same
    // arithmetic the member sees, not a second number that can disagree.
    const share = n.joined > 0 ? Math.round((n.done / n.joined) * 100) : 0;
    return (
      <TileCard key={c.id} dim={!c.is_active}>
        {/* Only when there is one. A placeholder here would be a picture the
            gym never chose, on a card members are shown. */}
        {c.image_url && (
          <img src={c.image_url} alt="" loading="lazy"
            className="w-full rounded-lg object-cover mb-2"
            style={{ aspectRatio: '16 / 9', background: 'var(--color-bg)' }} />
        )}
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-semibold text-white leading-snug">
            {c.title}
            {c.repeats_weekly && (
              <span className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: 'var(--color-surface-high)', color: 'var(--color-primary)' }}>Repeats weekly</span>
            )}
          </p>
          <button onClick={() => toggle(c)}
            className="text-[9px] font-semibold flex-shrink-0 px-2 py-1 rounded"
            style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-muted)' }}>
            {c.is_active ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {metricLabel(c.metric_key)} ≥ <span className="font-bold">{c.target}</span>
        </p>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {state}
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
              <button onClick={() => setStanding({ id: c.id, title: c.title, target: c.target })}
                className="text-[10px] font-semibold flex-shrink-0 px-2 py-1 rounded"
                style={{ background: 'var(--color-surface-high)', color: 'var(--color-primary)' }}>
                Standings
              </button>
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

      <Section title="How a challenge works" icon={Sparkles}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ol className="text-[12px] space-y-1 list-decimal pl-4" style={{ color: 'var(--color-text-secondary)' }}>
            <li>You pick what is counted, a target and the dates. Members see it under Challenges in the app.</li>
            <li>A member taps <b>Join</b>. From then the app counts their real check-ins, workouts and classes between the dates — nobody types a number.</li>
            <li>When they reach the target they are marked done and get the points, once. Nobody can tick it for them, you included.</li>
            <li>A weekly quest starts again every Monday with everyone in it, and pays once a week.</li>
          </ol>
          <p className="text-[12px] rounded-lg px-3 py-2 self-start" style={{ background: 'var(--color-primary-light)', color: 'var(--color-text-secondary)' }}>
            <b className="text-white">Example.</b> “10 training days in 30 days”, worth 250 points. Ana joins on day 1 and trains Monday, Wednesday and Friday:
            3 days a week, so she reaches 10 in her fourth week — her app shows 10 / 10, she is marked done, and 250 points land in her balance for Rewards
            (and count toward this month&rsquo;s season).
          </p>
        </div>
      </Section>

      {/* The whole gym's goal and the members' squads (0124). */}
      <GymGoalSection />

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

      {/* The goals members pick in the app (0055) — tuned here, not in SQL. */}
      <GoalTemplatesSection />

      <ChallengeStandingsModal challenge={standing} onClose={() => setStanding(null)} />

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
          <div>
            <span className="text-[11px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)' }}>Start from one</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PRESETS.filter((pr) => metrics.some((m) => m.key === pr.metric)).map((pr) => (
                <button key={pr.title} type="button"
                  onClick={() => setForm({ ...form, title: pr.title, metric_key: pr.metric, target: String(pr.target), reward_points: String(pr.points),
                    starts_on: today(), ends_on: inDays(pr.days - 1), repeatsWeekly: pr.weekly })}
                  className="h-8 px-3 rounded-full text-[11px] font-semibold"
                  style={{ background: form.title === pr.title ? 'var(--color-primary-light)' : 'var(--color-surface-high)',
                    color: form.title === pr.title ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    border: `1px solid ${form.title === pr.title ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
                  {pr.title}
                </button>
              ))}
            </div>
          </div>
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
              {COUNTS[form.metric_key] && <span className="block text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{COUNTS[form.metric_key]}</span>}
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
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={form.repeatsWeekly} aria-label="Repeat every week"
              onChange={(e) => setForm({ ...form, repeatsWeekly: e.target.checked })} />
            <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              Repeat every week — a weekly quest. Each Monday it starts again, every member is in it
              automatically, and it pays its points once a week. The dates above are when it runs.
            </span>
          </label>
          {/* The challenge in one sentence — what members will be agreeing to. */}
          {form.title.trim() && Number(form.target) > 0 && form.ends_on >= form.starts_on && (
            <p className="text-[12px] rounded-lg px-3 py-2" style={{ background: 'var(--color-primary-light)', color: 'var(--color-text-secondary)' }}>
              <b className="text-white">Members will read:</b> {form.repeatsWeekly ? 'Every week' : `${fmt(form.starts_on)} – ${fmt(form.ends_on)}`}, reach{' '}
              <b className="text-white">{form.target} × {(metrics.find((m) => m.key === form.metric_key)?.label ?? form.metric_key).toLowerCase()}</b>
              {Number(form.reward_points) > 0 ? <> and earn <b className="text-white">{form.reward_points} points</b></> : ''}.
            </p>
          )}
          <ImageField
            value={form.imageUrl}
            onChange={(imageUrl) => setForm({ ...form, imageUrl })}
            kind="challenges"
            label="Picture"
            hint="Shown with the challenge in the member app."
          />
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
