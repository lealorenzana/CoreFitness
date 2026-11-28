import { useEffect, useState } from 'react';
import { Banknote, CalendarDays, Download, Dumbbell } from 'lucide-react';
import SideWindow from './SideWindow';
import { supabase } from '../../lib/supabaseClient';
import { exportToCSV } from '../../utils/exportUtils';
import { todayKey } from '../../utils/dates';
import { useGymFirstDay } from '../../hooks/useGymFirstDay';

/** 'YYYY-MM' from this month back to the gym's first (or 24 months when unknown). */
function monthsSince(first: string | undefined, today: string): string[] {
  const out: string[] = [];
  let y = Number(today.slice(0, 4)); let m = Number(today.slice(5, 7));
  const stop = first ? first.slice(0, 7) : '';
  for (let i = 0; i < 120; i++) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    out.push(k);
    if ((stop && k <= stop) || (!stop && i === 23)) break;
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}
const fmtMonth = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1)
  .toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

interface Row {
  trainer_id: string; first_name: string; last_name: string;
  pt_sessions: number; pt_hours: number; classes_led: number; class_attendees: number; distinct_members: number;
}

/**
 * What each coach delivered in a month (0095's trainer_month_summary), for
 * paying them. "Delivered" is what the rest of the system means by it:
 * approved and already started; a class with nobody in it was not led.
 *
 * The rates are typed here to work out an estimate and are **not stored** —
 * how the gym pays its coaches is its own business, and a saved rate would be a
 * figure the system could not stand behind. The export carries the counts and,
 * if rates were typed, the estimate.
 */
export default function TrainerMonthTotals({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const firstDay = useGymFirstDay();
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined);
  const [ptRate, setPtRate] = useState('');
  const [classRate, setClassRate] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc('trainer_month_summary', { p_month: `${month}-01` });
      if (!alive) return;
      if (error) { setRows(error.code === 'PGRST202' || error.code === '42883' ? null : []); return; }
      setRows((data ?? []) as Row[]);
    })();
    return () => { alive = false; };
  }, [isOpen, month]);

  const pr = Number(ptRate) || 0;
  const cr = Number(classRate) || 0;
  const pay = (r: Row) => r.pt_sessions * pr + r.classes_led * cr;
  const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const exportCsv = () => {
    if (!rows?.length) return;
    exportToCSV(rows.map((r) => ({
      Trainer: `${r.first_name} ${r.last_name}`,
      'PT sessions': r.pt_sessions,
      'PT hours': r.pt_hours,
      'Classes led': r.classes_led,
      'Class attendees': r.class_attendees,
      'Different members': r.distinct_members,
      ...(pr || cr ? { 'Estimated pay (PHP)': pay(r) } : {}),
    })), `trainer-totals-${month}`, false);
  };

  if (!isOpen) return null;
  const all = rows ?? [];
  const ptN = all.reduce((x, r) => x + r.pt_sessions, 0);
  const clsN = all.reduce((x, r) => x + r.classes_led, 0);
  const payN = all.reduce((x, r) => x + pay(r), 0);
  // The floating page (owner, 2026-11-28): the month's totals on the gym's colour, the table and rates on the right.
  return (
    <SideWindow label={`Trainer totals, ${monthLabel}`} data-month-totals onClose={onClose}
      title="Monthly totals" blurb={`Sessions and classes each coach delivered in ${monthLabel}, for paying them.`}
      figure={{ n: ptN + clsN, word: 'sessions and classes' }}
      facts={[
        { icon: <Dumbbell size={14} />, text: `${ptN} PT session${ptN === 1 ? '' : 's'} across ${all.length} coach${all.length === 1 ? '' : 'es'}` },
        { icon: <CalendarDays size={14} />, text: `${clsN} class${clsN === 1 ? '' : 'es'} led` },
        { icon: <Banknote size={14} />, text: pr || cr ? `${peso(payN)} at the rates you typed` : 'Type a rate per session or class for an estimate. Rates are not saved.' },
      ]}
      say={rows === undefined ? 'Counting the month.' : all.length ? `${monthLabel}: ${ptN} sessions and ${clsN} classes.` : 'No active coaches this month.'}
      art="/images/admin-art/mascot-clipboard.webp">
      <div className="flex flex-wrap items-center gap-3 mb-3" style={{ paddingRight: 40 }}>
        <button type="button" className="am-btn go ml-auto order-last" onClick={exportCsv} disabled={!rows?.length}><Download size={14} />Export</button>
        {/* A month that happened: the gym's first month … this month, never a year
            nobody worked in (the native month input offered any). */}
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month"
          className="h-9 rounded-lg px-2.5 text-[13px] outline-none"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
          {monthsSince(firstDay, todayKey()).map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        {[['Per PT session ₱', ptRate, setPtRate], ['Per class led ₱', classRate, setClassRate]].map(([label, v, set]) => (
          <label key={label as string} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            {label as string}
            <input value={v as string} inputMode="numeric" placeholder="0"
              onChange={(e) => (set as (s: string) => void)(e.target.value.replace(/\D/g, ''))}
              className="h-9 w-20 rounded-lg px-2 text-[13px] text-right outline-none"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }} />
          </label>
        ))}
      </div>
      {rows === undefined ? (
        <div className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
      ) : rows === null ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>This needs migration 0095_operations.sql.</p>
      ) : rows.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No active trainers.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ color: 'var(--color-text-muted)' }}>
              <th className="text-left font-medium py-1.5">Trainer</th>
              <th className="text-right font-medium">PT sessions</th>
              <th className="text-right font-medium">PT hours</th>
              <th className="text-right font-medium">Classes led</th>
              <th className="text-right font-medium">Attendees</th>
              <th className="text-right font-medium">Members</th>
              {(pr > 0 || cr > 0) && <th className="text-right font-medium">Estimate</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.trainer_id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td className="py-2.5" style={{ color: 'var(--color-text-primary)' }}>{r.first_name} {r.last_name}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{r.pt_sessions}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{r.pt_hours}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{r.classes_led}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{r.class_attendees}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{r.distinct_members}</td>
                {(pr > 0 || cr > 0) && <td className="text-right tabular-nums font-semibold" style={{ color: 'var(--color-secondary)' }}>{peso(pay(r))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SideWindow>
  );
}
