import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import Popover from './Popover';

/**
 * Our own time picker, for the same reason as the calendar: the native
 * `<input type="time">` spinner is browser chrome and cannot be themed.
 *
 * Three columns — hour, minute, AM/PM — which is the same mental model as the
 * native one, so nobody has to relearn it. The value stays 24-hour
 * **'HH:MM'**, exactly what `<input type="time">` produced.
 *
 * Minutes step by 5. A gym class starts at 6:00 or 6:30, never 6:07, and 60
 * rows of minutes is a scroll nobody wants. A time already stored off-step
 * (imported, or typed before this component existed) is kept and shown rather
 * than snapped to the nearest 5 — silently moving someone's data is worse than
 * an odd-looking row.
 */

const HOURS12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function parse(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

function to24(hour12: number, minute: number, pm: boolean): string {
  const h = pm ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatDisplay(value: string): string {
  const p = parse(value);
  if (!p) return '';
  const hour12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${hour12}:${String(p.m).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
}

export interface TimePickerProps {
  /** 24-hour 'HH:MM', or '' for empty. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function TimePicker({ value, onChange, placeholder = 'Select a time' }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const parsed = parse(value);
  const hour12 = parsed ? (parsed.h % 12 === 0 ? 12 : parsed.h % 12) : null;
  const minute = parsed?.m ?? null;
  const pm = parsed ? parsed.h >= 12 : false;

  // A partial selection still has to produce a valid time, so the two unset
  // parts fall back to something sane rather than leaving the field empty.
  const commit = (nextHour: number | null, nextMinute: number | null, nextPm: boolean) => {
    onChange(to24(nextHour ?? hour12 ?? 6, nextMinute ?? minute ?? 0, nextPm));
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 rounded-xl text-xs text-left flex items-center justify-between gap-2 transition-colors"
        style={{
          background: 'var(--color-bg)',
          border: `1px solid ${open ? 'var(--color-primary)' : 'var(--color-border)'}`,
          color: value ? '#fff' : 'var(--color-text-muted)',
        }}
      >
        <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
        <Clock size={13} style={{ color: 'var(--color-text-muted)' }} className="flex-shrink-0" />
      </button>

      <Popover anchor={anchorRef.current} open={open} onClose={() => setOpen(false)} width={210}>
        <div className="flex" style={{ height: 200 }}>
          <Column
            items={HOURS12.map((h) => ({ key: h, label: String(h), selected: h === hour12 }))}
            onPick={(h) => commit(h, minute, pm)}
          />
          <Divider />
          <Column
            items={MINUTES.map((m) => ({ key: m, label: String(m).padStart(2, '0'), selected: m === minute }))}
            onPick={(m) => commit(hour12, m, pm)}
            // An off-step minute would otherwise vanish from the list entirely.
            extra={minute != null && !MINUTES.includes(minute)
              ? { key: minute, label: String(minute).padStart(2, '0'), selected: true }
              : undefined}
          />
          <Divider />
          <div className="flex-1 p-1.5 space-y-1">
            {[false, true].map((isPm) => (
              <button key={String(isPm)} type="button"
                onClick={() => commit(hour12, minute, isPm)}
                className="w-full py-2 rounded-lg text-[11px] font-bold transition-colors"
                style={{
                  background: parsed && pm === isPm ? 'var(--color-primary)' : 'transparent',
                  color: parsed && pm === isPm ? '#fff' : 'var(--color-text-secondary)',
                }}>
                {isPm ? 'PM' : 'AM'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button type="button" onClick={() => { onChange(''); setOpen(false); }}
            className="text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
            Clear
          </button>
          <button type="button" onClick={() => setOpen(false)}
            className="text-[10px] font-semibold" style={{ color: 'var(--color-secondary)' }}>
            Done
          </button>
        </div>
      </Popover>
    </>
  );
}

interface ColumnItem { key: number; label: string; selected: boolean }

function Column({ items, onPick, extra }: {
  items: ColumnItem[];
  onPick: (key: number) => void;
  extra?: ColumnItem;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const all = extra ? [...items, extra].sort((a, b) => a.key - b.key) : items;

  // Scroll the chosen row into view when the panel opens. `block: 'nearest'`
  // keeps it inside this column instead of scrolling the whole modal behind it.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin scrollbar-thumb-dark-border">
      {all.map((it) => (
        <button key={it.key} type="button" data-selected={it.selected}
          onClick={() => onPick(it.key)}
          className="w-full py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
          style={{
            background: it.selected ? 'var(--color-primary)' : 'transparent',
            color: it.selected ? '#fff' : 'var(--color-text-secondary)',
          }}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, background: 'var(--color-border)' }} />;
}
