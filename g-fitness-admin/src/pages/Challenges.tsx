import { useEffect, useState } from 'react';
import { Plus, Flag, AlertTriangle, Users, Clock, Trophy, Sparkles, Target, CalendarRange, Repeat, Eye, EyeOff, BarChart3, Wand2, Goal } from 'lucide-react';
import Modal from '../components/ui/Modal';
import { ChallengeStandingsModal, GoalTemplatesSection } from '../components/ui/EngagementRules';
import ImageField from '../components/ui/ImageField';
import GymGoalSection from '../components/GymGoalSection';
import {
  RdHeader, RdCard, StatTile, PageTabs, FilterChips, RdSelect, RdButton, Pill, DotMenu, EmptyBlock, FitBody, RdField,
} from '../components/ui/rd';
import { TONE, RD_INPUT, RD_INPUT_STYLE } from '../components/ui/rdTokens';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { todayKey, addDays } from '../utils/dates';
import DatePicker from '../components/ui/DatePicker';

/**
 * Gym challenges (migration 0052).
 *
 * ## The metric list is short on purpose
 *
 * Only metrics flagged `challengeable` appear. Ten of the twenty-two in
 * `achievement_metrics` are excluded because they cannot be counted inside a
 * window honestly — a streak or a tenure is a property of a whole history, and
 * "best streak >= 3 during November" is not a question the data can answer.
 *
 * ## There is no "mark complete" button
 *
 * `challenge_participants` has no UPDATE policy for any role, admin included.
 * Completion is decided by `settle_challenges()` from real counts. An admin who
 * could hand out a completion could hand out the points attached to it.
 *
 * 2026-10-12: fits the screen — the challenges as cards that read as one
 * sentence each, "How a challenge works" beside them, and the gym goal and the
 * goals members pick on their own tabs.
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
const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const LINE = '1px solid rgba(255,255,255,0.06)';

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

/** Manila dates — `toISOString()` is yesterday for the first eight hours of every local day. */
const today = () => todayKey();
const inDays = (n: number) => addDays(todayKey(), n);

type Tab = 'challenges' | 'goal' | 'templates';
type Show = 'running' | 'upcoming' | 'finished' | 'all';

export default function Challenges() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [items, setItems] = useState<Challenge[]>([]);
  const [counts, setCounts] = useState<Record<string, { joined: number; done: number }>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<Tab>('challenges');
  const [show, setShow] = useState<Show>('all');
  /** The challenge whose standings are open (0094). */
  const [standing, setStanding] = useState<{ id: string; title: string; target: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', metric_key: 'training_days',
    target: '10', starts_on: today(), ends_on: inDays(30), reward_points: '250',
    imageUrl: '',
    repeatsWeekly: false,
  });

  /** Fetch and apply. `loading` is owned by the caller, so this is safe to call again. */
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
      // A weekly quest's copies are the template's business, not rows of their own here (0123).
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
    showToast('Challenge created — members can join it in the app', 'success');
    setAdding(false);
    await load();
  };

  const toggle = async (c: Challenge) => {
    const { error } = await supabase.from('challenges').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) { showToast(error.message, 'error'); return; }
    setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
    showToast(c.is_active ? `${c.title} is hidden from members` : `${c.title} is shown again`, 'success');
  };

  const metricLabel = (key: string) => metrics.find((m) => m.key === key)?.label ?? key;

  if (loading) {
    return <div className="text-sm" style={{ color: MUTED }}>Loading challenges…</div>;
  }

  if (failed) {
    return (
      <RdCard className="p-6 flex items-start gap-3">
        <AlertTriangle size={20} style={{ color: TONE.amber.fg }} />
        <div>
          <p className="text-[16px] font-semibold text-white">Challenges could not be loaded</p>
          <p className="text-[13.5px] mt-1" style={{ color: SECOND }}>A connection problem, not an empty list. Reload to try again.</p>
        </div>
      </RdCard>
    );
  }

  const now = today();
  const running = items.filter((c) => c.starts_on <= now && c.ends_on >= now);
  const upcoming = items.filter((c) => c.starts_on > now);
  const past = items.filter((c) => c.ends_on < now);
  const totalJoined = Object.values(counts).reduce((s, n) => s + n.joined, 0);
  const totalDone = Object.values(counts).reduce((s, n) => s + n.done, 0);
  // All: what is live first, then what is coming, then what has ended.
  const list = show === 'running' ? running : show === 'upcoming' ? upcoming : show === 'finished' ? past : [...running, ...upcoming, ...past];

  const openNew = () => setAdding(true);

  /** One challenge as a card that reads as a sentence. */
  const card = (c: Challenge) => {
    const state = c.starts_on > now ? { tone: 'blue' as const, text: `Starts ${fmt(c.starts_on)}` }
      : c.ends_on < now ? { tone: 'gray' as const, text: `Ended ${fmt(c.ends_on)}` }
      : { tone: 'violet' as const, text: `Live until ${fmt(c.ends_on)}` };
    const n = counts[c.id] ?? { joined: 0, done: 0 };
    // Progress is computed, never stored (0052) — the same arithmetic the member sees.
    const share = n.joined > 0 ? Math.round((n.done / n.joined) * 100) : 0;
    return (
      <RdCard key={c.id} className="overflow-hidden flex flex-col" style={{ opacity: c.is_active ? 1 : 0.55 }} data-challenge={c.title}>
        <div className="relative" style={{ aspectRatio: '16 / 7' }}>
          {/* Only the gym's own picture — a placeholder would be one the gym never chose. */}
          {c.image_url
            ? <img src={c.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            : <div className="absolute inset-0 grid place-items-center" style={{ background: 'radial-gradient(120% 120% at 0% 0%, rgba(124,58,237,0.45), transparent 60%), radial-gradient(100% 100% at 100% 100%, rgba(245,158,11,0.25), transparent 60%), #17122A' }}>
                <Target size={30} style={{ color: '#C4B5FD' }} />
              </div>}
          <div className="absolute top-2.5 left-2.5 flex gap-1.5">
            <Pill tone={state.tone} solidDot>{state.text}</Pill>
            {c.repeats_weekly && <Pill tone="amber" icon={Repeat}>Repeats weekly</Pill>}
          </div>
          <div className="absolute top-2 right-2">
            <DotMenu label={`More for ${c.title}`} items={[
              { label: 'Standings', icon: BarChart3, onClick: () => setStanding({ id: c.id, title: c.title, target: c.target }), hidden: n.joined === 0 },
              { label: c.is_active ? 'Hide from members' : 'Show to members', icon: c.is_active ? EyeOff : Eye, onClick: () => void toggle(c), tone: c.is_active ? 'warn' : undefined },
            ]} />
          </div>
        </div>
        <div className="p-4 flex flex-col gap-2.5 flex-1">
          <p className="text-[15.5px] font-semibold text-white leading-snug">{c.title}</p>
          <p className="text-[13px] leading-snug" style={{ color: SECOND }}>
            Reach <b className="text-white">{c.target} {metricLabel(c.metric_key).toLowerCase()}</b>
            {c.repeats_weekly ? ' every week' : ` between ${fmt(c.starts_on)} and ${fmt(c.ends_on)}`}
            {c.reward_points > 0 ? <> — earns <b style={{ color: TONE.amber.fg }}>{c.reward_points} points</b></> : ''}.
          </p>
          <div className="mt-auto pt-2.5" style={{ borderTop: LINE }}>
            {/* The bar only means anything once somebody has joined. */}
            {n.joined > 0 ? (
              <>
                <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                  <span className="flex items-center gap-1.5" style={{ color: SECOND }}><Users size={13} /> {n.joined} joined</span>
                  <span className="tabular-nums" style={{ color: '#C4B5FD' }}>{n.done} done — {share}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full" style={{ width: `${share}%`, background: 'linear-gradient(90deg,#6D28D9,#8B5CF6)' }} />
                </div>
                <RdButton size="sm" variant="ghost" icon={BarChart3} className="mt-2" onClick={() => setStanding({ id: c.id, title: c.title, target: c.target })}>Standings</RdButton>
              </>
            ) : (
              <p className="text-[12.5px]" style={{ color: MUTED }}>Nobody joined yet — members see it under Challenges in the app.</p>
            )}
          </div>
        </div>
      </RdCard>
    );
  };

  const rail = (
    <RdCard className="p-5" data-how>
      <div className="flex items-center gap-2.5">
        <Sparkles size={20} style={{ color: '#C4B5FD' }} />
        <h3 className="text-[17px] font-semibold text-white">How a challenge works</h3>
      </div>
      <ol className="mt-3 space-y-2.5">
        {[
          'You pick what is counted, a target and the dates. Members see it under Challenges in the app.',
          'A member taps Join. From then the app counts their real check-ins, workouts and classes between the dates — nobody types a number.',
          'When they reach the target they are marked done and get the points, once. Nobody can tick it for them, you included.',
          'A weekly quest starts again every Monday with everyone in it, and pays once a week.',
        ].map((t, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug" style={{ color: SECOND }}>
            <span className="w-6 h-6 rounded-full grid place-items-center flex-none text-[12px] font-bold" style={{ background: TONE.violet.bg, color: TONE.violet.fg }}>{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      <p className="text-[13px] rounded-xl px-3 py-2.5 mt-4 leading-snug" style={{ background: TONE.amber.bg, color: SECOND, border: `1px solid ${TONE.amber.line}` }}>
        <b className="text-white">Example.</b> “10 training days in 30 days”, worth 250 points. Ana joins on day 1 and trains Monday, Wednesday and Friday:
        3 days a week, so she reaches 10 in her fourth week — her app shows 10 / 10, she is marked done, and 250 points land in her balance for Rewards
        (and count toward this month&rsquo;s season).
      </p>
    </RdCard>
  );

  return (
    <div className="rd-fit" data-challenges>
      <RdHeader title="Challenges" subtitle="Targets members join in the app — counted from real check-ins, never self-reported."
        actions={<RdButton variant="primary" icon={Plus} onClick={openNew}>New challenge</RdButton>} />

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <StatTile compact icon={Flag} label="Running" value={running.length} sub="live right now" active={tab === 'challenges' && show === 'running'} onClick={() => { setTab('challenges'); setShow('running'); }} />
        <StatTile compact icon={CalendarRange} label="Upcoming" value={upcoming.length} sub="not started yet" active={tab === 'challenges' && show === 'upcoming'} onClick={() => { setTab('challenges'); setShow('upcoming'); }} />
        <StatTile compact icon={Users} label="Members joined" value={totalJoined} sub="across every challenge" />
        <StatTile compact icon={Trophy} tone="amber" label="Completions" value={totalDone} sub="points paid once each" />
      </div>

      <PageTabs<Tab> label="Challenges sections" value={tab} onChange={setTab} tabs={[
        { key: 'challenges', label: 'Challenges', icon: Flag },
        { key: 'goal', label: 'Gym goal & squads', icon: Users },
        { key: 'templates', label: 'Goals members pick', icon: Goal },
      ]} />

      {tab === 'challenges' && (
        <FitBody rail={rail}>
          <RdCard className="flex flex-col min-h-0 overflow-hidden rd-fit-fill" data-challenge-list>
            <div className="flex items-center gap-2.5 flex-wrap px-4 py-3" style={{ borderBottom: LINE }}>
              <FilterChips<Show> compact value={show} onChange={setShow} items={[
                { key: 'running', label: 'Running', count: running.length },
                { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
                { key: 'finished', label: 'Finished', count: past.length },
                { key: 'all', label: 'All', count: items.length },
              ]} />
            </div>
            <div className="rd-fit-scroll p-4">
              {items.length === 0 ? (
                <EmptyBlock icon={Flag} title="No challenges yet" body="A challenge gives members a reason to come back that is not a renewal reminder."
                  action={<RdButton variant="primary" icon={Plus} onClick={openNew}>Create one</RdButton>} />
              ) : list.length === 0 ? (
                <EmptyBlock compact icon={Clock} title={show === 'running' ? 'Nothing running right now' : show === 'upcoming' ? 'Nothing scheduled' : 'Nothing has finished yet'}
                  action={show !== 'finished' ? <RdButton variant="soft" icon={Plus} onClick={openNew}>Plan one</RdButton> : undefined} />
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}>{list.map(card)}</div>
              )}
            </div>
          </RdCard>
        </FitBody>
      )}

      {/* The whole gym's goal and the members' squads (0124). */}
      {tab === 'goal' && <div className="rd-fit-fill"><div className="rd-fit-scroll pr-1"><GymGoalSection /></div></div>}
      {/* The goals members pick in the app (0055) — tuned here, not in SQL. */}
      {tab === 'templates' && <div className="rd-fit-fill"><div className="rd-fit-scroll pr-1"><GoalTemplatesSection /></div></div>}

      <ChallengeStandingsModal challenge={standing} onClose={() => setStanding(null)} />

      <Modal
        isOpen={adding}
        onClose={() => setAdding(false)}
        title="New challenge"
        subtitle="Counted automatically between the two dates"
        size="lg"
        footer={<>
          <RdButton variant="ghost" onClick={() => setAdding(false)}>Cancel</RdButton>
          <RdButton variant="primary" icon={Flag} onClick={() => void add()} disabled={busy || !form.title.trim()}>{busy ? 'Creating…' : 'Create challenge'}</RdButton>
        </>}
      >
        <div className="space-y-4">
          <div>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white mb-1.5"><Wand2 size={14} style={{ color: '#C4B5FD' }} /> Start from one</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.filter((pr) => metrics.some((m) => m.key === pr.metric)).map((pr) => {
                const on = form.title === pr.title;
                return (
                  <button key={pr.title} type="button"
                    onClick={() => setForm({ ...form, title: pr.title, metric_key: pr.metric, target: String(pr.target), reward_points: String(pr.points),
                      starts_on: today(), ends_on: inDays(pr.days - 1), repeatsWeekly: pr.weekly })}
                    className="h-8 px-3 rounded-full text-[12.5px] font-semibold"
                    style={on ? { background: 'rgba(124,58,237,0.22)', color: '#EDE9FE', border: '1px solid rgba(139,92,246,0.7)' }
                      : { color: SECOND, border: '1px solid rgba(255,255,255,0.1)' }}>
                    {pr.title}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RdField label="Title">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. 15 visits in November" className={RD_INPUT} style={RD_INPUT_STYLE} />
            </RdField>
            <RdField label="Description (optional)">
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Shown to members" className={RD_INPUT} style={RD_INPUT_STYLE} />
            </RdField>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr)' }}>
            <RdField label="What is counted" hint={COUNTS[form.metric_key]}>
              <RdSelect label="What is counted" value={form.metric_key} onChange={(v) => setForm({ ...form, metric_key: v })} className="w-full">
                {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </RdSelect>
            </RdField>
            <RdField label="Target">
              <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} inputMode="numeric" aria-label="Target" className={RD_INPUT} style={RD_INPUT_STYLE} />
            </RdField>
            <RdField label="Points">
              <input value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: e.target.value })} inputMode="numeric" aria-label="Points" className={RD_INPUT} style={RD_INPUT_STYLE} />
            </RdField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>Starts</span>
              <DatePicker mode="future" value={form.starts_on}
                onChange={(v) => setForm({ ...form, starts_on: v, ends_on: form.ends_on && v && form.ends_on < v ? '' : form.ends_on })} />
            </label>
            <label className="block">
              <span className="block text-[13px] font-medium mb-1.5" style={{ color: SECOND }}>Ends</span>
              <DatePicker mode="future" min={form.starts_on || undefined} value={form.ends_on} onChange={(v) => setForm({ ...form, ends_on: v })} />
            </label>
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer rounded-xl p-3" style={{ border: LINE }}>
            <input type="checkbox" className="mt-0.5 accent-violet-500" checked={form.repeatsWeekly} aria-label="Repeat every week"
              onChange={(e) => setForm({ ...form, repeatsWeekly: e.target.checked })} />
            <span className="text-[13px]" style={{ color: SECOND }}>
              <b className="text-white">Repeat every week</b> — a weekly quest. Each Monday it starts again, every member is in it
              automatically, and it pays its points once a week. The dates above are when it runs.
            </span>
          </label>
          {/* The challenge in one sentence — what members will be agreeing to. */}
          {form.title.trim() && Number(form.target) > 0 && form.ends_on >= form.starts_on && (
            <p className="text-[13.5px] rounded-xl px-3 py-2.5" style={{ background: TONE.violet.bg, border: `1px solid ${TONE.violet.line}`, color: '#DDD6FE' }}>
              <b className="text-white">Members will read:</b> {form.repeatsWeekly ? 'Every week' : `${fmt(form.starts_on)} – ${fmt(form.ends_on)}`}, reach{' '}
              <b className="text-white">{form.target} × {(metrics.find((m) => m.key === form.metric_key)?.label ?? form.metric_key).toLowerCase()}</b>
              {Number(form.reward_points) > 0 ? <> and earn <b className="text-white">{form.reward_points} points</b></> : ''}.
            </p>
          )}
          <ImageField value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} kind="challenges" label="Picture" hint="Shown with the challenge in the member app." />
          <p className="text-[12px] leading-relaxed" style={{ color: MUTED }}>
            Only things that can be counted inside a date range are listed. Streaks and &ldquo;days since joining&rdquo; describe a whole history,
            so a target for them inside dates would be meaningless.
          </p>
        </div>
      </Modal>
    </div>
  );
}
