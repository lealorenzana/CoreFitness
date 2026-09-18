import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Lock, MagnifyingGlass, Plus, Timer } from '@phosphor-icons/react';
import GlassSheet from '../../components/ui/GlassSheet';
import { SkeletonList } from '../../components/ui/Skeleton';
import { TextInput } from '../../components/ui/Field';
import { Chip, NocButton } from '../../components/ui/noc';
import { useFeatures } from '../../hooks/useFeatures';
import { isEnabled } from '../../lib/api/planFeatures';
import { listExercises, type Exercise } from '../../lib/api/workoutSets';
import { lastSetsFor, listRoutines, type LastSet, type Routine } from '../../lib/api/routines';

/**
 * The gym's exercise catalogue (0050), browsable — the same list the tracker
 * and routines pick from, so what you find here is what you can log.
 *
 * Tapping one shows what it is, what you did last time (your own sets, from
 * `member_last_sets`), a link out to form videos, and "Add to a routine", which
 * opens the routine editor with it already added. Browsing is free; adding goes
 * through the tracker's gate, and says so with a lock rather than hiding.
 */

const GROUP_LABEL: Record<string, string> = {
  chest: 'Chest', back: 'Back', legs: 'Legs', shoulders: 'Shoulders', arms: 'Arms',
  core: 'Core', cardio: 'Cardio', full_body: 'Full body',
};
const groupLabel = (g: string) => GROUP_LABEL[g] ?? g.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const equipmentLabel = (e: string) => e.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function lastLine(sets: LastSet[]): string {
  return sets.map((s) => s.durationSeconds != null
    ? `${s.durationSeconds}s`
    : `${s.weightKg != null ? `${s.weightKg} kg × ` : ''}${s.reps ?? '—'}`).join(' · ');
}

export default function ExerciseLibrary({ memberId }: { memberId: string | null }) {
  const navigate = useNavigate();
  const { features } = useFeatures();
  const locked = features != null && !isEnabled(features, 'workout_tracker');

  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [open, setOpen] = useState<Exercise | null>(null);
  const [last, setLast] = useState<LastSet[] | null | undefined>(undefined);
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    void (async () => {
      try { setExercises(await listExercises()); } catch { setFailed(true); }
    })();
  }, []);

  const groups = useMemo(() => [...new Set((exercises ?? []).map((e) => e.muscleGroup))], [exercises]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (exercises ?? []).filter((e) =>
      (group === 'all' || e.muscleGroup === group)
      && (!q || e.name.toLowerCase().includes(q) || e.equipment.includes(q) || e.muscleGroup.includes(q)));
  }, [exercises, group, query]);

  const show = (e: Exercise) => {
    setOpen(e);
    setLast(undefined);
    setPicking(false);
    void (async () => {
      const m = await lastSetsFor([e.id]).catch(() => null);
      setLast(m ? m.get(e.id) ?? [] : null);
    })();
  };

  const startAdd = async () => {
    if (!open) return;
    if (locked) { navigate('/member/track'); return; }
    if (!routines && memberId) setRoutines(await listRoutines(memberId).catch(() => []));
    setPicking(true);
  };
  const addTo = (routineId: string) => {
    if (!open) return;
    navigate(`/member/track/routine/${routineId}`, { state: { addExerciseId: open.id } });
  };

  if (failed) return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>The exercise list could not be loaded just now.</p>;
  if (!exercises) return <SkeletonList />;

  // Grouped under headings when showing everything; a flat list once filtered.
  const sections: [string, Exercise[]][] = group === 'all' && !query.trim()
    ? groups.map((g) => [groupLabel(g), visible.filter((e) => e.muscleGroup === g)])
    : [[group === 'all' ? `${visible.length} found` : groupLabel(group), visible]];

  return (
    <>
      <label className="flex items-center" style={{
        gap: 10, height: 46, padding: '0 14px', borderRadius: 'var(--radius-btn)',
        background: 'var(--color-surface)', border: '1px solid var(--color-hairline)',
      }}>
        <MagnifyingGlass size={17} aria-hidden style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
        <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exercises"
          aria-label="Search exercises" className="flex-1 min-w-0"
          style={{ border: 'none', background: 'transparent', height: 44, padding: 0, fontSize: 14.5 }} />
      </label>

      <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 8, margin: '0 calc(var(--gutter) * -1)', padding: '0 var(--gutter)' }}>
        <Chip label={`All · ${exercises.length}`} on={group === 'all'} onClick={() => setGroup('all')} />
        {groups.map((g) => (
          <Chip key={g} label={`${groupLabel(g)} · ${exercises.filter((e) => e.muscleGroup === g).length}`}
            on={group === g} onClick={() => setGroup(g)} />
        ))}
      </div>

      {visible.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Nothing matches “{query}”. The gym adds exercises to this list; ask the desk if one is missing.
        </p>
      ) : sections.map(([title, list]) => (
        <section key={title}>
          <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</h2>
          <div className="noc-rows" style={{ marginTop: 4 }}>
            {list.map((e, i) => (
              <button key={e.id} onClick={() => show(e)} className="w-full flex items-center text-left noc-press-soft"
                style={{ gap: 12, padding: '12px 0', borderBottom: i === list.length - 1 ? 'none' : '1px solid var(--color-separator)' }}>
                <span className="flex-1 min-w-0">
                  <span className="block truncate" style={{ fontSize: 14.5, color: 'var(--color-text-primary)' }}>{e.name}</span>
                  <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                    {equipmentLabel(e.equipment)}{group !== 'all' || query ? ` · ${groupLabel(e.muscleGroup)}` : ''}
                  </span>
                </span>
                {e.isTimed && (
                  <span className="inline-flex items-center flex-none" style={{ gap: 4, fontSize: 12, color: 'var(--color-primary-300)' }}>
                    <Timer size={14} aria-hidden /> Timed
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}

      <GlassSheet
        open={open != null}
        onClose={() => setOpen(null)}
        title={open?.name ?? ''}
        subtitle={open ? `${groupLabel(open.muscleGroup)} · ${equipmentLabel(open.equipment)} · ${open.isTimed ? 'measured in time' : 'reps and weight'}` : undefined}
        footer={open && !picking ? (
          <NocButton variant="action" className="w-full" onClick={() => void startAdd()}
            icon={locked ? <Lock size={15} /> : <Plus size={15} weight="bold" />}>
            {locked ? 'Routines are not on your plan' : 'Add to a routine'}
          </NocButton>
        ) : undefined}
      >
        {open && (
          <div className="flex flex-col" style={{ gap: 16 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>Your last time</p>
              <p style={{ fontSize: 14, marginTop: 4, color: 'var(--color-text-primary)' }}>
                {last === undefined ? '…'
                  : last === null ? 'Could not be read just now.'
                  : last.length === 0 ? 'Not logged yet — it will show here after your first session with it.'
                  : lastLine(last)}
              </p>
            </div>
            <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${open.name} proper form`)}`}
              target="_blank" rel="noopener noreferrer" className="inline-flex items-center"
              style={{ gap: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--color-secondary)' }}>
              Watch form videos on YouTube <ArrowUpRight size={14} aria-hidden />
            </a>
            <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
              A search on YouTube, not the gym's own video. Ask a coach to check your form the first time.
            </p>

            {picking && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>Add it to</p>
                <div style={{ marginTop: 4 }}>
                  {(routines ?? []).map((r) => (
                    <button key={r.id} onClick={() => addTo(r.id)} className="w-full flex items-center justify-between text-left noc-press-soft"
                      style={{ padding: '12px 0', borderBottom: '1px solid var(--color-separator)', fontSize: 14.5, color: 'var(--color-text-primary)' }}>
                      {r.name}
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.exercises.length} exercises</span>
                    </button>
                  ))}
                  <button onClick={() => addTo('new')} className="w-full flex items-center text-left noc-press-soft"
                    style={{ gap: 8, padding: '12px 0', fontSize: 14.5, fontWeight: 600, color: 'var(--color-secondary)' }}>
                    <Plus size={15} weight="bold" aria-hidden /> A new routine
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </GlassSheet>
    </>
  );
}
