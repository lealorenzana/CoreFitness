import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Dumbbell, Plus, Search, Wrench, Check, X } from 'lucide-react';
import Button from '../components/ui/Button';
import DetailSheet from '../components/ui/DetailSheet';
import ImageField from '../components/ui/ImageField';
import './attendance/att.css';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';
import { todayKey, localDateKey } from '../utils/dates';

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
const NOWHERE = '—';
const when = (iso: string, today: string) => {
  const d = localDateKey(iso);
  const t = new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return d === today ? `today ${t}` : new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

/**
 * Equipment (0184, redrawn 2026-10-20 to the approved mock-up): what the gym
 * has and where, as a table that filters by area, beside what members reported.
 * The owner keeps the list; the desk works the reports — Under repair, Fixed
 * (set_equipment_status, which tells whoever reported), or Not a problem with a
 * reason the reporter is told (dismiss_equipment_report, 0207).
 */
export default function Equipment() {
  const [today] = useState(() => todayKey());
  const [items, setItems] = useState<Item[] | null | undefined>(undefined);
  const [reports, setReports] = useState<Report[]>([]);
  const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [edit, setEdit] = useState<{ id: string | null; f: typeof blank } | null>(null);
  const [exSearch, setExSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [area, setArea] = useState('all');
  const [q, setQ] = useState('');
  const [dismiss, setDismiss] = useState<{ id: string; reason: string } | null>(null);

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
  const notAProblem = () => dismiss && run(async () => {
    const { error } = await supabase.rpc('dismiss_equipment_report', { p_report: dismiss.id, p_reason: dismiss.reason.trim() });
    if (error) throw new Error(/dismiss_equipment_report/.test(error.message) ? 'Closing a report as not a problem needs migration 0207.' : error.message.replace(/^.*?: /, ''));
    setDismiss(null);
  }, 'Closed — they have been told what you found');

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
    const s = exSearch.trim().toLowerCase();
    return exercises.filter((e) => !s || e.name.toLowerCase().includes(s)).slice(0, 40);
  }, [exercises, exSearch]);
  const exName = (id: string) => exercises.find((e) => e.id === id)?.name ?? 'Exercise';

  if (items === undefined) return <div className="att"><p className="a-sub">Loading…</p></div>;
  const list = items ?? [];
  const areaOf = (i: Item) => i.location_note?.trim() || NOWHERE;
  const areas = [...new Set(list.map(areaOf))].sort((a, b) => (a === NOWHERE ? 1 : b === NOWHERE ? -1 : a.localeCompare(b)));
  const working = list.filter((i) => i.status === 'available').length;
  const repair = list.filter((i) => i.status === 'repair');
  const newToday = reports.filter((r) => localDateKey(r.created_at) === today).length;
  const shown = list.filter((i) => (area === 'all' || areaOf(i) === area)
    && (!q.trim() || `${i.name} ${i.location_note ?? ''} ${CATEGORIES.find((c) => c.key === i.category)?.label ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const openEdit = (i: Item | null) => { setExSearch(''); setEdit(i ? { id: i.id, f: { name: i.name, category: i.category, photo_url: i.photo_url ?? '', quantity: String(i.quantity), location_note: i.location_note ?? '', notes: i.notes ?? '', exercise_ids: i.exercise_ids } } : { id: null, f: { ...blank } }); };
  const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm';
  const inputStyle = { borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' };

  return (
    <div className="att" data-equipment>
      <div className="a-head">
        <div className="min-w-0"><h1>Equipment</h1><p>What your gym has and where — members see it, and report what is broken</p></div>
        {isOwner && <button type="button" className="a-btn violet" style={{ marginLeft: 'auto' }} onClick={() => openEdit(null)}><Plus size={15} />Add equipment</button>}
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', flex: 'none' }} data-equipment-tiles>
        <div className="a-card" style={{ padding: '12px 14px' }}><div className="a-lbl">Items</div><div className="a-num">{list.length}</div>
          <div className="a-sub">{list.reduce((n, i) => n + i.quantity, 0)} pieces{areas.filter((a) => a !== NOWHERE).length ? ` in ${areas.filter((a) => a !== NOWHERE).length} area${areas.filter((a) => a !== NOWHERE).length === 1 ? '' : 's'}` : ''}</div></div>
        <div className="a-card" style={{ padding: '12px 14px' }}><div className="a-lbl">Working</div><div className="a-num">{working}</div>
          <div className="a-sub">{list.length ? `${Math.round((working / list.length) * 100)}%` : 'nothing listed yet'}</div></div>
        <div className="a-card" style={{ padding: '12px 14px', borderColor: reports.length ? '#3e310f' : undefined }}><div className="a-lbl" style={{ color: reports.length ? 'var(--a-a300)' : undefined }}>Reported by members</div>
          <div className="a-num">{reports.length}</div><div className="a-sub">{newToday ? `${newToday} new today` : 'none new today'}</div></div>
        <div className="a-card" style={{ padding: '12px 14px' }}><div className="a-lbl">Under repair</div><div className="a-num">{repair.length}</div>
          <div className="a-sub">{list.filter((i) => i.status === 'soon').length ? `${list.filter((i) => i.status === 'soon').length} coming soon` : 'members see which'}</div></div>
      </div>

      <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', flex: 1 }}>
        <div className="a-card" data-equipment-list>
          <div className="a-ct" style={{ flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className={`a-chip ${area === 'all' ? 'v' : ''}`} onClick={() => setArea('all')}>All areas</button>
              {areas.map((a) => <button key={a} type="button" className={`a-chip ${area === a ? 'v' : ''}`} onClick={() => setArea(a)} data-area={a}>{a === NOWHERE ? 'No place set' : a}</button>)}
            </div>
            <label className="a-input" style={{ padding: '6px 10px', fontSize: 12, width: 170 }}><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find equipment…" aria-label="Find equipment" /></label>
          </div>
          <div className="a-scroll grow">
            {items === null ? <p className="a-sub">The equipment list could not be loaded — a connection problem, not an empty list.</p>
              : list.length === 0 ? <p className="a-sub" style={{ padding: '10px 0' }}>{isOwner ? 'Nothing listed yet. Add what your gym has — members see where each machine is.' : 'The owner adds the equipment list.'}</p>
              : shown.length === 0 ? <p className="a-sub" style={{ padding: '10px 0' }}>Nothing matches.</p> : (
              <table className="a-table">
                <thead><tr><th>Equipment</th><th>Where</th><th>How many</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {shown.map((i) => (
                    <tr key={i.id} data-equipment-row={i.name}>
                      <td><div className="a-who">
                        {i.photo_url ? <img src={i.photo_url} alt="" style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover', flex: 'none' }} />
                          : <span className="a-thumb" style={{ width: 38, height: 38, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#2a2050,#14323a)', flex: 'none' }}><Dumbbell size={17} /></span>}
                        <div className="min-w-0"><b className="truncate">{i.name}</b><div className="a-sub">{CATEGORIES.find((c) => c.key === i.category)?.label}{i.exercise_ids.length ? ` · ${i.exercise_ids.length} exercise${i.exercise_ids.length === 1 ? '' : 's'}` : ''}</div></div></div></td>
                      <td>{i.location_note || <span className="a-sub">—</span>}</td>
                      <td>{i.quantity}</td>
                      <td>
                        <select className={`a-chip ${i.status === 'available' ? 'v' : 'on'}`} aria-label={`Status of ${i.name}`} value={i.status} disabled={busy} onChange={(e) => void setStatus(i.id, e.target.value as Status)}>
                          {(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{s === 'available' ? 'Working' : STATUS[s]}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>{isOwner && <button type="button" className="a-btn ghost sm" onClick={() => openEdit(i)}>Edit</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="a-card" style={{ borderColor: reports.length ? '#3e310f' : undefined }} data-equipment-reports>
          <div className="a-ct"><h3><AlertTriangle size={16} style={{ color: 'var(--a-a300)' }} />Reported by members</h3><small>{reports.length}</small></div>
          <div className="a-scroll grow" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reports.length === 0 ? <p className="a-sub">Nothing reported. Members report a broken machine from Equipment in the app.</p> : reports.map((r) => (
              <div key={r.id} className="a-post" data-report={r.equipment_name}>
                <b>{r.equipment_name}{r.location_note ? ` · ${r.location_note}` : ''}</b>
                <div className="a-sub">“{r.note}” — {r.member_name} · {when(r.created_at, today)}{r.status !== 'available' ? ` · ${STATUS[r.status].toLowerCase()}` : ''}</div>
                {dismiss?.id === r.id ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input className="a-in" style={{ padding: '6px 9px', fontSize: 12 }} autoFocus value={dismiss.reason} maxLength={200} onChange={(e) => setDismiss({ id: r.id, reason: e.target.value })}
                      placeholder="What you found — they are told" aria-label="What you found" />
                    <button type="button" className="a-btn violet sm" disabled={busy || !dismiss.reason.trim()} onClick={() => void notAProblem()}><Check size={13} /></button>
                    <button type="button" className="a-btn ghost sm" aria-label="Cancel" onClick={() => setDismiss(null)}><X size={13} /></button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {r.status !== 'repair' && <button type="button" className="a-btn soft sm" disabled={busy} onClick={() => void setStatus(r.equipment_id, 'repair')}><Wrench size={13} />Under repair</button>}
                    <button type="button" className="a-btn violet sm" disabled={busy} onClick={() => void setStatus(r.equipment_id, 'available')}><Check size={13} />Fixed</button>
                    <button type="button" className="a-btn ghost sm" onClick={() => setDismiss({ id: r.id, reason: '' })}>Not a problem</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="a-sub" style={{ paddingTop: 10 }}>Whoever reported it is told when you mark it under repair, fixed, or not a problem.</div>
        </div>
      </div>

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
              <input className={inputCls} style={inputStyle} value={edit.f.location_note} maxLength={80} list="equipment-areas" onChange={(e) => setEdit({ ...edit, f: { ...edit.f, location_note: e.target.value } })} placeholder="2nd floor" />
              <datalist id="equipment-areas">{areas.filter((a) => a !== NOWHERE).map((a) => <option key={a} value={a} />)}</datalist>
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
