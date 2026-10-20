import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Flag, Building2, UsersRound, Goal, Sparkles, Repeat, Eye, EyeOff, BarChart3, Lightbulb, Check, MoreHorizontal } from 'lucide-react';
import { ChallengeStandingsModal } from '../components/ui/EngagementRules';
import ImageField from '../components/ui/ImageField';
import Popover from '../components/ui/Popover';
import SentenceDate from '../components/challenges/SentenceDate';
import GymGoalTab from '../components/challenges/GymGoalTab';
import SquadsTab from '../components/challenges/SquadsTab';
import GoalListTab from '../components/challenges/GoalListTab';
import './attendance/att.css';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { todayKey, addDays, daysBetween, localDateKey } from '../utils/dates';

/**
 * Challenges & goals (0052/0124/0055, redrawn 2026-10-20 to the approved
 * mock-up): the four ideas explained where they are chosen — challenges members
 * join, one goal for the whole gym, the members' squads, and the goals members
 * pick — each counted from real check-ins and workouts, never typed in.
 *
 * There is no "mark complete": `challenge_participants` has no UPDATE policy
 * for anyone, and completion is `settle_challenges()` from real counts.
 */

interface Metric { key: string; label: string; unit: string | null }
interface Challenge {
  id: string; title: string; description: string | null; metric_key: string; target: number; starts_on: string; ends_on: string;
  reward_points: number; is_active: boolean; image_url: string | null; repeats_weekly?: boolean; parent_id?: string | null;
}
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
const PRESETS = [
  { name: '10 days in 30', title: '10 training days in 30 days', metric: 'training_days', target: 10, days: 30, points: 250, weekly: false, line: 'Ten days, any ten. Show up and it counts.' },
  { name: 'Weekend warrior', title: 'Weekend warrior', metric: 'weekend_days', target: 6, days: 30, points: 200, weekly: false, line: 'Six weekend days this month.' },
  { name: 'Early bird week', title: 'Early bird week', metric: 'early_checkins', target: 3, days: 7, points: 60, weekly: true, line: 'Three check-ins before 7am, every week.' },
  { name: 'Class explorer', title: 'Class explorer', metric: 'classes_attended', target: 8, days: 28, points: 300, weekly: false, line: 'Eight classes in four weeks.' },
  { name: 'Steady month', title: 'Steady month', metric: 'consistent_weeks', target: 4, days: 30, points: 300, weekly: false, line: 'Twice a week, four weeks running.' },
];
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
type View = 'ch' | 'gg' | 'sq' | 'gp';
type Show = 'running' | 'upcoming' | 'finished';

export default function Challenges() {
  const [today] = useState(() => todayKey());
  const [params, setParams] = useSearchParams();
  const view = (['ch', 'gg', 'sq', 'gp'].includes(params.get('tab') ?? '') ? params.get('tab') : 'ch') as View;
  const go = (v: View) => setParams(v === 'ch' ? {} : { tab: v }, { replace: true });

  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [items, setItems] = useState<Challenge[] | null | undefined>(undefined);
  const [counts, setCounts] = useState<Record<string, { joined: number; done: number }>>({});
  const [summary, setSummary] = useState<{ goal: string; squads: string; list: string }>({ goal: '…', squads: '…', list: '…' });
  const [avgDays, setAvgDays] = useState<number | null>(null);
  const [show, setShow] = useState<Show>('running');
  const [standing, setStanding] = useState<{ id: string; title: string; target: number } | null>(null);
  const [menu, setMenu] = useState<{ at: HTMLElement; c: Challenge } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState(PRESETS[0].name);
  const [form, setForm] = useState({ title: PRESETS[0].title, description: PRESETS[0].line, metric_key: 'training_days', target: '10',
    starts_on: today, ends_on: addDays(today, 29), reward_points: '250', imageUrl: '', repeatsWeekly: false });

  const load = useCallback(async () => {
    // Completions are the database's: settle anyone who reached a target since the last look (0159).
    await supabase.rpc('settle_challenges').then(() => undefined, () => undefined);
    const [m, c, p] = await Promise.all([
      supabase.from('achievement_metrics').select('key, label, unit').eq('challengeable', true).order('sort_order'),
      supabase.from('challenges').select('id, title, description, metric_key, target, starts_on, ends_on, reward_points, is_active, image_url, repeats_weekly, parent_id')
        .order('ends_on', { ascending: false }),
      supabase.from('challenge_participants').select('challenge_id, completed_on'),
    ]);
    if (m.error || c.error || p.error) { setItems(null); return; }
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
  }, []);

  /** The line under each of the four ideas — the same numbers each tab shows. */
  const loadSummary = useCallback(async () => {
    const [g, s, sm, t, f] = await Promise.all([
      supabase.rpc('current_gym_goal'),
      supabase.from('squads').select('id', { count: 'exact', head: true }).is('archived_at', null),
      supabase.from('squad_members').select('id', { count: 'exact', head: true }).is('left_at', null),
      supabase.from('goal_templates').select('key, is_active'),
      supabase.from('fitness_goals').select('id', { count: 'exact', head: true }).is('achieved_on', null).not('template_key', 'is', null),
    ]);
    const goal = Array.isArray(g.data) ? g.data[0] as { id: string; target: number; metric: string } | undefined : undefined;
    let goalWord = 'none running';
    if (goal) {
      const r = await supabase.rpc('gym_goal_progress', { p_goal: goal.id });
      const row = Array.isArray(r.data) ? r.data[0] as { progress: number } | undefined : undefined;
      goalWord = `${Number(row?.progress ?? 0).toLocaleString()} of ${goal.target.toLocaleString()} ${goal.metric === 'workouts_logged' ? 'workouts' : goal.metric === 'checkins' ? 'check-ins' : 'days'}`;
    }
    setSummary({
      goal: goalWord,
      squads: s.error ? '—' : `${s.count ?? 0} squad${s.count === 1 ? '' : 's'} · ${sm.count ?? 0} members`,
      list: t.error ? '—' : `${(t.data ?? []).filter((x) => x.is_active).length} on the list · ${f.count ?? 0} using`,
    });
  }, []);

  useEffect(() => {
    void (async () => {
      await Promise.all([load(), loadSummary()]);
      // The hint under a new challenge: how many days a member who came in the last 30 days checked in, on average.
      const since = new Date(); since.setDate(since.getDate() - 30);
      const a = await supabase.from('attendance').select('member_id, check_in_time').gte('check_in_time', since.toISOString());
      if (!a.error && a.data?.length) {
        const per = new Map<string, Set<string>>();
        for (const r of a.data) { if (!per.has(r.member_id)) per.set(r.member_id, new Set()); per.get(r.member_id)!.add(localDateKey(r.check_in_time)); }
        setAvgDays(Math.round([...per.values()].reduce((n, x) => n + x.size, 0) / per.size));
      }
    })();
  }, [load, loadSummary]);

  const add = async () => {
    const target = Number(form.target);
    const points = Number(form.reward_points);
    if (!form.title.trim() || !(target > 0)) { showToast('A name and a target above zero, please', 'error'); return; }
    if (form.ends_on < form.starts_on) { showToast('The challenge cannot end before it starts', 'error'); return; }
    setBusy(true);
    const { error } = await supabase.from('challenges').insert({
      title: form.title.trim(), description: form.description.trim() || null, metric_key: form.metric_key, target,
      starts_on: form.starts_on, ends_on: form.ends_on, reward_points: Number.isFinite(points) ? points : 0,
      image_url: form.imageUrl.trim() || null, ...(form.repeatsWeekly ? { repeats_weekly: true } : {}),
    });
    setBusy(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(form.starts_on <= today ? 'Challenge started — members can join it in the app' : `Challenge set — it opens on ${fmt(form.starts_on)}`, 'success');
    await load();
  };
  const toggle = async (c: Challenge) => {
    const { data, error } = await supabase.from('challenges').update({ is_active: !c.is_active }).eq('id', c.id).select('id');
    if (error || !data?.length) { showToast(error?.message ?? 'Only the owner can change challenges', 'error'); return; }
    setItems((prev) => prev?.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
    showToast(c.is_active ? `${c.title} is hidden from members` : `${c.title} is shown again`, 'success');
  };
  const applyPreset = (p: typeof PRESETS[number] | null) => {
    if (!p) { setPreset('Blank'); setForm({ ...form, title: '', description: '', target: '', reward_points: '0' }); return; }
    setPreset(p.name);
    const starts = form.starts_on < today ? today : form.starts_on;
    setForm({ ...form, title: p.title, description: p.line, metric_key: p.metric, target: String(p.target), reward_points: String(p.points), ends_on: addDays(starts, p.days - 1), starts_on: starts, repeatsWeekly: p.weekly });
  };

  const list = items ?? [];
  const running = list.filter((c) => c.starts_on <= today && c.ends_on >= today);
  const upcoming = list.filter((c) => c.starts_on > today);
  const past = list.filter((c) => c.ends_on < today);
  const shown = show === 'running' ? running : show === 'upcoming' ? upcoming : past;
  const runningJoined = running.reduce((n, c) => n + (counts[c.id]?.joined ?? 0), 0);
  const metricLabel = (key: string) => (metrics.find((m) => m.key === key)?.label ?? key).toLowerCase();
  const target = Number(form.target) || 0;
  const span = daysBetween(form.starts_on, form.ends_on) + 1;

  const ideas: [View, typeof Flag, string, React.ReactNode, string][] = [
    ['ch', Flag, 'Challenges', <>A target with dates that members <b style={{ color: '#fff' }}>join</b>. Each one chases it alone; finishing pays points once.</>, `${running.length} running · ${runningJoined} joined`],
    ['gg', Building2, 'Gym goal', <>One target for <b style={{ color: '#fff' }}>everyone together</b>. Every visit adds to it; when it is reached, everyone who helped gets the points.</>, summary.goal],
    ['sq', UsersRound, 'Squads', <>Small groups of friends that <b style={{ color: '#fff' }}>members make</b> in the app, with a weekly target they hit together.</>, summary.squads],
    ['gp', Goal, 'Goals members pick', <>A <b style={{ color: '#fff' }}>personal goal</b> each member chooses from your list, like “train 12 days a month”. Private to them and their coach.</>, summary.list],
  ];

  return (
    <div className="att" data-challenges>
      <div className="a-head">
        <div className="min-w-0"><h1>Challenges &amp; goals</h1><p>Four ways to keep members coming back — every one counted from real check-ins and workouts, never typed in</p></div>
        {view === 'ch' && <button type="button" className="a-btn violet" style={{ marginLeft: 'auto' }} onClick={() => applyPreset(PRESETS[0])}><Plus size={15} />New challenge</button>}
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', flex: 'none' }} role="tablist" aria-label="Four ideas">
        {ideas.map(([k, Icon, title, body, em]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={`a-what ${view === k ? 'on' : ''}`} onClick={() => go(k)} data-idea={k}>
            <div className="a-ic"><Icon size={16} /></div>
            <div><b>{title}</b><p>{body}</p><em>{em}</em></div>
          </button>
        ))}
      </div>

      {view === 'ch' && (
        <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', flex: 1 }}>
          <div className="a-card" data-challenge-list>
            <div className="a-ct">
              <div style={{ display: 'flex', gap: 6 }}>
                {([['running', 'Running', running.length], ['upcoming', 'Upcoming', upcoming.length], ['finished', 'Finished', past.length]] as const).map(([k, l, n]) => (
                  <button key={k} type="button" className={`a-chip ${show === k ? 'v' : ''}`} onClick={() => setShow(k)}>{l} <em>{n}</em></button>
                ))}
              </div>
              <small>tap one to see who joined and who finished</small>
            </div>
            <div className="a-scroll grow">
              {items === undefined ? <p className="a-sub">Loading…</p> : items === null ? <p className="a-sub">Challenges could not be loaded — a connection problem, not an empty list.</p>
                : shown.length === 0 ? <p className="a-sub" style={{ padding: '10px 0' }}>{show === 'running' ? 'Nothing running right now — start one on the right.' : show === 'upcoming' ? 'Nothing scheduled.' : 'Nothing has finished yet.'}</p> : (
                <table className="a-table">
                  <thead><tr><th>Challenge</th><th>Dates</th><th>Joined</th><th>Finished</th><th>Points</th><th /></tr></thead>
                  <tbody>
                    {shown.map((c) => {
                      const n = counts[c.id] ?? { joined: 0, done: 0 };
                      const left = daysBetween(today, c.ends_on);
                      return (
                        <tr key={c.id} data-challenge={c.title} style={{ opacity: c.is_active === false ? 0.55 : 1, cursor: n.joined ? 'pointer' : undefined }}
                          onClick={() => n.joined && setStanding({ id: c.id, title: c.title, target: c.target })}>
                          <td><b>{c.title}</b> {c.repeats_weekly && <span className="a-pill v"><Repeat size={11} />weekly</span>} {c.is_active === false && <span className="a-pill">hidden</span>}
                            <div className="a-sub">{c.target} {metricLabel(c.metric_key)} · alone</div></td>
                          <td>{c.repeats_weekly ? 'Every Mon – Sun' : `${fmt(c.starts_on)} – ${fmt(c.ends_on)}`}
                            <div className="a-sub">{c.repeats_weekly ? 'resets Monday' : c.starts_on > today ? `starts in ${daysBetween(today, c.starts_on)} days` : c.ends_on < today ? 'ended' : left === 0 ? 'last day' : `${left} day${left === 1 ? '' : 's'} left`}</div></td>
                          <td>{c.starts_on > today ? <span className="a-sub">—</span> : <b>{n.joined}</b>}</td>
                          <td>{n.joined ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div className="a-bar" style={{ maxWidth: 80 }}><i style={{ width: `${(n.done / n.joined) * 100}%` }} /></div><span className="a-sub">{n.done} done</span></div> : <span className="a-sub">—</span>}</td>
                          <td>{c.reward_points}</td>
                          <td style={{ textAlign: 'right' }}><button type="button" className="a-btn ghost sm" aria-label={`More for ${c.title}`} onClick={(e) => { e.stopPropagation(); setMenu({ at: e.currentTarget, c }); }}><MoreHorizontal size={14} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="a-card glow" style={{ overflowY: 'auto' }} data-challenge-new>
            <div className="a-ct"><h3><Sparkles size={16} />New challenge</h3><small>read it like a sentence</small></div>
            <div className="a-lbl" style={{ marginBottom: 6 }}>Start from an idea</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRESETS.filter((p) => !metrics.length || metrics.some((m) => m.key === p.metric)).map((p) => (
                <button key={p.name} type="button" className={`a-chip ${preset === p.name ? 'on' : ''}`} onClick={() => applyPreset(p)}>{p.name}</button>
              ))}
              <button type="button" className={`a-chip ${preset === 'Blank' ? 'on' : ''}`} onClick={() => applyPreset(null)}>Blank</button>
            </div>
            <div className="a-sentence" style={{ margin: '14px 0 6px' }}>
              Members who join reach <input aria-label="Target" inputMode="numeric" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value.replace(/\D/g, '') })} />{' '}
              <select aria-label="What is counted" value={form.metric_key} onChange={(e) => setForm({ ...form, metric_key: e.target.value })} data-tip={COUNTS[form.metric_key]}>
                {metrics.map((m) => <option key={m.key} value={m.key}>{m.label.toLowerCase()}</option>)}
              </select>{' '}
              {form.repeatsWeekly ? 'every week, from ' : 'between '}<SentenceDate label="Starts" value={form.starts_on} onChange={(v) => setForm({ ...form, starts_on: v, ends_on: form.ends_on < v ? addDays(v, 29) : form.ends_on })} />{' '}
              {form.repeatsWeekly ? 'until ' : 'and '}<SentenceDate label="Ends" value={form.ends_on} min={form.starts_on} onChange={(v) => setForm({ ...form, ends_on: v })} />, and earn{' '}
              <input aria-label="Points" inputMode="numeric" value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: e.target.value.replace(/\D/g, '') })} /> points.
            </div>
            <div className="a-sub" style={{ marginBottom: 8 }}>{COUNTS[form.metric_key]}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <button type="button" className={`a-toggle ${form.repeatsWeekly ? '' : 'off'}`} aria-pressed={form.repeatsWeekly} aria-label="Repeat every week" onClick={() => setForm({ ...form, repeatsWeekly: !form.repeatsWeekly })} />
              <span className="a-sub">Repeat every week — a fresh start each Monday, everyone in, paid once a week</span>
            </div>
            <div className="a-fld"><label htmlFor="ch-name">Name members see</label><input id="ch-name" className="a-in" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. 10 days in November" /></div>
            <div className="a-fld" style={{ marginTop: 8 }}><label htmlFor="ch-line">A line to get them going <span style={{ fontWeight: 500 }}>· optional</span></label>
              <input id="ch-line" className="a-in" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div style={{ marginTop: 8 }}><ImageField value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} kind="challenges" label="Picture" hint="Optional — shown with the challenge in the app." /></div>
            <div className="a-lbl" style={{ margin: '12px 0 6px' }}>What members see</div>
            <div className="a-prev">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{form.title.trim() || 'Your challenge'}</b>{Number(form.reward_points) > 0 && <span className="a-pill a">{form.reward_points} pts</span>}</div>
              <div className="a-sub" style={{ margin: '4px 0 8px' }}>{form.repeatsWeekly ? 'Every week' : `${fmt(form.starts_on)} – ${fmt(form.ends_on)}`}{form.description.trim() ? ` · ${form.description.trim()}` : ''}</div>
              <div className="a-big"><i style={{ width: '0%' }} /></div>
              <div className="a-sub" style={{ marginTop: 6 }}>You: 0 of {target} {metricLabel(form.metric_key)}</div>
              <span className="a-btn amber sm" style={{ marginTop: 10, alignSelf: 'flex-start', pointerEvents: 'none' }}>Join</span>
            </div>
            {avgDays != null && (form.metric_key === 'training_days' || form.metric_key === 'verified_days') && target > 0 && (
              <div className="a-hint" style={{ marginTop: 10 }}><Lightbulb size={14} />
                <span>A good target is one most members can reach by trying. Members who came in the last 30 days checked in on <b style={{ color: '#fff' }}>{avgDays} days</b> on average
                  {!form.repeatsWeekly && span > 0 ? ` — ${target} in ${span} days is ${target > avgDays * 1.6 * (span / 30) ? 'likely to lose people' : target > avgDays * (span / 30) ? 'a stretch' : 'within reach'}` : ''}.</span></div>
            )}
            <button type="button" className="a-btn violet" style={{ marginTop: 12 }} disabled={busy || !form.title.trim() || target <= 0} onClick={() => void add()} data-start-challenge>
              <Check size={15} />{form.starts_on <= today ? 'Start the challenge today' : `Start the challenge on ${fmt(form.starts_on)}`}</button>
          </div>
        </div>
      )}
      {view === 'gg' && <GymGoalTab onChanged={() => void loadSummary()} />}
      {view === 'sq' && <SquadsTab />}
      {view === 'gp' && <GoalListTab onChanged={() => void loadSummary()} />}

      <Popover anchor={menu?.at ?? null} open={!!menu} onClose={() => setMenu(null)} width={210}>
        {menu && (
          <div className="p-1.5 flex flex-col">
            {(counts[menu.c.id]?.joined ?? 0) > 0 && (
              <button type="button" className="flex items-center gap-2 text-left px-3 py-2 rounded-lg text-[13px] text-white hover:bg-white/5"
                onClick={() => { setStanding({ id: menu.c.id, title: menu.c.title, target: menu.c.target }); setMenu(null); }}><BarChart3 size={14} />Standings</button>
            )}
            <button type="button" className="flex items-center gap-2 text-left px-3 py-2 rounded-lg text-[13px] text-white hover:bg-white/5"
              onClick={() => { const c = menu.c; setMenu(null); void toggle(c); }}>{menu.c.is_active ? <><EyeOff size={14} />Hide from members</> : <><Eye size={14} />Show to members</>}</button>
          </div>
        )}
      </Popover>
      <ChallengeStandingsModal challenge={standing} onClose={() => setStanding(null)} />
    </div>
  );
}
