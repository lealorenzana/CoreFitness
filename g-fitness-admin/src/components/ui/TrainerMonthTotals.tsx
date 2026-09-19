import { useEffect, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { supabase } from '../../lib/supabaseClient';
import { exportToCSV } from '../../utils/exportUtils';
import { todayKey } from '../../utils/dates';

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title={`Trainer totals — ${monthLabel}`}
      subtitle="Sessions and classes each coach delivered, for paying them" cancelLabel="Close"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Rates are for this estimate only and are not saved.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={exportCsv} disabled={!rows?.length}>Export CSV</Button>
          </div>
        </div>
      }>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input type="month" value={month} max={todayKey().slice(0, 7)} onChange={(e) => setMonth(e.target.value)}
          className="h-9 rounded-lg px-2.5 text-xs text-white outline-none"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', colorScheme: 'dark' }} />
        {[['Per PT session ₱', ptRate, setPtRate], ['Per class led ₱', classRate, setClassRate]].map(([label, v, set]) => (
          <label key={label as string} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            {label as string}
            <input value={v as string} inputMode="numeric" placeholder="0"
              onChange={(e) => (set as (s: string) => void)(e.target.value.replace(/\D/g, ''))}
              className="h-8 w-20 rounded-lg px-2 text-xs text-white text-right outline-none"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
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
        <table className="w-full text-xs">
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
                <td className="py-2 text-white">{r.first_name} {r.last_name}</td>
                <td className="text-right tabular-nums text-white">{r.pt_sessions}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{r.pt_hours}</td>
                <td className="text-right tabular-nums text-white">{r.classes_led}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{r.class_attendees}</td>
                <td className="text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{r.distinct_members}</td>
                {(pr > 0 || cr > 0) && <td className="text-right tabular-nums font-semibold" style={{ color: 'var(--color-secondary)' }}>{peso(pay(r))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
