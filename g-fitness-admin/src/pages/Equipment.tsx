import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Dumbbell, Plus } from 'lucide-react';
import { PageHeader, Section, EmptyState } from '../components/ui/kit';
import Button from '../components/ui/Button';
import DetailSheet from '../components/ui/DetailSheet';
import ImageField from '../components/ui/ImageField';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';

type Status = 'available' | 'repair' | 'soon';
interface Item {
  id: string; name: string; category: string; photo_url: string | null; quantity: number; location_note: string | null;
  status: Status; notes: string | null; sort_order: number; exercise_ids: string[];
}
interface Report { id: string; equipment_id: string; equipment_name: string; location_note: string | null; status: Status; note: string; member_name: string; created_at: string }

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'cardio', label: 'Cardio' }, { key: 'machines', label: 'Machines' }, { key: 'free_weights', label: 'Free weights' },
  { key: 'benches_racks', label: 'Benches and racks' }, { key: 'functional', label: 'Functional' }, { key: 'other', label: 'Other' },
];
const STATUS: Record<Status, string> = { available: 'Available', repair: 'Under repair', soon: 'Coming soon' };
const blank = { name: '', category: 'machines', photo_url: '', quantity: '1', location_note: '', notes: '', exercise_ids: [] as string[] };

/**
 * Equipment (0184): what the gym has, where, and what is broken. The owner
 * keeps the list (photo, how many, where in the gym, the exercises that use
 * each item); the desk works the problem reports members send and sets each
 * item Available / Under repair / Coming soon — members see it, and whoever
 * reported is told.
 */
export default function Equipment() {
  const [items, setItems] = useState<Item[] | null | undefined>(undefined);
  const [reports, setReports] = useState<Report[]>([]);
  const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [edit, setEdit] = useState<{ id: string | null; f: typeof blank } | null>(null);
  const [exSearch, setExSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [ctx, list, rep, ex] = await Promise.all([
      getGymContext(),
      supabase.from('gym_equipment').select('id, name, category, photo_url, quantity, location_note, status, notes, sort_order, equipment_exercises(exercise_id)')
        .order('category').order('sort_order').order('name'),
      supabase.rpc('open_equipment_reports'),
      supabase.from('exercises').select('id, name').eq('is_active', true).order('name').limit(600),
    ]);
    setIsOwner(ctx?.role === 'admin');
    if (list.error) { setItems(null); return; }
    setItems(((list.data ?? []) as unknown as (Omit<Item, 'exercise_ids'> & { equipment_exercises: { exercise_id: string }[] | null })[])
      .map((r) => ({ ...r, exercise_ids: (r.equipment_exercises ?? []).map((x) => x.exercise_id) })));
    setReports(rep.error ? [] : (rep.data as Report[]));
    setExercises((ex.data ?? []) as { id: string; name: string }[]);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try { await fn(); showToast(done, 'success'); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That could not be saved', 'error'); }
    finally { setBusy(false); }
  };
  const setStatus = (id: string, s: Status) => run(async () => {
    const { error } = await supabase.rpc('set_equipment_status', { p_item: id, p_status: s });
    if (error) throw new Error(error.message);
  }, s === 'available' ? 'Marked available — reporters are told' : `Marked ${STATUS[s].toLowerCase()}`);

  const save = () => edit && run(async () => {
    const f = edit.f;
    const row = { name: f.name.trim(), category: f.category, photo_url: f.photo_url || null, quantity: Math.max(1, Number(f.quantity) || 1),
      location_note: f.location_note.trim() || null, notes: f.notes.trim() || null };
    let id = edit.id;
    if (id) {
      const { data, error } = await supabase.from('gym_equipment').update(row).eq('id', id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('That item could not be saved.');
    } else {
      const { data, error } = await supabase.from('gym_equipment').insert(row).select('id').single();
      if (error) throw new Error(error.message);
      id = (data as { id: string }).id;
    }
    const before = items?.find((i) => i.id === id)?.exercise_ids ?? [];
    const add = f.exercise_ids.filter((x) => !before.includes(x));
    const drop = before.filter((x) => !f.exercise_ids.includes(x));
    if (add.length) {
      const { error } = await supabase.from('equipment_exercises').insert(add.map((exercise_id) => ({ equipment_id: id, exercise_id })));
      if (error) throw new Error(error.message);
    }
    if (drop.length) {
      const { error } = await supabase.from('equipment_exercises').delete().eq('equipment_id', id!).in('exercise_id', drop).select('exercise_id');
      if (error) throw new Error(error.message);
    }
    setEdit(null);
  }, 'Saved');
  const remove = (id: string) => run(async () => {
    const { data, error } = await supabase.from('gym_equipment').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('That item could not be removed.');
    setEdit(null);
  }, 'Removed');

  const shownEx = useMemo(() => {
    const q = exSearch.trim().toLowerCase();
    return exercises.filter((e) => !q || e.name.toLowerCase().includes(q)).slice(0, 40);
  }, [exercises, exSearch]);
  const exName = (id: string) => exercises.find((e) => e.id === id)?.name ?? 'Exercise';

  if (items === undefined) return <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>;
  const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm';
  const inputStyle = { borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' };

  return (
    <div className="space-y-5">
      <PageHeader title="Equipment" subtitle="What your gym has and where — members see it, and report what is broken"
        actions={isOwner ? <Button variant="primary" onClick={() => { setExSearch(''); setEdit({ id: null, f: { ...blank } }); }}><Plus size={14} /> Add equipment</Button> : undefined} />

      {reports.length > 0 && (
        <Section title="Problems members reported" icon={AlertTriangle} count={reports.length}>
          <div className="space-y-2" data-equipment-reports>
            {reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{r.equipment_name}{r.location_note ? ` · ${r.location_note}` : ''}</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>“{r.note}” — {r.member_name} · {STATUS[r.status]}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {r.status !== 'repair' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setStatus(r.equipment_id, 'repair')}>Under repair</Button>}
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => void setStatus(r.equipment_id, 'available')}>Fixed</Button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Your equipment" icon={Dumbbell} count={items?.length ?? 0}>
        {items === null ? <p className="text-sm" style={{ color: 'var(--color-secondary)' }}>The equipment list could not be loaded.</p>
          : items.length === 0 ? <EmptyState icon={Dumbbell} title="No equipment listed yet" hint={isOwner ? 'Add what your gym has — members see where each machine is.' : 'The owner adds the equipment list.'} />
          : (
            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }} data-equipment-list>
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-2.5">
                  {i.photo_url ? <img src={i.photo_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" /> : <div className="w-10 h-10 rounded-lg flex-shrink-0" style={{ background: 'var(--color-surface-high)' }} />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ''}</p>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {CATEGORIES.find((c) => c.key === i.category)?.label}{i.location_note ? ` · ${i.location_note}` : ''}
                      {i.exercise_ids.length ? ` · ${i.exercise_ids.length} exercise${i.exercise_ids.length === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                  <select aria-label={`Status of ${i.name}`} value={i.status} disabled={busy} onChange={(e) => void setStatus(i.id, e.target.value as Status)}
                    className="rounded-lg border px-2 py-1.5 text-xs" style={inputStyle}>
                    {(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
                  </select>
                  {isOwner && <Button size="sm" variant="secondary" onClick={() => { setExSearch(''); setEdit({ id: i.id, f: { name: i.name, category: i.category, photo_url: i.photo_url ?? '', quantity: String(i.quantity), location_note: i.location_note ?? '', notes: i.notes ?? '', exercise_ids: i.exercise_ids } }); }}>Edit</Button>}
                </div>
              ))}
            </div>
          )}
      </Section>

      <DetailSheet open={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? 'Edit equipment' : 'Add equipment'}
        footer={edit && (
          <div className="flex gap-2 justify-between w-full">
            {edit.id ? <Button variant="secondary" disabled={busy} onClick={() => void remove(edit.id!)}>Remove</Button> : <span />}
            <Button variant="primary" disabled={busy || !edit.f.name.trim()} onClick={() => void save()}>Save</Button>
          </div>
        )}>
        {edit && (
          <div className="space-y-3" data-equipment-form>
            <label className="block text-xs" style={{ color: 'var(--color-text-secondary)' }}>Name
              <input className={inputCls} style={inputStyle} value={edit.f.name} maxLength={80} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, name: e.target.value } })} placeholder="Leg press" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs" style={{ color: 'var(--color-text-secondary)' }}>Kind
                <select className={inputCls} style={inputStyle} value={edit.f.category} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, category: e.target.value } })}>
                  {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              <label className="block text-xs" style={{ color: 'var(--color-text-secondary)' }}>How many
                <input className={inputCls} style={inputStyle} inputMode="numeric" value={edit.f.quantity} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, quantity: e.target.value.replace(/\D/g, '') } })} />
              </label>
            </div>
            <label className="block text-xs" style={{ color: 'var(--color-text-secondary)' }}>Where in the gym
              <input className={inputCls} style={inputStyle} value={edit.f.location_note} maxLength={80} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, location_note: e.target.value } })} placeholder="2nd floor, cardio zone" />
            </label>
            <ImageField kind="equipment" label="Photo" aspect={4 / 3} value={edit.f.photo_url} onChange={(v) => setEdit({ ...edit, f: { ...edit.f, photo_url: v } })} />
            <label className="block text-xs" style={{ color: 'var(--color-text-secondary)' }}>Notes for members
              <input className={inputCls} style={inputStyle} value={edit.f.notes} maxLength={300} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, notes: e.target.value } })} placeholder="Ask the desk for the attachment" />
            </label>
            <div>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Exercises that use it</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {edit.f.exercise_ids.map((x) => (
                  <button key={x} type="button" onClick={() => setEdit({ ...edit, f: { ...edit.f, exercise_ids: edit.f.exercise_ids.filter((y) => y !== x) } })}
                    className="text-[11px] rounded-full px-2 py-1" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>{exName(x)} ×</button>
                ))}
              </div>
              <input aria-label="Find an exercise" className={`${inputCls} mt-1.5`} style={inputStyle} value={exSearch} onChange={(e) => setExSearch(e.target.value)} placeholder="Find an exercise to link" />
              {exSearch.trim() && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                  {shownEx.filter((e) => !edit.f.exercise_ids.includes(e.id)).map((e) => (
                    <button key={e.id} type="button" className="block w-full text-left px-3 py-1.5 text-xs hover:opacity-80" style={{ color: 'var(--color-text-primary)' }}
                      onClick={() => setEdit({ ...edit, f: { ...edit.f, exercise_ids: [...edit.f.exercise_ids, e.id] } })}>{e.name}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DetailSheet>
    </div>
  );
}
