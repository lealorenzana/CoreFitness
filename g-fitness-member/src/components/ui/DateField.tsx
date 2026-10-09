import { useMemo, useState } from 'react';
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react';
import GlassSheet from './GlassSheet';
import { boundsHint, dateBounds, narrow, type BoundOpts, type DateMode } from '../../lib/dateRules';
import { todayKey } from '../../utils/dates';
import { useT } from '../../lib/i18n';

/**
 * The member and trainer app's one date picker (2026-10-10).
 *
 * `<input type="date">` handed Android its Material calendar — any year, the
 * OS's colours, a full-screen modal — and let a goal be set in 2002. This is a
 * sheet with a month grid that only offers what the MODE allows
 * (lib/dateRules.ts): future (deadlines, goals, schedules), record (something
 * that happened: a photo, a reading) or history. Birth dates keep their three
 * selects (BirthDateField) — nobody pages to their own birthday.
 *
 * The value is 'YYYY-MM-DD' or '' exactly as the native input gave, so callers
 * change nothing but the element. Built from local Y/M/D parts, never
 * toISOString(). Migration 0171 refuses the same windows in SQL.
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
const show = (v: string) => {
  const p = parse(v);
  return p ? new Date(p.y, p.m, p.d).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
};

interface Props {
  value: string;
  onChange: (value: string) => void;
  mode: DateMode;
  bounds?: BoundOpts;
  /** Narrows the mode further (e.g. an end never before its start). */
  min?: string;
  max?: string;
  placeholder?: string;
  /** The sheet's title; defaults to the placeholder. */
  label?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export default function DateField({
  value, onChange, mode, bounds, min: minProp, max: maxProp, placeholder, label, disabled, 'aria-label': ariaLabel,
}: Props) {
  const t = useT();
  const { min, max } = narrow(dateBounds(mode, bounds), minProp, maxProp);
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState(false);
  const today = todayKey();
  const [view, setView] = useState(() => {
    const at = parse(value) ?? parse(today < min ? min : today > max ? max : today)!;
    return { y: at.y, m: at.m };
  });

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const count = new Date(view.y, view.m + 1, 0).getDate();
    // Always six rows, so the sheet never changes height between months.
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
  const canPrev = viewKey > min.slice(0, 7);
  const canNext = viewKey < max.slice(0, 7);
  const step = (delta: number) => setView((v) => {
    const n = new Date(v.y, v.m + delta, 1);
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const pick = (k: string) => { onChange(k); setOpen(false); setYears(false); };
  const todayAllowed = today >= min && today <= max;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? label ?? placeholder}
        data-date-field={mode}
        onClick={() => setOpen(true)}
        className="field-input flex items-center justify-between text-left noc-press"
        style={{ gap: 10, opacity: disabled ? 0.5 : 1 }}
      >
        <span style={{ color: value ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
          {value ? show(value) : (placeholder ?? t('Pick a date'))}
        </span>
        <CalendarBlank size={18} style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
      </button>

      <GlassSheet open={open} onClose={() => { setOpen(false); setYears(false); }}
        title={label ?? placeholder ?? t('Pick a date')} subtitle={boundsHint(mode, { min, max })}>
        <div style={{ padding: '0 var(--gutter) 16px' }} data-date-sheet>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <button type="button" onClick={() => setYears((s) => !s)} data-date-header
              style={{ fontSize: 16, fontWeight: 700, padding: '6px 10px', borderRadius: 10,
                color: 'var(--color-text-primary)', background: years ? 'rgba(124,58,237,0.18)' : 'transparent' }}>
              {MONTHS[view.m]} {view.y}
            </button>
            <div className="flex" style={{ gap: 8 }}>
              <NavBtn label={t('Previous month')} disabled={!canPrev} onClick={() => step(-1)}><CaretLeft size={18} /></NavBtn>
              <NavBtn label={t('Next month')} disabled={!canNext} onClick={() => step(1)}><CaretRight size={18} /></NavBtn>
            </div>
          </div>

          {years ? (
            <div className="grid" data-date-years style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {yearList.map((y) => (
                <button key={y} type="button"
                  onClick={() => {
                    const lo = `${y}` === min.slice(0, 4) ? Number(min.slice(5, 7)) - 1 : 0;
                    const hi = `${y}` === max.slice(0, 4) ? Number(max.slice(5, 7)) - 1 : 11;
                    setView({ y, m: Math.min(Math.max(view.m, lo), hi) });
                    setYears(false);
                  }}
                  style={{ height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
                    background: y === view.y ? 'var(--color-primary)' : 'rgba(233,233,237,0.05)',
                    color: y === view.y ? '#fff' : 'var(--color-text-secondary)' }}>
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginBottom: 4 }}>
                {WEEKDAYS.map((w) => (
                  <span key={w} className="text-center" style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '4px 0' }}>{w}</span>
                ))}
              </div>
              <div className="grid" data-date-days style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
                {cells.map((c, i) => c ? (
                  <button key={c.k} type="button" disabled={c.disabled} onClick={() => pick(c.k)}
                    aria-label={show(c.k)} aria-pressed={c.k === value}
                    style={{
                      height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
                      background: c.k === value ? 'var(--color-primary)' : 'transparent',
                      color: c.k === value ? '#fff' : c.disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                      opacity: c.disabled ? 0.35 : 1,
                      // Today ringed in amber, never filled, so it is not mistaken for the choice.
                      boxShadow: c.k === today && c.k !== value ? 'inset 0 0 0 1.5px var(--color-secondary)' : undefined,
                    }}>
                    {c.d}
                  </button>
                ) : <span key={`e${i}`} />)}
              </div>
            </>
          )}

          <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}
              style={{ fontSize: 13, fontWeight: 600, padding: '8px 4px', color: 'var(--color-text-muted)' }}>
              {t('Clear')}
            </button>
            {todayAllowed && (
              <button type="button" onClick={() => pick(today)}
                style={{ fontSize: 13, fontWeight: 600, padding: '8px 4px', color: 'var(--color-secondary)' }}>
                {t('Today')}
              </button>
            )}
          </div>
        </div>
      </GlassSheet>
    </>
  );
}

function NavBtn({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className="grid place-items-center noc-press"
      style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(233,233,237,0.14)',
        color: 'var(--color-text-secondary)', opacity: disabled ? 0.3 : 1 }}>
      {children}
    </button>
  );
}
