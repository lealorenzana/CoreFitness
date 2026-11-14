import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { showToast } from '../utils/toast';
import { refreshGymModules } from '../hooks/useGymModules';

type Door = 'reserve' | 'required';
interface Rules { on: boolean; door: Door; ahead_days: number; per_day: number; cancel_minutes: number; desk_override: boolean;
  opening_time: string | null; closing_time: string | null; closed_days: number[] }
interface Slot { id: string; day_of_week: number; starts: string; ends: string; capacity: number }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const hm = (t: string) => t.slice(0, 5);
const clock = (t: string) => { const [h, m] = t.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
const DOORS: { key: Door; title: string; blurb: string }[] = [
  { key: 'reserve', title: 'A booking keeps a place', blurb: 'Members who booked always get in. Anyone else comes in while the slot has room.' },
  { key: 'required', title: 'Only members who booked', blurb: 'During a slot, the door lets in only members who booked it.' },
];

/**
 * Settings → Time slots (0259, gym styles phase 3). Every rule is the owner's — "we adjust to their gym, not them to
 * our system": how the door treats a slot, whether the desk may let someone in anyway, how far ahead and how many
 * slots a day members book, how late they may cancel, and the weekly grid itself — cut from the opening hours with
 * one length and limit, then edited day by day. Renders nothing before 0259 is live.
 */
export default function TimeSlotsSettings() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const [fill, setFill] = useState({ minutes: '90', capacity: '30' });
  const [edit, setEdit] = useState<{ id: string | null; day: number; starts: string; ends: string; capacity: string } | null>(null);

  const load = useCallback(async () => {
    const [r, t] = await Promise.all([supabase.rpc('gym_slot_settings'), supabase.rpc('slot_template_list')]);
    if (r.error || !r.data) { setRules(null); return; }
    setRules(r.data as Rules);
    setSlots((t.data ?? []) as Slot[]);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  if (!rules) return null;

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { showToast(error.message, 'error'); return false; }
    showToast(ok, 'success');
    await load();
    return true;
  };
  const saveRules = (next: Partial<Rules>) => {
    const r = { ...rules, ...next };
    setRules(r);
    void run(() => supabase.rpc('set_slot_settings', { p_door: r.door, p_ahead_days: r.ahead_days, p_per_day: r.per_day,
      p_cancel_minutes: r.cancel_minutes, p_desk_override: r.desk_override }), 'Saved — it applies from the next booking.');
  };
  const num = (v: string, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
  const box = (on: boolean) => ({ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', background: 'var(--color-bg)' });
  const muted = { color: 'var(--color-text-secondary)' };

  return (
    <div className="space-y-6" data-time-slots-settings>
      {!rules.on && (
        <p className="text-sm rounded-lg border px-3.5 py-3" style={{ borderColor: 'var(--color-border)', ...muted }} data-slots-off>
          Time slots are off — members book nothing and the door ignores them. Set them up here, then switch on <b>Time slots and crowd limit</b> in{' '}
          <Link to="/gym-app?tab=runs" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }} onClick={() => refreshGymModules()}>Your app → What you run</Link>.
        </p>
      )}

      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>At the door</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="At the door">
          {DOORS.map((d) => {
            const on = rules.door === d.key;
            return (
              <button key={d.key} type="button" role="radio" aria-checked={on} disabled={busy} data-door={d.key}
                onClick={() => { if (!on) saveRules({ door: d.key }); }}
                className="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left" style={box(on)}>
                <span className="mt-0.5 shrink-0">{on ? <Check size={16} style={{ color: 'var(--color-primary)' }} /> : <span className="block h-4 w-4 rounded-full border" style={{ borderColor: 'var(--color-border)' }} />}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{d.title}</span>
                  <span className="block text-xs mt-0.5" style={muted}>{d.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        <label className="mt-3 flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <button type="button" className={`a-toggle ${rules.desk_override ? '' : 'off'}`} aria-pressed={rules.desk_override} disabled={busy}
            aria-label="The front desk may let someone in anyway" data-desk-override onClick={() => saveRules({ desk_override: !rules.desk_override })} />
          <span>The front desk may <b>let someone in anyway</b> when a slot says no <span className="text-xs" style={muted}>— never the kiosk</span></span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ['ahead_days', 'Book how far ahead', 'days (0 = today only)', 0, 30],
          ['per_day', 'Slots a day per member', 'at most', 1, 6],
          ['cancel_minutes', 'Cancel up to', 'minutes before (0 = until it starts)', 0, 1440],
        ] as const).map(([k, label, unit, lo, hi]) => (
          <label key={k} className="block text-sm" style={{ color: 'var(--color-text-primary)' }}>
            <span className="font-semibold">{label}</span>
            <span className="mt-1.5 flex items-center gap-2">
              <input className="a-in" style={{ width: 90 }} inputMode="numeric" defaultValue={rules[k]} key={`${k}:${rules[k]}`} data-rule={k}
                onBlur={(e) => { const v = num(e.target.value, lo, hi); if (v !== rules[k]) saveRules({ [k]: v } as Partial<Rules>); }} />
              <span className="text-xs" style={muted}>{unit}</span>
            </span>
          </label>
        ))}
      </div>

      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Your slots</p>
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border px-3.5 py-3" style={{ borderColor: 'var(--color-border)' }} data-fill>
          <span className="text-xs w-full" style={muted}>
            Cut a week from your hours{rules.opening_time && rules.closing_time ? ` (${clock(rules.opening_time)} – ${clock(rules.closing_time)})` : ''}, then change any day below. This replaces your slots; bookings already made stay.
          </span>
          <label className="text-xs" style={muted}>Each slot<input className="a-in mt-1 block" style={{ width: 90 }} inputMode="numeric" value={fill.minutes}
            onChange={(e) => setFill({ ...fill, minutes: e.target.value.replace(/\D/g, '') })} aria-label="Slot length in minutes" /> minutes</label>
          <label className="text-xs" style={muted}>Up to<input className="a-in mt-1 block" style={{ width: 90 }} inputMode="numeric" value={fill.capacity}
            onChange={(e) => setFill({ ...fill, capacity: e.target.value.replace(/\D/g, '') })} aria-label="People per slot" /> people</label>
          <button type="button" className="a-btn violet sm" disabled={busy} data-fill-go
            onClick={() => { if (slots.length && !window.confirm('Replace every slot with slots cut from your opening hours?')) return;
              void run(() => supabase.rpc('fill_slots_from_hours', { p_minutes: Number(fill.minutes), p_capacity: Number(fill.capacity) }), 'Slots made from your hours'); }}>
            <Wand2 size={13} />Fill from opening hours
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2" data-slot-grid>
          {ORDER.map((d) => {
            const day = slots.filter((s) => s.day_of_week === d);
            const closed = rules.closed_days.includes(d);
            return (
              <div key={d} className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }} data-slot-day={d}>
                <div className="flex items-center justify-between">
                  <b className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{DAYS[d]}</b>
                  {closed ? <span className="text-xs" style={muted}>closed</span>
                    : <button type="button" className="a-btn ghost sm" onClick={() => setEdit({ id: null, day: d, starts: day.length ? hm(day[day.length - 1].ends) : '06:00', ends: '', capacity: String(day[0]?.capacity ?? 30) })}
                        aria-label={`Add a slot on ${DAYS[d]}`}><Plus size={12} />Add</button>}
                </div>
                {!closed && day.length === 0 && <p className="text-xs mt-1" style={muted}>No slots — the door ignores this day.</p>}
                {day.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs mt-1.5" data-slot={`${d}:${hm(s.starts)}`}>
                    <span className="flex-1" style={{ color: 'var(--color-text-primary)' }}>{clock(s.starts)} – {clock(s.ends)} · up to {s.capacity}</span>
                    <button type="button" aria-label="Change this slot" onClick={() => setEdit({ id: s.id, day: d, starts: hm(s.starts), ends: hm(s.ends), capacity: String(s.capacity) })}><Pencil size={13} style={muted} /></button>
                    <button type="button" aria-label="Remove this slot" disabled={busy} onClick={() => void run(() => supabase.rpc('delete_slot_template', { p_id: s.id }), 'Slot removed')}><Trash2 size={13} style={muted} /></button>
                  </div>
                ))}
                {edit && edit.day === d && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2" data-slot-edit>
                    <input className="a-in" type="time" value={edit.starts} onChange={(e) => setEdit({ ...edit, starts: e.target.value })} aria-label="Starts" style={{ width: 110 }} />
                    <span className="text-xs" style={muted}>to</span>
                    <input className="a-in" type="time" value={edit.ends} onChange={(e) => setEdit({ ...edit, ends: e.target.value })} aria-label="Ends" style={{ width: 110 }} />
                    <input className="a-in" inputMode="numeric" value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value.replace(/\D/g, '') })} aria-label="Up to how many people" style={{ width: 64 }} />
                    <button type="button" className="a-btn violet sm" disabled={busy || !edit.starts || !edit.ends || !edit.capacity}
                      onClick={() => void run(() => supabase.rpc('save_slot_template', { p_id: edit.id, p_day: edit.day, p_starts: edit.starts, p_ends: edit.ends, p_capacity: Number(edit.capacity) }),
                        edit.id ? 'Slot changed' : 'Slot added').then((ok) => { if (ok) setEdit(null); })}>Save</button>
                    <button type="button" className="a-btn ghost sm" onClick={() => setEdit(null)}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
