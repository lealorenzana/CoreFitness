import { useEffect, useState } from 'react';
import { Plus, Dumbbell, EyeOff, Eye, Info, Search, Trash2, Pencil, ListChecks, Users, Play, Timer, X } from 'lucide-react';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ExerciseGuideEditor from '../components/ExerciseGuideEditor';
import './attendance/att.css';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { listExerciseMedia, photoUsage, saveExerciseMedia, type ExerciseMedia } from '../lib/api/exerciseMedia';

/**
 * The exercise catalogue (0050/0121/0126, redrawn 2026-10-20 to the approved
 * mock-up): the exercises as tiles — the gym's own photo where it has one, a
 * mark when it has a video — and the one picked beside them with its steps,
 * where it is used, and Hide / Edit guide / Delete.
 *
 * The gym owns this list so the tracker never collects "Bench Press", "bench"
 * and "Benchpress" as three exercises. The shared library (0126) is the
 * platform's: a gym hides a library row in its own overlay
 * (`gym_exercise_media.hidden`, 0121), never for every gym. The gym's own rows
 * keep `is_active`, and can be deleted until somebody has logged one or a
 * routine or program uses it (`on delete restrict`) — then they are hidden.
 */

interface ExerciseRow {
  id: string; name: string; muscle_group: string; equipment: string; is_timed: boolean; is_active: boolean; sort_order: number;
  /** NULL = the shared library (0098). Absent before 0121's select succeeds. */
  gym_id?: string | null; cues?: string[]; steps?: string[];
}
const GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full_body', 'cardio'];
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];
const SHADES = ['#2a2050,#14323a', '#3a2a0c,#2a2050', '#14323a,#1b1a2a', '#3a1d33,#1b1a2a', '#2a2050,#3a1d33'];
const word = (s: string) => s.replace('_', ' ').replace(/^./, (c) => c.toUpperCase());
const emptyForm = { name: '', muscle_group: 'full_body', equipment: 'other', is_timed: false };
type Tab = 'all' | 'own' | 'hidden';

export default function Exercises() {
  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [form, setForm] = useState(emptyForm);
  const [panel, setPanel] = useState<'detail' | 'add' | 'guide'>('detail');
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState<Map<string, { routines: number; members: number }> | null>(null);
  const [media, setMedia] = useState<Map<string, ExerciseMedia>>(new Map());
  const [guides, setGuides] = useState(false);
  const [photos, setPhotos] = useState<{ used: number; cap: number | null } | null>(null);
  const [pickId, setPickId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [equip, setEquip] = useState('all');
  const [tab, setTab] = useState<Tab>('all');
  const [confirmDelete, setConfirmDelete] = useState<ExerciseRow | null>(null);

  const load = async () => {
    // 0121's columns first; before it is pasted the page falls back to the old list.
    const BASE = 'id, name, muscle_group, equipment, is_timed, is_active, sort_order';
    const full = await supabase.from('exercises').select(`${BASE}, gym_id, cues, steps`).order('muscle_group').order('sort_order');
    const live = !full.error;
    const { data, error } = live ? full : await supabase.from('exercises').select(BASE).order('muscle_group').order('sort_order');
    setGuides(live);
    if (live) {
      const [m, p] = await Promise.all([listExerciseMedia(), photoUsage()]);
      setMedia(m); setPhotos(p);
    }
    if (error) { setState('failed'); return; }
    setRows((data ?? []) as ExerciseRow[]);
    setState('ready');
    const counts = await supabase.rpc('exercise_routine_counts');
    setUsage(counts.error ? null : new Map(((counts.data ?? []) as { exercise_id: string; routines: number; members: number }[])
      .map((r) => [r.exercise_id, { routines: r.routines, members: r.members }])));
  };
  useEffect(() => { void (async () => { await load(); })(); }, []);

  const isLibrary = (r: ExerciseRow) => guides && r.gym_id === null;
  const isOwn = (r: ExerciseRow) => guides && r.gym_id != null;
  const shown = (r: ExerciseRow) => (isLibrary(r) ? !media.get(r.id)?.hidden : r.is_active);

  const add = async () => {
    if (!form.name.trim()) { showToast('Name is required', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase.from('exercises').insert({
      name: form.name.trim(), muscle_group: form.muscle_group, equipment: form.equipment, is_timed: form.is_timed,
      // Sorted to the end of its group; the seeded list uses tens.
      sort_order: 900,
    }).select('id').single();
    setSaving(false);
    if (error) {
      showToast(/unique|duplicate/i.test(error.message) ? 'That exercise already exists (names are matched ignoring case)' : error.message, 'error');
      return;
    }
    showToast('Exercise added — add its photo, video and steps next', 'success');
    setForm(emptyForm);
    await load();
    setPickId((data as { id: string }).id);
    setPanel(guides ? 'guide' : 'detail');
  };
  const toggleShown = async (row: ExerciseRow) => {
    if (isLibrary(row)) {
      const hide = shown(row);
      try {
        await saveExerciseMedia(row.id, { hidden: hide });
        setMedia(await listExerciseMedia());
        showToast(hide ? `${row.name} is hidden from your members. Other gyms are not affected.` : `${row.name} is back in your members' list.`, 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'That could not be changed', 'error');
      }
      return;
    }
    const { data, error } = await supabase.from('exercises').update({ is_active: !row.is_active }).eq('id', row.id).select('id');
    if (error) { showToast(error.message, 'error'); return; }
    // A zero-row update reports success (CLAUDE.md) — staff cannot edit this list.
    if (!data || data.length === 0) { showToast('Only an admin can change the exercise list', 'error'); return; }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
    const used = usage?.get(row.id);
    if (row.is_active && used && used.routines > 0) {
      showToast(`Hidden from the picker. ${used.routines} saved routine${used.routines === 1 ? '' : 's'} (${used.members} member${used.members === 1 ? '' : 's'}) still include it and keep working.`, 'info');
    }
  };
  const doDelete = async () => {
    const row = confirmDelete;
    setConfirmDelete(null);
    if (!row) return;
    const { data, error } = await supabase.from('exercises').delete().eq('id', row.id).select('id');
    if (error) {
      showToast(error.code === '23503' ? `${row.name} has been logged by members or is in a routine or program, so it cannot be deleted. Hide it instead — their history stays.` : error.message, 'error');
      return;
    }
    if (!data || data.length === 0) { showToast('Only the owner can delete an exercise', 'error'); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setPickId(null);
    showToast(`${row.name} deleted`, 'success');
  };

  if (state === 'loading') return <div className="att"><p className="a-sub">Loading exercises…</p></div>;
  if (state === 'failed') return <div className="att"><div className="a-card"><p className="a-sub">The exercise catalogue could not be loaded — a connection problem, not an empty catalogue. Reload to try again.</p></div></div>;

  const own = rows.filter(isOwn);
  const hidden = rows.filter((r) => !shown(r));
  const q = query.trim().toLowerCase();
  const list = (tab === 'own' ? own : tab === 'hidden' ? hidden : rows)
    .filter((r) => (!q || r.name.toLowerCase().includes(q) || r.equipment.includes(q)) && (group === 'all' || r.muscle_group === group) && (equip === 'all' || r.equipment === equip));
  const pick = rows.find((r) => r.id === pickId) ?? null;
  const m = pick ? media.get(pick.id) : undefined;
  const steps = pick ? (m?.steps?.length ? m.steps : pick.steps ?? []) : [];
  const cues = pick ? (m?.cues?.length ? m.cues : pick.cues ?? []) : [];
  const used = pick ? usage?.get(pick.id) : undefined;
  const shade = (id: string) => SHADES[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % SHADES.length];

  const thumb = (r: ExerciseRow, h: number, big = false) => {
    const mm = media.get(r.id);
    return (
      <div className="a-thumb" style={{ height: h, borderRadius: 12, position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center',
        background: mm?.photoUrl ? '#0f0f19' : `linear-gradient(135deg,${shade(r.id)})`, color: '#ffffff99' }}>
        {mm?.photoUrl ? <img src={mm.photoUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : !shown(r) ? <EyeOff size={big ? 40 : 28} /> : r.is_timed ? <Timer size={big ? 40 : 28} /> : <Dumbbell size={big ? 40 : 28} />}
        {mm?.videoUrl && <span style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 10, fontWeight: 700, background: '#000a', borderRadius: 6, padding: '2px 6px', color: '#fff', display: 'flex', gap: 3, alignItems: 'center' }}><Play size={9} />{big ? 'your video' : 'video'}</span>}
      </div>
    );
  };

  return (
    <div className="att" data-exercises>
      {/* The guide editor is a window of its own (it portals); the exercise stays in the side panel behind it. */}
      {panel === 'guide' && pick && (
        <ExerciseGuideEditor key={pick.id} exerciseId={pick.id} name={pick.name} libraryCues={pick.cues ?? []} librarySteps={pick.steps ?? []} media={media.get(pick.id) ?? null}
              onSaved={() => { void (async () => { const [mm, p] = await Promise.all([listExerciseMedia(), photoUsage()]); setMedia(mm); setPhotos(p); setPanel('detail'); })(); }}
              onClose={() => { setPanel('detail'); void photoUsage().then(setPhotos); }} />
      )}
      <div className="a-head">
        <div className="min-w-0"><h1>Exercises</h1>
          <p>What members pick from when they track a workout — {rows.length - own.length} shared, {own.length} your own{photos ? ` · ${photos.used}${photos.cap !== null ? ` of ${photos.cap}` : ''} photos` : ''}</p></div>
        <nav className="a-tabs" aria-label="Which exercises" data-rd-tabs style={{ marginLeft: 'auto' }}>
          <button type="button" className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All <em>{rows.length}</em></button>
          <button type="button" className={tab === 'own' ? 'on' : ''} onClick={() => setTab('own')}>Your own <em>{own.length}</em></button>
          <button type="button" className={tab === 'hidden' ? 'on' : ''} onClick={() => setTab('hidden')} data-tab="hidden">Hidden <em>{hidden.length}</em></button>
        </nav>
        <button type="button" className="a-btn violet" onClick={() => { setPanel('add'); setForm(emptyForm); }}><Plus size={15} />Add exercise</button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none', flexWrap: 'wrap' }}>
        <label className="a-input" style={{ padding: '8px 12px', fontSize: 12.5, width: 300 }}><Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exercises…" aria-label="Search exercises" /></label>
        <button type="button" className={`a-chip ${group === 'all' ? 'v' : ''}`} onClick={() => setGroup('all')}>All</button>
        {GROUPS.map((g) => <button key={g} type="button" className={`a-chip ${group === g ? 'v' : ''}`} onClick={() => setGroup(g)} data-group={g}>{word(g)}</button>)}
        <select className={`a-chip ${equip !== 'all' ? 'on' : ''}`} style={{ marginLeft: 'auto' }} value={equip} onChange={(e) => setEquip(e.target.value)} aria-label="Equipment">
          <option value="all">Any equipment</option>{EQUIPMENT.map((x) => <option key={x} value={x}>{word(x)}</option>)}
        </select>
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px', flex: 1 }}>
        <div className="a-card" data-exercise-grid>
          <div className="a-scroll grow">
            {list.length === 0 ? <p className="a-sub" style={{ padding: '10px 0' }}>{rows.length ? 'No exercise matches that.' : 'No exercises yet.'}</p> : (
              <div className="a-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {list.map((r) => (
                  <button key={r.id} type="button" className={`a-tile ${pickId === r.id ? 'on' : ''}`} style={{ opacity: shown(r) ? 1 : 0.55, textAlign: 'left' }}
                    onClick={() => { setPickId(r.id); setPanel('detail'); }} data-exercise={r.name}>
                    {thumb(r, 96)}
                    <b className="truncate">{r.name}</b>
                    <small>{shown(r) ? <>{word(r.muscle_group)} · {r.is_timed ? 'timed' : r.equipment}{isOwn(r) && <span style={{ color: 'var(--a-p300)' }}> · yours</span>}</> : 'hidden from your members'}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="a-card glow" style={{ overflowY: 'auto' }} data-exercise-panel>
          {panel === 'add' ? (<>
            <div className="a-ct"><h3><Plus size={16} />Add an exercise</h3><button type="button" className="a-link" aria-label="Close" onClick={() => setPanel('detail')}><X size={15} /></button></div>
            <div className="a-fld"><label htmlFor="ex-name">Name</label><input id="ex-name" className="a-in" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Hip Thrust" /></div>
            <div className="a-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div className="a-fld"><label htmlFor="ex-group">Muscle group</label>
                <select id="ex-group" className="a-in" value={form.muscle_group} onChange={(e) => setForm({ ...form, muscle_group: e.target.value })}>{GROUPS.map((g) => <option key={g} value={g}>{word(g)}</option>)}</select></div>
              <div className="a-fld"><label htmlFor="ex-equip">Equipment</label>
                <select id="ex-equip" className="a-in" value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })}>{EQUIPMENT.map((g) => <option key={g} value={g}>{word(g)}</option>)}</select></div>
            </div>
            <div className="a-setting" style={{ borderTop: 0, marginTop: 6 }}>
              <div className="t"><b>Measured in time, not reps</b><small>the member is asked for minutes and seconds — planks, treadmill, rowing</small></div>
              <button type="button" className={`a-toggle ${form.is_timed ? '' : 'off'}`} aria-pressed={form.is_timed} aria-label="Measured in time" onClick={() => setForm({ ...form, is_timed: !form.is_timed })} />
            </div>
            <button type="button" className="a-btn violet" style={{ marginTop: 10 }} disabled={saving || !form.name.trim()} onClick={() => void add()} data-add-exercise><Plus size={15} />{saving ? 'Adding…' : 'Add it'}</button>
            <div className="a-sub" style={{ marginTop: 8 }}>Then give it a photo, a video and the steps members follow.</div>
          </>) : !pick ? (
            <div style={{ margin: 'auto', textAlign: 'center' }}><Dumbbell size={28} style={{ color: 'var(--a-p300)', margin: '0 auto 8px' }} />
              <b>Pick an exercise</b><div className="a-sub" style={{ marginTop: 4 }}>See its steps, where it is used, and give it your own photo, video and cues.</div></div>
          ) : (<>
            {thumb(pick, 150, true)}
            <div className="a-ct" style={{ margin: '10px 0 6px' }}><h3>{pick.name}</h3><span className={`a-pill ${isOwn(pick) ? 'v' : ''}`}>{isOwn(pick) ? 'yours' : guides ? 'Core Fitness library' : 'catalogue'}</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="a-chip">{word(pick.muscle_group)}</span><span className="a-chip">{word(pick.equipment)}</span><span className="a-chip">{pick.is_timed ? 'Timed' : 'Reps & weight'}</span>{!shown(pick) && <span className="a-chip on">Hidden</span>}</div>
            <div className="a-lbl" style={{ margin: '12px 0 6px' }}>How to do it <span style={{ fontWeight: 500 }}>· members see these steps{m?.steps?.length ? ' (yours)' : ''}</span></div>
            {steps.length === 0 ? <p className="a-sub">No steps yet{guides ? ' — add them with Edit guide.' : '.'}</p>
              : steps.map((s, i) => <div key={i} className="a-step" style={{ fontWeight: 500, alignItems: 'flex-start' }}><span>{i + 1}</span><div style={{ fontSize: 12.5 }}>{s}</div></div>)}
            {cues.length > 0 && <div className="a-sub" style={{ marginBottom: 6 }}>Cues: {cues.join(' · ')}</div>}
            <div style={{ display: 'flex', gap: 14, margin: '8px 0', flexWrap: 'wrap' }}>
              <span className="a-sub" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><ListChecks size={13} />{used ? `in ${used.routines} routine${used.routines === 1 ? '' : 's'}` : 'in no saved routine'}</span>
              {used && used.members > 0 && <span className="a-sub" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Users size={13} />{used.members} member{used.members === 1 ? '' : 's'}</span>}
            </div>
            <div className="a-hint"><Info size={14} /><span>{isOwn(pick) ? 'Yours: delete it until members log it or a routine or program uses it — then hide it, and their history stays intact.' : 'From the shared library: hiding takes it out of your members\' picker only — other gyms are not affected.'}</span></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="a-btn ghost" style={{ flex: 1 }} onClick={() => void toggleShown(pick)} aria-label={`${shown(pick) ? 'Hide' : 'Show'} ${pick.name} ${shown(pick) ? 'from' : 'to'} members`}>{shown(pick) ? <><EyeOff size={15} />Hide</> : <><Eye size={15} />Show</>}</button>
              {guides && <button type="button" className="a-btn violet" style={{ flex: 2 }} onClick={() => setPanel('guide')} aria-label={`Guide for ${pick.name}`} data-edit-guide><Pencil size={15} />Edit guide</button>}
            </div>
            {isOwn(pick) && <button type="button" className="a-link a-sub" style={{ marginTop: 8, display: 'flex', gap: 5, alignItems: 'center' }} onClick={() => setConfirmDelete(pick)} aria-label={`Delete ${pick.name}`}><Trash2 size={13} />Delete {pick.name}</button>}
          </>)}
        </div>
      </div>

      <ConfirmDialog isOpen={confirmDelete !== null} type="danger" title={`Delete ${confirmDelete?.name ?? ''}`}
        message="This removes it from your gym's list for good. If members have logged it, or a routine or program uses it, it cannot be deleted — hide it instead."
        confirmText="Delete" onConfirm={() => void doDelete()} onClose={() => setConfirmDelete(null)} />
    </div>
  );
}
