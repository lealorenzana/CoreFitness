import { useCallback, useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import Card from './ui/Card';
import DatePicker from './ui/DatePicker';
import Button from './ui/Button';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { assertWrote } from '../lib/api/mutate';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', colorScheme: 'dark' as const };
const UNIT: Record<string, string> = { training_days: 'training days', workouts_logged: 'workouts', checkins: 'check-ins' };
const manilaDate = (addDays = 0) => new Date(Date.now() + 8 * 3600_000 + addDays * 86_400_000).toISOString().slice(0, 10);

interface Goal {
  id: string; title: string; metric: string; target: number; starts_on: string; ends_on: string;
  reward_points: number; is_active: boolean; reached_at: string | null;
}
interface Squad { id: string; name: string; weekly_target: number; members: number }

/**
 * Challenges → the gym-wide goal and the squads (0124).
 *
 * One shared target for the whole gym over a date range. Progress is computed
 * by the database from members' real activity, never typed in here; when it is
 * reached, everyone who contributed gets the reward points, once. Squads are
 * the members' own — the owner sees them, cannot edit them.
 */
export default function GymGoalSection() {
  const [goals, setGoals] = useState<Goal[] | null | undefined>(undefined);
  const [progress, setProgress] = useState<Record<string, { progress: number; contributors: number }>>({});
  const [squads, setSquads] = useState<Squad[]>([]);
  const [form, setForm] = useState({ title: '', metric: 'training_days', target: '500', starts_on: manilaDate(), ends_on: manilaDate(30), reward_points: '50' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    await supabase.rpc('settle_gym_goals').then(() => undefined, () => undefined);
    const [g, s, m] = await Promise.all([
      supabase.from('gym_goals').select('id, title, metric, target, starts_on, ends_on, reward_points, is_active, reached_at')
        .order('ends_on', { ascending: false }),
      supabase.from('squads').select('id, name, weekly_target').is('archived_at', null).order('name'),
      supabase.from('squad_members').select('squad_id').is('left_at', null),
    ]);
    if (g.error) { setGoals(null); return; }
    const list = (g.data ?? []) as Goal[];
    setGoals(list);
    const counts: Record<string, number> = {};
    for (const r of (m.data ?? []) as { squad_id: string }[]) counts[r.squad_id] = (counts[r.squad_id] ?? 0) + 1;
    setSquads(((s.data ?? []) as { id: string; name: string; weekly_target: number }[]).map((x) => ({ ...x, members: counts[x.id] ?? 0 })));
    const p: Record<string, { progress: number; contributors: number }> = {};
    await Promise.all(list.map(async (x) => {
      const r = await supabase.rpc('gym_goal_progress', { p_goal: x.id });
      const row = Array.isArray(r.data) ? r.data[0] as { progress: number; contributors: number } | undefined : undefined;
      if (row) p[x.id] = { progress: Number(row.progress), contributors: Number(row.contributors) };
    }));
    setProgress(p);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (goals === undefined) return null;
  if (goals === null) {
    return <Card className="!p-4"><p className="text-xs" style={{ color: MUTED }}>The gym-wide goal needs migration 0124, which is not pasted yet.</p></Card>;
  }

  const add = async () => {
    const target = Number(form.target);
    const points = Number(form.reward_points);
    if (form.title.trim().length < 2 || !(target > 0)) { showToast('A title and a positive target, please.', 'error'); return; }
    if (form.ends_on < form.starts_on) { showToast('The goal cannot end before it starts.', 'error'); return; }
    setBusy(true);
    const { error } = await supabase.from('gym_goals').insert({
      title: form.title.trim(), metric: form.metric, target: Math.round(target),
      starts_on: form.starts_on, ends_on: form.ends_on, reward_points: Number.isFinite(points) ? Math.round(points) : 0,
    });
    setBusy(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Goal set. Members see it on Today.', 'success');
    setForm({ ...form, title: '' });
    await load();
  };

  const stop = async (g: Goal) => {
    const { data, error } = await supabase.from('gym_goals').update({ is_active: !g.is_active }).eq('id', g.id).select('id');
    if (error) { showToast(error.message, 'error'); return; }
    try { assertWrote(data, 'That goal could not be changed.'); } catch (e) { showToast((e as Error).message, 'error'); return; }
    await load();
  };

  return (
    <Card className="!p-4 space-y-4">
      <div className="flex items-center gap-2">
        <UsersRound size={14} style={{ color: 'var(--color-primary)' }} />
        <div>
          <h2 className="text-sm font-bold text-white">The whole gym&apos;s goal</h2>
          <p className="text-[10px]" style={{ color: MUTED }}>
            One shared target. Everyone&apos;s real activity counts; when it is reached, everyone who added at least one gets the points.
          </p>
        </div>
      </div>

      {goals.length === 0 ? (
        <p className="text-xs" style={{ color: MUTED }}>No goal yet.</p>
      ) : (
        <div className="space-y-1.5">
          {goals.map((g) => {
            const p = progress[g.id];
            const pct = p ? Math.min(100, Math.round((p.progress / g.target) * 100)) : 0;
            return (
              <div key={g.id} className="rounded-lg px-3 py-2" style={{ ...FIELD, opacity: g.is_active ? 1 : 0.5 }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">{g.title}
                    <span className="font-normal" style={{ color: MUTED }}> · {g.starts_on} → {g.ends_on}{g.reward_points ? ` · ${g.reward_points} pts` : ''}</span>
                  </p>
                  {g.reached_at
                    ? <span className="text-[10px] font-semibold" style={{ color: 'var(--color-primary)' }}>Reached</span>
                    : <Button size="sm" variant="ghost" onClick={() => void stop(g)}>{g.is_active ? 'Stop' : 'Resume'}</Button>}
                </div>
                {p && (
                  <>
                    <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--color-bg)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--color-primary)' }} />
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: MUTED }}>
                      {p.progress.toLocaleString()} of {g.target.toLocaleString()} {UNIT[g.metric]} · {p.contributors} members contributing
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr) minmax(0, 1fr)' }}>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80}
          placeholder="e.g. 1,000 training days in October" aria-label="Goal title" className="h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
        <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} aria-label="What counts"
          className="h-9 px-2 rounded-lg text-xs text-white" style={FIELD}>
          <option value="training_days">Training days</option>
          <option value="workouts_logged">Workouts logged</option>
          <option value="checkins">Check-ins</option>
        </select>
        <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value.replace(/[^0-9]/g, '') })}
          inputMode="numeric" aria-label="Goal target" className="h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44" aria-label="Goal starts">
          <DatePicker mode="future" value={form.starts_on} placeholder="Starts"
            onChange={(v) => setForm({ ...form, starts_on: v, ends_on: form.ends_on && v && form.ends_on < v ? '' : form.ends_on })} />
        </div>
        <div className="w-44" aria-label="Goal ends">
          <DatePicker mode="future" min={form.starts_on || undefined} value={form.ends_on} placeholder="Ends"
            onChange={(v) => setForm({ ...form, ends_on: v })} />
        </div>
        <input value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: e.target.value.replace(/[^0-9]/g, '') })}
          inputMode="numeric" aria-label="Reward points" className="h-9 px-3 rounded-lg text-xs text-white w-20" style={FIELD} />
        <span className="text-[10px]" style={{ color: MUTED }}>points each</span>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void add()}>Set the goal</Button>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase mb-1.5" style={{ color: MUTED }}>Members&apos; squads ({squads.length})</p>
        {squads.length === 0 ? (
          <p className="text-xs" style={{ color: MUTED }}>No squads yet. Members start them in the app and invite friends with a code.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {squads.map((s) => (
              <span key={s.id} className="text-[11px] px-2 py-1 rounded-md text-white" style={FIELD}>
                {s.name} <span style={{ color: MUTED }}>· {s.members} · target {s.weekly_target}/wk</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
