import { useCallback, useEffect, useState } from 'react';
import { Wallet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { RdCard, RdButton } from './rd';
import { showToast } from '../../utils/toast';
import { todayKey } from '../../utils/dates';
import DatePicker from './DatePicker';
import { supabase } from '../../lib/supabaseClient';
import { cashDay, closeCashDay, recentCloseouts, type CashDay, type Closeout } from '../../lib/api/cash';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * "End of day" on Payments (0095): what the drawer should hold, what was
 * counted, and the difference — closed once per day by the desk. An admin may
 * redo a close, with a note, and the first count is kept.
 *
 * 2026-10-12: one column, so it sits in the Payments rail beside the records.
 */
export default function CashCloseout({ refreshKey }: { refreshKey?: unknown }) {
  /** Only an admin may redo a close (the SQL checks too) — read the same way the sidebar does. */
  const [isAdmin, setIsAdmin] = useState(false);
  const [day, setDay] = useState(() => todayKey());
  const [summary, setSummary] = useState<CashDay | null | undefined>(undefined);
  /** A read that failed — distinct from 0095 not being pasted (summary null). */
  const [failed, setFailed] = useState<string | null>(null);
  const [history, setHistory] = useState<Closeout[]>([]);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [redo, setRedo] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([cashDay(day), recentCloseouts()]);
      setSummary(s);
      setHistory(h);
      setFailed(null);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not read the cash drawer');
    }
  }, [day]);

  useEffect(() => { void (async () => { await load(); })(); }, [load, refreshKey]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('gym_people').select('role').eq('id', user.id).single();
      if (alive) setIsAdmin(data?.role === 'admin');
    })();
    return () => { alive = false; };
  }, []);

  const countedNum = counted.trim() === '' ? null : Number(counted);
  const diff = summary && countedNum != null && Number.isFinite(countedNum) ? countedNum - summary.expected : null;
  const needsNote = (diff != null && Math.abs(diff) > 0.001) || redo;

  const submit = async () => {
    if (!summary || countedNum == null || !Number.isFinite(countedNum)) return;
    setBusy(true);
    try {
      await closeCashDay(day, countedNum, note);
      showToast(diff === 0 ? 'Day closed — the drawer matches' : 'Day closed with the difference noted', 'success');
      setCounted(''); setNote(''); setRedo(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not close the day', 'error');
    } finally {
      setBusy(false);
    }
  };

  const head = (
    <div className="flex items-start gap-2.5">
      <Wallet size={20} style={{ color: '#FBBF24' }} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <h3 className="text-[16px] font-semibold text-white">End of day</h3>
        <p className="text-[12.5px]" style={{ color: 'var(--color-text-secondary)' }}>Count the drawer, type the total, close the day.</p>
      </div>
    </div>
  );

  if (failed) {
    return (
      <RdCard className="p-4" data-cash>
        {head}
        <p className="text-[13px] mt-3" style={{ color: '#FBBF24' }}>The cash drawer could not be read: {failed}</p>
        <RdButton size="sm" variant="ghost" className="mt-2" onClick={() => void load()}>Try again</RdButton>
      </RdCard>
    );
  }

  if (summary === null) {
    return (
      <RdCard className="p-4" data-cash>
        {head}
        <p className="text-[13px] mt-3" style={{ color: 'var(--color-text-muted)' }}>The cash count needs migration 0095_operations.sql — paste it in the Supabase SQL editor.</p>
      </RdCard>
    );
  }

  return (
    // Grows to the rail's height, so its bottom meets the records beside it (2026-10-25).
    <RdCard className="p-4 flex flex-col" style={{ flexGrow: 1 }} data-cash>
      {head}
      <div className="mt-3">
        <DatePicker mode="record" bounds={{ backDays: 7 }} value={day} onChange={(v) => { if (v) { setDay(v); setRedo(false); } }} />
      </div>
      {summary === undefined ? (
        <div className="h-24 rounded-lg animate-pulse mt-3" style={{ background: 'rgba(255,255,255,0.04)' }} />
      ) : (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5 text-[13px]">
            {/* Counter sales (0133) are cash in too, and counted here. */}
            <div className="flex justify-between gap-2">
              <span style={{ color: 'var(--color-text-secondary)' }}>Cash in ({summary.paymentCount} {summary.paymentCount === 1 ? 'sale or payment' : 'sales and payments'})</span>
              <span className="text-white tabular-nums">{peso(summary.cashIn)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span style={{ color: 'var(--color-text-secondary)' }}>Refunds paid out</span>
              <span className="text-white tabular-nums">{summary.refundsOut ? `− ${peso(summary.refundsOut)}` : '—'}</span>
            </div>
            <div className="flex justify-between gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="font-semibold text-white">Should be in the drawer</span>
              <span className="font-bold text-white tabular-nums">{peso(summary.expected)}</span>
            </div>
          </div>

          {summary.closed && !redo ? (
            <div className="rounded-xl p-3 text-[13px] space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="flex items-center gap-1.5 font-semibold text-white">
                {summary.difference === 0
                  ? <CheckCircle2 size={15} style={{ color: '#C4B5FD' }} />
                  : <AlertTriangle size={15} style={{ color: '#FBBF24' }} />}
                Closed — counted {peso(summary.counted ?? 0)}
              </p>
              <p style={{ color: summary.difference === 0 ? 'var(--color-text-secondary)' : '#FBBF24' }}>
                {summary.difference === 0 ? 'Matches exactly.' : `${(summary.difference ?? 0) > 0 ? 'Over' : 'Short'} by ${peso(Math.abs(summary.difference ?? 0))}`}
              </p>
              {summary.note && <p style={{ color: 'var(--color-text-muted)' }}>“{summary.note}”</p>}
              <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                {summary.closedByName ?? 'Someone'}, {summary.closedAt ? new Date(summary.closedAt).toLocaleString('en-PH', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }) : ''}
              </p>
              {isAdmin && (
                <button type="button" className="text-[12.5px] font-semibold mt-1" style={{ color: '#FBBF24' }} onClick={() => setRedo(true)}>Redo this count</button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <span className="text-[13px] w-16" style={{ color: 'var(--color-text-secondary)' }}>Counted</span>
                <input value={counted} inputMode="decimal" placeholder="0.00" aria-label="Amount counted"
                  onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ''))}
                  className="h-10 flex-1 min-w-0 rounded-xl px-3 text-[15px] font-semibold text-white text-right tabular-nums outline-none"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </label>
              {diff != null && (
                <p className="text-[12.5px] font-semibold text-right" style={{ color: Math.abs(diff) < 0.001 ? '#C4B5FD' : '#FBBF24' }}>
                  {Math.abs(diff) < 0.001 ? 'Matches' : `${diff > 0 ? 'Over' : 'Short'} ${peso(Math.abs(diff))}`}
                </p>
              )}
              {needsNote && (
                <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note"
                  placeholder={redo ? 'Why are you redoing this count?' : 'Why is it different? (required)'}
                  className="h-10 w-full rounded-xl px-3 text-[13px] text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }} />
              )}
              <div className="flex gap-2">
                <RdButton size="sm" variant="amber" className="flex-1" disabled={busy || countedNum == null || (needsNote && !note.trim())} onClick={() => void submit()}>
                  {busy ? 'Closing…' : redo ? 'Save the new count' : 'Close the day'}
                </RdButton>
                {redo && <RdButton size="sm" variant="ghost" onClick={() => setRedo(false)}>Cancel</RdButton>}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[12.5px] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Recent closes</p>
          {history.length === 0 && <p className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>None yet — each day you close shows here, with any difference.</p>}
          <div className="space-y-1">
            {history.map((h) => (
              <button type="button" key={h.day} onClick={() => setDay(h.day)} className="w-full flex items-center justify-between gap-2 text-[12.5px] px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.04]"
                style={{ background: h.day === day ? 'rgba(124,58,237,0.14)' : 'transparent' }}>
                <span className="text-white">{new Date(`${h.day}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="tabular-nums font-semibold" style={{ color: h.difference === 0 ? 'var(--color-text-muted)' : '#FBBF24' }}>
                  {h.difference === 0 ? 'exact' : `${h.difference > 0 ? '+' : '−'}${peso(Math.abs(h.difference))}`}{h.previous ? ' (redone)' : ''}
                </span>
              </button>
            ))}
          </div>
      </div>
    </RdCard>
  );
}
