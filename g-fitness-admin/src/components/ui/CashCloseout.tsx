import { useCallback, useEffect, useState } from 'react';
import { Wallet, CheckCircle2, AlertTriangle } from 'lucide-react';
import Button from './Button';
import { Section } from './kit';
import { showToast } from '../../utils/toast';
import { todayKey } from '../../utils/dates';
import { supabase } from '../../lib/supabaseClient';
import { cashDay, closeCashDay, recentCloseouts, type CashDay, type Closeout } from '../../lib/api/cash';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * "End of day" on Payments (0095): what the drawer should hold, what was
 * counted, and the difference — closed once per day by the desk. An admin may
 * redo a close, with a note, and the first count is kept.
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
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
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

  if (failed) {
    return (
      <Section title="End of day" icon={Wallet}>
        <p className="text-xs" style={{ color: 'var(--color-secondary)' }}>The cash drawer could not be read: {failed}</p>
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => void load()}>Try again</Button>
      </Section>
    );
  }

  if (summary === null) {
    return (
      <Section title="End of day" icon={Wallet}>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          The cash count needs migration 0095_operations.sql — paste it in the Supabase SQL editor.
        </p>
      </Section>
    );
  }

  return (
    <Section title="End of day" icon={Wallet}
      hint="Count the drawer, type the total, close the day. The expected amount is worked out by the database."
      actions={
        <input type="date" value={day} max={todayKey()} onChange={(e) => { setDay(e.target.value); setRedo(false); }}
          className="h-9 rounded-lg px-2.5 text-xs text-white outline-none"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', colorScheme: 'dark' }} />
      }>
      {summary === undefined ? (
        <div className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          <div className="space-y-1.5 text-xs">
            {[
              ['Cash payments', `${peso(summary.cashIn)} · ${summary.paymentCount} ${summary.paymentCount === 1 ? 'payment' : 'payments'}`],
              ['Refunds paid out', summary.refundsOut ? `− ${peso(summary.refundsOut)}` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span style={{ color: 'var(--color-text-secondary)' }}>{k}</span>
                <span className="text-white tabular-nums">{v}</span>
              </div>
            ))}
            <div className="flex justify-between gap-2 pt-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
              <span className="font-semibold text-white">Should be in the drawer</span>
              <span className="font-bold text-white tabular-nums">{peso(summary.expected)}</span>
            </div>
          </div>

          {summary.closed && !redo ? (
            <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: 'var(--color-surface-raised)' }}>
              <p className="flex items-center gap-1.5 font-semibold text-white">
                {summary.difference === 0
                  ? <CheckCircle2 size={14} style={{ color: 'var(--color-primary)' }} />
                  : <AlertTriangle size={14} style={{ color: 'var(--color-secondary)' }} />}
                Closed — counted {peso(summary.counted ?? 0)}
              </p>
              <p style={{ color: summary.difference === 0 ? 'var(--color-text-secondary)' : 'var(--color-secondary)' }}>
                {summary.difference === 0 ? 'Matches exactly.' : `${(summary.difference ?? 0) > 0 ? 'Over' : 'Short'} by ${peso(Math.abs(summary.difference ?? 0))}`}
              </p>
              {summary.note && <p style={{ color: 'var(--color-text-muted)' }}>“{summary.note}”</p>}
              <p style={{ color: 'var(--color-text-muted)' }}>
                {summary.closedByName ?? 'Someone'} · {summary.closedAt ? new Date(summary.closedAt).toLocaleString('en-PH', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }) : ''}
              </p>
              {isAdmin && (
                <button className="text-[11px] font-semibold mt-1" style={{ color: 'var(--color-secondary)' }} onClick={() => setRedo(true)}>
                  Redo this count
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Counted</span>
                <input value={counted} inputMode="decimal" placeholder="0.00" aria-label="Amount counted"
                  onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ''))}
                  className="h-9 w-32 rounded-lg px-2.5 text-sm font-semibold text-white text-right tabular-nums outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
                {diff != null && (
                  <span className="text-[11px] font-semibold" style={{ color: Math.abs(diff) < 0.001 ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
                    {Math.abs(diff) < 0.001 ? 'Matches' : `${diff > 0 ? 'Over' : 'Short'} ${peso(Math.abs(diff))}`}
                  </span>
                )}
              </div>
              {needsNote && (
                <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note"
                  placeholder={redo ? 'Why are you redoing this count?' : 'Why is it different? (required)'}
                  className="h-9 w-full rounded-lg px-2.5 text-xs text-white outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={busy || countedNum == null || (needsNote && !note.trim())} onClick={() => void submit()}>
                  {busy ? 'Closing…' : redo ? 'Save the new count' : 'Close the day'}
                </Button>
                {redo && <Button size="sm" variant="ghost" onClick={() => setRedo(false)}>Cancel</Button>}
              </div>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Recent closes</p>
          <div className="space-y-1">
            {history.map((h) => (
              <button key={h.day} onClick={() => setDay(h.day)} className="w-full flex items-center justify-between gap-2 text-[11px] px-2 py-1.5 rounded-lg text-left"
                style={{ background: h.day === day ? 'var(--color-surface-raised)' : 'transparent' }}>
                <span className="text-white">{new Date(`${h.day}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{peso(h.counted)} of {peso(h.expected)}</span>
                <span className="tabular-nums font-semibold w-24 text-right" style={{ color: h.difference === 0 ? 'var(--color-text-muted)' : 'var(--color-secondary)' }}>
                  {h.difference === 0 ? 'exact' : `${h.difference > 0 ? '+' : '−'}${peso(Math.abs(h.difference))}`}{h.previous ? ' · redone' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
