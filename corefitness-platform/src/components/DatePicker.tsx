import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { boundsHint, dateBounds, narrow, type BoundOpts, type DateMode } from '../lib/dateRules';

/**
 * The platform app's one date picker (2026-10-10), the admin app's calendar in
 * this app's plain CSS (`.dp*` in index.css).
 *
 * The native `<input type="date">` here accepted any year — a receipt could
 * cover 2002 and an announcement could end yesterday. Every use names a MODE
 * from lib/dateRules.ts (byte-identical with admin and member); years outside
 * it are not offered and the arrows stop at its edges.
 *
 * The value stays 'YYYY-MM-DD' or '' exactly as the native input gave.
 */
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
};
const localToday = () => { const d = new Date(); return key(d.getFullYear(), d.getMonth(), d.getDate()); };
const show = (v: string) => {
  const p = parse(v);
  return p ? new Date(p.y, p.m, p.d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};

export default function DatePicker({
  id, value, onChange, mode, bounds, min: minProp, max: maxProp, placeholder = 'Pick a date',
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  mode: DateMode;
  bounds?: BoundOpts;
  min?: string;
  max?: string;
  placeholder?: string;
}) {
  const { min, max } = narrow(dateBounds(mode, bounds), minProp, maxProp);
  const today = localToday();
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState(false);
  const [view, setView] = useState(() => {
    const at = parse(value) ?? parse(today < min ? min : today > max ? max : today)!;
    return { y: at.y, m: at.m };
  });
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const count = new Date(view.y, view.m + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, i) => {
      const d = i - first + 1;
      if (d < 1 || d > count) return null;
      const k = key(view.y, view.m, d);
      return { d, k, disabled: k < min || k > max };
    });
  }, [view, min, max]);
  const yearList = useMemo(() => {
    const out: number[] = [];
    for (let y = Number(max.slice(0, 4)); y >= Number(min.slice(0, 4)); y--) out.push(y);
    return out;
  }, [min, max]);

  const viewKey = `${view.y}-${pad(view.m + 1)}`;
  const step = (n: number) => setView((v) => { const x = new Date(v.y, v.m + n, 1); return { y: x.getFullYear(), m: x.getMonth() }; });
  const pick = (k: string) => { onChange(k); setOpen(false); setYears(false); };

  return (
    <div className="dp" ref={wrap}>
      <button type="button" id={id} className="dp-btn" data-date-picker={mode} data-value={value} onClick={() => setOpen((o) => !o)}>
        <span className={value ? '' : 'muted'}>{value ? show(value) : placeholder}</span>
        <Calendar size={14} />
      </button>
      {open && (
        <div className="dp-pop" role="dialog" aria-label="Choose a date">
          <div className="dp-head">
            <button type="button" className="dp-title" data-date-header onClick={() => setYears((s) => !s)}>{MONTHS[view.m]} {view.y}</button>
            <span>
              <button type="button" aria-label="Previous month" disabled={viewKey <= min.slice(0, 7)} onClick={() => step(-1)}><ChevronLeft size={14} /></button>
              <button type="button" aria-label="Next month" disabled={viewKey >= max.slice(0, 7)} onClick={() => step(1)}><ChevronRight size={14} /></button>
            </span>
          </div>
          {years ? (
            <div className="dp-years" data-date-years>
              {yearList.map((y) => (
                <button key={y} type="button" className={y === view.y ? 'on' : ''}
                  onClick={() => {
                    const lo = `${y}` === min.slice(0, 4) ? Number(min.slice(5, 7)) - 1 : 0;
                    const hi = `${y}` === max.slice(0, 4) ? Number(max.slice(5, 7)) - 1 : 11;
                    setView({ y, m: Math.min(Math.max(view.m, lo), hi) });
                    setYears(false);
                  }}>{y}</button>
              ))}
            </div>
          ) : (
            <div className="dp-grid">
              {WEEKDAYS.map((w) => <span key={w} className="dp-wd">{w}</span>)}
              {cells.map((c, i) => c
                ? <button key={c.k} type="button" disabled={c.disabled} onClick={() => pick(c.k)}
                    className={[c.k === value ? 'on' : '', c.k === today ? 'today' : ''].join(' ').trim()}>{c.d}</button>
                : <span key={`e${i}`} />)}
            </div>
          )}
          <p className="dp-hint">{boundsHint(mode, { min, max })}</p>
          <div className="dp-foot">
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>
            {today >= min && today <= max && <button type="button" className="warn" onClick={() => pick(today)}>Today</button>}
          </div>
        </div>
      )}
    </div>
  );
}
