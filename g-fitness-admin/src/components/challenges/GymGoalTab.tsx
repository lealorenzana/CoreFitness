import { useCallback, useEffect, useState } from 'react';
import { Building2, History, Target, Megaphone, CalendarPlus, Check, X, Calculator, RotateCcw } from 'lucide-react';
import Popover from '../ui/Popover';
import DatePicker from '../ui/DatePicker';
import SentenceDate from './SentenceDate';
import { showToast } from '../../utils/toast';
import { supabase } from '../../lib/supabaseClient';
import { assertWrote } from '../../lib/api/mutate';
import { broadcastNotification } from '../../lib/api/notifications';
import { pushToMany } from '../../lib/api/notify';
import { todayKey, addDays, daysBetween, localDateKey } from '../../utils/dates';

const UNIT: Record<string, string> = { training_days: 'training days', workouts_logged: 'workouts', checkins: 'check-ins' };
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
interface Goal {
  id: string; title: string; metric: string; target: number; starts_on: string; ends_on: string;
  reward_points: number; is_active: boolean; reached_at: string | null;
}

/**
 * Challenges → Gym goal (0124, redrawn 2026-10-20 to the mock-up): the goal
 * running now with what it needs a day to finish, the goals before it, and the
 * next one as a sentence. Progress is the database's (`gym_goal_progress`),
 * reaching it is `settle_gym_goals()`'s — nobody types a number in.
 */
export default function GymGoalTab({ onChanged }: { onChanged?: () => void }) {
  const [today] = useState(() => todayKey());
  const [goals, setGoals] = useState<Goal[] | null | undefined>(undefined);
  const [progress, setProgress] = useState<Record<string, { progress: number; contributors: number }>>({});
  const [monthDays, setMonthDays] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', metric: 'training_days', target: '500', starts_on: today, ends_on: addDays(today, 29), reward_points: '50' });
  const [busy, setBusy] = useState(false);
  const [moreAt, setMoreAt] = useState<HTMLElement | null>(null);

  const load = useCallback(async () => {
    await supabase.rpc('settle_gym_goals').then(() => undefined, () => undefined);
    const g = await supabase.from('gym_goals').select('id, title, metric, target, starts_on, ends_on, reward_points, is_active, reached_at').order('ends_on', { ascending: false });
    if (g.error) { setGoals(null); return; }
    const list = (g.data ?? []) as Goal[];
    const p: Record<string, { progress: number; contributors: number }> = {};
    await Promise.all(list.map(async (x) => {
      const r = await supabase.rpc('gym_goal_progress', { p_goal: x.id });
      const row = Array.isArray(r.data) ? r.data[0] as { progress: number; contributors: number } | undefined : undefined;
      if (row) p[x.id] = { progress: Number(row.progress), contributors: Number(row.contributors) };
    }));
    setProgress(p);
    setGoals(list);
  }, []);
  useEffect(() => {
    void (async () => {
      await load();
      // What the gym does in a month, for the hint: check-in days in the last 30 (one per member a day).
      const since = new Date(); since.setDate(since.getDate() - 30);
      const a = await supabase.from('attendance').select('member_id, check_in_time').gte('check_in_time', since.toISOString());
      if (!a.error) setMonthDays(new Set((a.data ?? []).map((r) => `${r.member_id}:${localDateKey(r.check_in_time)}`)).size);
    })();
  }, [load]);

  const current = (goals ?? []).find((g) => g.is_active && !g.reached_at && g.starts_on <= today && g.ends_on >= today) ?? null;
  const upcoming = (goals ?? []).filter((g) => g.is_active && g.starts_on > today);
  const past = (goals ?? []).filter((g) => g !== current && !upcoming.includes(g));

  // The next goal starts the day after the running one ends (or today), unless the owner changes it.
  const [seeded, setSeeded] = useState(false);
  if (!seeded && goals) {
    setSeeded(true);
    if (current) setForm((f) => ({ ...f, starts_on: addDays(current.ends_on, 1), ends_on: addDays(current.ends_on, 30) }));
  }

  const add = async () => {
    const target = Number(form.target);
    const points = Number(form.reward_points);
    if (form.title.trim().length < 2 || !(target > 0)) { showToast('Give it a name and a target above zero.', 'error'); return; }
    if (form.ends_on < form.starts_on) { showToast('The goal cannot end before it starts.', 'error'); return; }
    setBusy(true);
    const { error } = await supabase.from('gym_goals').insert({
      title: form.title.trim(), metric: form.metric, target: Math.round(target),
      starts_on: form.starts_on, ends_on: form.ends_on, reward_points: Number.isFinite(points) ? Math.round(points) : 0,
    });
    setBusy(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(form.starts_on <= today ? 'Goal set — members see it on Today.' : `Goal set — it starts on ${fmt(form.starts_on)}.`, 'success');
    setForm({ ...form, title: '' });
    await load();
    onChanged?.();
  };
  const patch = async (g: Goal, change: Partial<Goal>, ok: string) => {
    const { data, error } = await supabase.from('gym_goals').update(change).eq('id', g.id).select('id');
    if (error) { showToast(error.message, 'error'); return; }
    try { assertWrote(data, 'That goal could not be changed — only the owner sets gym goals.'); } catch (e) { showToast((e as Error).message, 'error'); return; }
    showToast(ok, 'success');
    await load();
    onChanged?.();
  };
  const announce = async (g: Goal) => {
    try {
      const p = progress[g.id]?.progress ?? 0;
      const input = { type: 'event', title: g.title, message: `The whole gym is at ${p.toLocaleString()} of ${g.target.toLocaleString()} ${UNIT[g.metric]} — every visit counts${g.reward_points ? `, and everyone who helps gets ${g.reward_points} points when we reach it` : ''}. Until ${fmt(g.ends_on)}.`, actionUrl: '/member/home' };
      const r = await broadcastNotification({ audience: 'all_members', ...input });
      void pushToMany(r.recipientIds, { type: 'event', title: input.title, message: input.message, actionUrl: input.actionUrl });
      showToast(`Announced to ${r.recipients} member${r.recipients === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not announce it', 'error');
    }
  };

  if (goals === undefined) return <p className="a-sub">Loading…</p>;
  if (goals === null) return <div className="a-card"><p className="a-sub">The gym goal needs migration 0124.</p></div>;

  const cp = current ? progress[current.id] ?? { progress: 0, contributors: 0 } : null;
  const left = current ? daysBetween(today, current.ends_on) + 1 : 0;
  const elapsed = current ? Math.max(1, daysBetween(current.starts_on, today) + 1) : 1;
  const need = current && cp ? Math.max(0, Math.ceil((current.target - cp.progress) / Math.max(1, left))) : 0;
  const pace = current && cp ? Math.round(cp.progress / elapsed) : 0;
  const target = Number(form.target) || 0;

  return (
    <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', flex: 1 }} data-gym-goal>
      <div className="a-grid" style={{ gridTemplateRows: 'auto minmax(0, 1fr)' }}>
        {current && cp ? (
          <div className="a-card glow" data-goal-now>
            <div className="a-ct"><h3><Building2 size={16} />{current.title} — the whole gym</h3><span className="a-pill v">running · {left} day{left === 1 ? '' : 's'} left</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><div className="a-num" style={{ fontSize: 34 }}>{cp.progress.toLocaleString()}</div>
              <span className="a-sub" style={{ fontSize: 13 }}>of {current.target.toLocaleString()} {UNIT[current.metric]} · {cp.contributors} member{cp.contributors === 1 ? ' has' : 's have'} helped</span></div>
            <div className="a-big" style={{ margin: '10px 0 6px' }}><i style={{ width: `${Math.min(100, (cp.progress / current.target) * 100)}%` }} /></div>
            <div className="a-sub">To finish on time the gym needs <b style={{ color: 'var(--a-a300)' }}>{need.toLocaleString()} a day</b>. So far it has done about {pace.toLocaleString()} a day.
              {current.reward_points ? <> Everyone who adds at least one gets <b style={{ color: '#fff' }}>{current.reward_points} points</b> when it is reached.</> : ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button type="button" className="a-btn sm" onClick={() => void announce(current)} data-announce><Megaphone size={13} />Announce it again</button>
              <button type="button" className="a-btn ghost sm" onClick={(e) => setMoreAt(e.currentTarget)}><CalendarPlus size={13} />Give it more time</button>
              <button type="button" className="a-btn ghost sm" onClick={() => void patch(current, { is_active: false }, `${current.title} is ended — nobody gets points for it`)}>End it</button>
            </div>
            <Popover anchor={moreAt} open={!!moreAt} onClose={() => setMoreAt(null)} width={300}>
              <div className="p-3"><p className="text-[12px] mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Ends on</p>
                <DatePicker mode="future" min={addDays(current.ends_on, 1)} value={current.ends_on}
                  onChange={(v) => { setMoreAt(null); void patch(current, { ends_on: v }, `${current.title} now runs until ${fmt(v)}`); }} /></div>
            </Popover>
          </div>
        ) : (
          <div className="a-card glow"><div className="a-ct"><h3><Building2 size={16} />No gym goal running</h3></div>
            <p className="a-sub">Set one on the right — every member's visits add to it, and everyone who helped gets the points when it is reached.</p></div>
        )}
        <div className="a-card" data-goal-history>
          <div className="a-ct"><h3><History size={16} />Past and coming gym goals</h3></div>
          <div className="a-scroll grow">
            {upcoming.length + past.length === 0 && <p className="a-sub">Nothing yet.</p>}
            {[...upcoming, ...past].map((g) => {
              const p = progress[g.id];
              const reached = !!g.reached_at;
              const coming = upcoming.includes(g);
              return (
                <div key={g.id} className="a-row" data-goal-row={g.title}>
                  <div className="a-ic" style={reached || coming ? undefined : { background: 'var(--a-alight)', color: 'var(--a-a300)' }}>{reached ? <Check size={15} /> : coming ? <Target size={15} /> : <X size={15} />}</div>
                  <div className="t"><b>{g.title} — {g.target.toLocaleString()} {UNIT[g.metric]}</b>
                    <small>{coming ? `starts ${fmt(g.starts_on)} · runs to ${fmt(g.ends_on)}`
                      : reached ? `reached ${fmt(localDateKey(g.reached_at!))} · ${p?.contributors ?? 0} members${g.reward_points ? ` got ${g.reward_points} points` : ''}`
                      : `${g.is_active ? 'ended' : 'stopped'} at ${(p?.progress ?? 0).toLocaleString()} · nobody got points`}</small></div>
                  {!reached && !g.is_active && g.ends_on >= today && <button type="button" className="a-btn ghost sm" onClick={() => void patch(g, { is_active: true }, `${g.title} is running again`)}><RotateCcw size={13} />Resume</button>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="a-card" style={{ overflowY: 'auto' }} data-goal-new>
        <div className="a-ct"><h3><Target size={16} />{current ? 'Next gym goal' : 'A gym goal'}</h3><small>{current ? 'starts when this one ends' : 'one target for everyone'}</small></div>
        <div className="a-sentence" style={{ marginBottom: 10 }}>
          Together, the gym reaches <input aria-label="Goal target" inputMode="numeric" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value.replace(/\D/g, '') })} />{' '}
          <select aria-label="What counts" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
            <option value="training_days">training days</option><option value="workouts_logged">workouts</option><option value="checkins">check-ins</option>
          </select>{' '}
          from <SentenceDate label="Goal starts" value={form.starts_on} onChange={(v) => setForm({ ...form, starts_on: v, ends_on: form.ends_on < v ? addDays(v, 29) : form.ends_on })} />{' '}
          to <SentenceDate label="Goal ends" value={form.ends_on} min={form.starts_on} onChange={(v) => setForm({ ...form, ends_on: v })} />; everyone who helped gets{' '}
          <input aria-label="Reward points" inputMode="numeric" value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: e.target.value.replace(/\D/g, '') })} /> points.
        </div>
        <div className="a-fld"><label htmlFor="goal-name">Name on Today</label>
          <input id="goal-name" className="a-in" maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. November days" /></div>
        {monthDays != null && form.metric !== 'workouts_logged' && (
          <div className="a-hint" style={{ marginTop: 10 }}><Calculator size={14} />
            <span>In the last 30 days your members checked in on <b style={{ color: '#fff' }}>{monthDays.toLocaleString()} days</b> between them{form.metric === 'training_days' ? ' (logged workouts at home add to training days)' : ''}.
              {target > 0 && monthDays > 0 ? ` ${target.toLocaleString()} over ${daysBetween(form.starts_on, form.ends_on) + 1} days is ${target > monthDays * 1.3 ? 'a lot more than that — it may be out of reach' : target > monthDays ? 'reachable with a push' : 'within what they already do'}.` : ''}</span></div>
        )}
        <div className="a-lbl" style={{ margin: '12px 0 6px' }}>What members see on Today</div>
        <div className="a-prev"><b>{form.title.trim() || 'Your goal'}</b>
          <div className="a-sub" style={{ margin: '3px 0 8px' }}>The whole gym · 0 of {target.toLocaleString()} {UNIT[form.metric]}</div>
          <div className="a-big"><i style={{ width: '2%' }} /></div>
          <div className="a-sub" style={{ marginTop: 6 }}>Every visit counts.{Number(form.reward_points) > 0 ? ` Reach it together: ${form.reward_points} points each.` : ''}</div></div>
        <button type="button" className="a-btn violet" style={{ marginTop: 12 }} disabled={busy} onClick={() => void add()} data-set-goal>
          <Check size={15} />{form.starts_on <= today ? 'Set the goal' : `Set it to start ${fmt(form.starts_on)}`}</button>
      </div>
    </div>
  );
}
