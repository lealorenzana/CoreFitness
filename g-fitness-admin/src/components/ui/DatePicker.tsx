import { useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import Popover from './Popover';

/**
 * Our own calendar, because the native one cannot be designed.
 *
 * `color-scheme: dark` is the whole of the control CSS has over
 * `<input type="date">` — it picks dark or light and nothing else. The grid, the
 * typography, the blue selection, the "Clear / Today" links and the month
 * dropdown all belong to Chrome, look different in every browser, and cannot be
 * themed. Rendering the calendar ourselves is the only way to make it match.
 *
 * The value stays a plain **'YYYY-MM-DD' string**, identical to what
 * `<input type="date">` produced, so nothing downstream changes.
 *
 * Dates are built and compared as local Y/M/D parts throughout. `new
 * Date('2026-08-19')` parses as **UTC midnight**, which in Manila is 8am the
 * same day but in any negative-offset zone is the *previous* day — the classic
 * off-by-one that `toISOString()` causes in the other direction.
 */

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM-DD' from local parts. Never toISOString(). */
function key(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function todayKey(): string {
  const t = new Date();
  return key(t.getFullYear(), t.getMonth(), t.getDate());
}

/** Parses 'YYYY-MM-DD' into local parts, or null. Never `new Date(string)`. */
function parse(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

export function formatDisplay(value: string): string {
  const p = parse(value);
  if (!p) return '';
  return new Date(p.y, p.m, p.d).toLocaleDateString('en-PH', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export interface DatePickerProps {
  /** 'YYYY-MM-DD', or '' for empty. */
  value: string;
  onChange: (value: string) => void;
  /** Inclusive bounds, 'YYYY-MM-DD'. Out-of-range days are shown but disabled. */
  min?: string;
  max?: string;
  placeholder?: string;
  /** Jump straight to a sensible decade for a birth date. */
  startView?: 'month' | 'year';
}

export default function DatePicker({
  value, onChange, min, max, placeholder = 'Select a date', startView = 'month',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [showYears, setShowYears] = useState(startView === 'year');
  const anchorRef = useRef<HTMLButtonElement>(null);

  const selected = parse(value);
  const today = parse(todayKey())!;
  // The month on screen: the selected date's, else today's.
  const [view, setView] = useState(() => ({
    y: selected?.y ?? today.y,
    m: selected?.m ?? today.m,
  }));

  const cells = useMemo(() => {
    const firstDow = new Date(view.y, view.m, 1).getDay();
    const daysThis = new Date(view.y, view.m + 1, 0).getDate();
    const daysPrev = new Date(view.y, view.m, 0).getDate();

    // Always six rows. A month that fits in five would otherwise make the panel
    // change height as you page through it, moving the buttons under the cursor.
    return Array.from({ length: 42 }, (_, i) => {
      const offset = i - firstDow;
      if (offset < 0) {
        return { y: view.y, m: view.m - 1, d: daysPrev + offset + 1, outside: true };
      }
      if (offset >= daysThis) {
        return { y: view.y, m: view.m + 1, d: offset - daysThis + 1, outside: true };
      }
      return { y: view.y, m: view.m, d: offset + 1, outside: false };
    }).map((c) => {
      // Normalised so December's spill lands in the next year, not month 12.
      const real = new Date(c.y, c.m, c.d);
      const k = key(real.getFullYear(), real.getMonth(), real.getDate());
      return {
        ...c,
        k,
        disabled: (min != null && k < min) || (max != null && k > max),
        isToday: k === todayKey(),
        isSelected: k === value,
      };
    });
  }, [view, value, min, max]);

  const years = useMemo(() => {
    const from = min ? Number(min.slice(0, 4)) : today.y - 100;
    const to = max ? Number(max.slice(0, 4)) : today.y + 10;
    const list: number[] = [];
    for (let y = to; y >= from; y--) list.push(y);
    return list;
  }, [min, max, today.y]);

  const pick = (k: string) => {
    onChange(k);
    setOpen(false);
    setShowYears(false);
  };

  const step = (delta: number) => {
    setView((v) => {
      const next = new Date(v.y, v.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => { setOpen((o) => !o); setShowYears(startView === 'year' && !value); }}
        className="w-full px-3 py-2 rounded-xl text-xs text-left flex items-center justify-between gap-2 transition-colors"
        style={{
          background: 'var(--color-bg)',
          border: `1px solid ${open ? 'var(--color-primary)' : 'var(--color-border)'}`,
          color: value ? '#fff' : 'var(--color-text-muted)',
        }}
      >
        <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
        <Calendar size={13} style={{ color: 'var(--color-text-muted)' }} className="flex-shrink-0" />
      </button>

      <Popover anchor={anchorRef.current} open={open} onClose={() => setOpen(false)} width={268}>
        <div className="p-3">
          {/* Month header */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setShowYears((s) => !s)}
              className="px-2 py-1 rounded-lg text-xs font-bold text-white transition-colors"
              style={{ background: showYears ? 'var(--color-primary-light)' : 'transparent' }}>
              {MONTHS[view.m]} {view.y}
            </button>
            <div className="flex items-center gap-1">
              <IconBtn onClick={() => step(-1)} label="Previous month"><ChevronLeft size={14} /></IconBtn>
              <IconBtn onClick={() => step(1)} label="Next month"><ChevronRight size={14} /></IconBtn>
            </div>
          </div>

          {showYears ? (
            <div className="grid grid-cols-4 gap-1 max-h-[212px] overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
              {years.map((y) => (
                <button key={y} type="button"
                  onClick={() => { setView((v) => ({ ...v, y })); setShowYears(false); }}
                  className="py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
                  style={{
                    background: y === view.y ? 'var(--color-primary)' : 'transparent',
                    color: y === view.y ? '#fff' : 'var(--color-text-secondary)',
                  }}>
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="text-center text-[9px] font-bold uppercase tracking-wider py-1"
                    style={{ color: 'var(--color-text-muted)' }}>
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((c, i) => (
                  <button
                    key={`${c.k}-${i}`}
                    type="button"
                    disabled={c.disabled}
                    onClick={() => pick(c.k)}
                    className="h-8 rounded-lg text-[11px] font-semibold transition-colors disabled:cursor-not-allowed"
                    style={{
                      background: c.isSelected ? 'var(--color-primary)' : 'transparent',
                      color: c.isSelected
                        ? '#fff'
                        : c.disabled
                          ? 'var(--color-border)'
                          : c.outside
                            ? 'var(--color-text-muted)'
                            : '#fff',
                      // Today is ringed in amber rather than filled, so it never
                      // gets mistaken for the selected day.
                      boxShadow: c.isToday && !c.isSelected ? 'inset 0 0 0 1px var(--color-secondary)' : undefined,
                      opacity: c.outside && !c.isSelected ? 0.45 : 1,
                    }}
                  >
                    {c.d}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}
              className="text-[10px] font-semibold px-2 py-1 rounded-lg"
              style={{ color: 'var(--color-text-muted)' }}>
              Clear
            </button>
            <button type="button"
              onClick={() => {
                const k = todayKey();
                if ((min && k < min) || (max && k > max)) {
                  // Jump the view there anyway — refusing silently looks broken.
                  setView({ y: today.y, m: today.m });
                  return;
                }
                pick(k);
              }}
              className="text-[10px] font-semibold px-2 py-1 rounded-lg"
              style={{ color: 'var(--color-secondary)' }}>
              Today
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-tip={label} aria-label={label}
      className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
      style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
      {children}
    </button>
  );
}
