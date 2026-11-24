import { useCallback, useEffect, useState } from 'react';
import { Wallet, CheckCircle2, AlertTriangle, HandCoins, Bot } from 'lucide-react';
import { RdCard, RdButton, RdSelect } from './rd';
import { TONE } from './rdTokens';
import ConfirmDialog from './ConfirmDialog';
import { showToast } from '../../utils/toast';
import { todayKey } from '../../utils/dates';
import DatePicker from './DatePicker';
import { supabase } from '../../lib/supabaseClient';
import {
  autoCloseDays, cashDay, closeCashDay, drawerPeople, listCashOuts, recentCloseouts, recordCashOut, voidCashOut,
  type CashDay, type CashOut, type CashOutKind, type Closeout,
} from '../../lib/api/cash';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const HAIR = '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)';
const FIELD = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.1)' };
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

/**
 * "End of day" in the Payments rail (0095, 0271). The system works out what the
 * drawer should hold: what was left at the last close, plus the day's cash in,
 * minus refunds, cash handed to the owner and cash paid out. A past day nobody
 * closed is closed automatically at that amount and says nobody counted
 * (pg_cron at 00:05 Manila, or the sweep this card runs on load). Closing early
 * is the desk typing what they counted; the difference is shown.
 */
export default function CashCloseout({ refreshKey, onDrawer }: { refreshKey?: unknown; onDrawer?: (today: CashDay | null) => void }) {
  /** Only an admin may redo a counted close or undo a cash out (the SQL checks too). */
  const [isAdmin, setIsAdmin] = useState(false);
  const [day, setDay] = useState(() => todayKey());
  const [summary, setSummary] = useState<CashDay | null | undefined>(undefined);
  /** A read that failed — distinct from 0095 not being pasted (summary null). */
  const [failed, setFailed] = useState<string | null>(null);
  const [history, setHistory] = useState<Closeout[]>([]);
  const [outs, setOuts] = useState<CashOut[]>([]);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [redo, setRedo] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The "Take cash out" form, today only. */
  const [taking, setTaking] = useState(false);
  const [kind, setKind] = useState<CashOutKind>('handed_over');
  const [outAmount, setOutAmount] = useState('');
  const [outNote, setOutNote] = useState('');
  const [takenBy, setTakenBy] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [toUndo, setToUndo] = useState<CashOut | null>(null);
  const [swept, setSwept] = useState(false);
  const isToday = day === todayKey();

  const load = useCallback(async () => {
    try {
      const [s, h, o] = await Promise.all([cashDay(day), recentCloseouts(), listCashOuts(day)]);
      setSummary(s);
      setHistory(h);
      setOuts(o);
      setFailed(null);
      if (day === todayKey()) onDrawer?.(s);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not read the cash drawer');
    }
  }, [day, onDrawer]);

  // The automatic close runs once per visit, before the first read, so yesterday shows closed.
  useEffect(() => { void (async () => { await autoCloseDays().catch(() => {}); setSwept(true); })(); }, []);
  useEffect(() => { if (swept) void (async () => { await load(); })(); }, [load, refreshKey, swept]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data }, ppl] = await Promise.all([
        supabase.from('gym_people').select('role').eq('id', user.id).single(),
        drawerPeople(),
      ]);
      if (!alive) return;
      setIsAdmin(data?.role === 'admin');
      setPeople(ppl);
      // Handed over usually means the owner collected it: start there.
      setTakenBy((ppl.find((p) => p.role === 'admin') ?? ppl[0])?.id ?? '');
    })();
    return () => { alive = false; };
  }, []);

  const countedNum = counted.trim() === '' ? null : Number(counted);
  const diff = summary && countedNum != null && Number.isFinite(countedNum) ? countedNum - summary.expected : null;
  // A real count over an automatic close needs a note only when it differs.
  const needsNote = (diff != null && Math.abs(diff) > 0.001) || (redo && !summary?.auto);

  const submit = async () => {
    if (!summary || countedNum == null || !Number.isFinite(countedNum)) return;
    setBusy(true);
    try {
      await closeCashDay(day, countedNum, note);
      showToast(Math.abs(diff ?? 0) < 0.001 ? 'Day closed. The drawer matches.' : 'Day closed with the difference noted', 'success');
      setCounted(''); setNote(''); setRedo(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not close the day', 'error');
    } finally {
      setBusy(false);
    }
  };

  const outNum = outAmount.trim() === '' ? null : Number(outAmount);
  const outReady = outNum != null && outNum > 0 && (kind === 'handed_over' ? !!takenBy : !!outNote.trim());
  const takeOut = async () => {
    if (!outReady || outNum == null) return;
    setBusy(true);
    try {
      await recordCashOut(kind, outNum, kind === 'handed_over' ? takenBy : null, outNote);
      showToast(kind === 'handed_over' ? `${peso(outNum)} handed over, recorded` : `${peso(outNum)} paid out, recorded`, 'success');
      setTaking(false); setOutAmount(''); setOutNote('');
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not record it', 'error');
    } finally {
      setBusy(false);
    }
  };

  const undo = async (reason?: string) => {
    if (!toUndo) return;
    try {
      await voidCashOut(toUndo.id, reason ?? '');
      showToast('Undone. The drawer counts it again.', 'success');
      setToUndo(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not undo it', 'error');
    }
  };

  const head = (
    <div className="flex items-start gap-2.5">
      <Wallet size={20} style={{ color: TONE.amber.fg }} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <h3 className="text-[16px] font-semibold text-white">End of day</h3>
        <p className="text-[12.5px]" style={{ color: SECOND }}>The system counts what should be in the drawer. Closes by itself at midnight.</p>
      </div>
    </div>
  );

  if (failed) {
    return (
      <RdCard className="p-4" data-cash>
        {head}
        <p className="text-[13px] mt-3" style={{ color: TONE.amber.fg }}>The cash drawer could not be read: {failed}</p>
        <RdButton size="sm" variant="ghost" className="mt-2" onClick={() => void load()}>Try again</RdButton>
      </RdCard>
    );
  }

  if (summary === null) {
    return (
      <RdCard className="p-4" data-cash>
        {head}
        <p className="text-[13px] mt-3" style={{ color: MUTED }}>The cash count needs migration 0095_operations.sql. Paste it in the Supabase SQL editor.</p>
      </RdCard>
    );
  }

  const line = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-2">
      <span style={{ color: strong ? undefined : SECOND }} className={strong ? 'font-semibold text-white' : ''}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold' : ''} text-white`}>{value}</span>
    </div>
  );

  return (
    // Grows to the rail's height, so its bottom meets the records beside it (2026-10-25); the middle scrolls itself.
    <RdCard className="p-4 flex flex-col min-h-0" style={{ flexGrow: 1 }} data-cash>
      {head}
      <div className="mt-3">
        <DatePicker mode="record" bounds={{ backDays: 7 }} value={day} onChange={(v) => { if (v) { setDay(v); setRedo(false); setTaking(false); } }} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
      {summary === undefined ? (
        <div className="h-24 rounded-lg animate-pulse mt-3" style={{ background: 'rgba(255,255,255,0.04)' }} />
      ) : (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5 text-[13px]" data-drawer-sum>
            {line('Left from the last close', peso(summary.opening))}
            {/* Counter sales (0133) and walk-ins (0185) are cash in too. */}
            {line(`Cash in (${summary.paymentCount} ${summary.paymentCount === 1 ? 'sale or payment' : 'sales and payments'})`, peso(summary.cashIn))}
            {summary.refundsOut > 0 && line('Refunds paid out', `− ${peso(summary.refundsOut)}`)}
            {summary.handedOver > 0 && line('Handed over', `− ${peso(summary.handedOver)}`)}
            {summary.paidOut > 0 && line('Paid out', `− ${peso(summary.paidOut)}`)}
            <div className="pt-2" style={{ borderTop: HAIR }}>
              {line(summary.closed ? 'Should have been in the drawer' : 'Should be in the drawer now', peso(summary.expected), true)}
            </div>
          </div>

          {summary.closed && !redo ? (
            <div className="rounded-xl p-3 text-[13px] space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.07)' }} data-closed>
              {summary.auto ? (
                <>
                  <p className="flex items-center gap-1.5 font-semibold text-white"><Bot size={15} style={{ color: TONE.violet.fg }} />Closed automatically at {peso(summary.counted ?? 0)}</p>
                  <p style={{ color: SECOND }}>Nobody counted the drawer. If someone did, type the real count.</p>
                  <button type="button" className="text-[12.5px] font-semibold mt-1" style={{ color: TONE.amber.fg }} onClick={() => setRedo(true)}>Type the real count</button>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 font-semibold text-white">
                    {summary.difference === 0
                      ? <CheckCircle2 size={15} style={{ color: TONE.violet.fg }} />
                      : <AlertTriangle size={15} style={{ color: TONE.amber.fg }} />}
                    Closed, counted {peso(summary.counted ?? 0)}
                  </p>
                  <p style={{ color: summary.difference === 0 ? SECOND : TONE.amber.fg }}>
                    {summary.difference === 0 ? 'Matched exactly.' : `${(summary.difference ?? 0) > 0 ? 'Over' : 'Short'} by ${peso(Math.abs(summary.difference ?? 0))}`}
                  </p>
                  {summary.note && <p style={{ color: MUTED }}>“{summary.note}”</p>}
                  <p className="text-[12px]" style={{ color: MUTED }}>
                    {summary.closedByName ?? 'Someone'}, {summary.closedAt ? new Date(summary.closedAt).toLocaleString('en-PH', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }) : ''}
                  </p>
                  {Math.abs((summary.counted ?? 0) - summary.expected) > 0.001 && summary.difference === 0 && (
                    <p className="text-[12px]" style={{ color: MUTED }}>Cash moved after the close. Tomorrow starts from it.</p>
                  )}
                  {isAdmin && (
                    <button type="button" className="text-[12.5px] font-semibold mt-1" style={{ color: TONE.amber.fg }} onClick={() => setRedo(true)}>Redo this count</button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2" data-close-form>
              <label className="flex items-center gap-2">
                <span className="text-[13px] w-16" style={{ color: SECOND }}>Counted</span>
                <input value={counted} inputMode="decimal" placeholder="0.00" aria-label="Amount counted"
                  onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ''))}
                  className="h-10 flex-1 min-w-0 rounded-xl px-3 text-[15px] font-semibold text-white text-right tabular-nums outline-none" style={FIELD} />
              </label>
              {diff != null && (
                <p className="text-[12.5px] font-semibold text-right" style={{ color: Math.abs(diff) < 0.001 ? TONE.violet.fg : TONE.amber.fg }}>
                  {Math.abs(diff) < 0.001 ? 'Matches' : `${diff > 0 ? 'Over' : 'Short'} ${peso(Math.abs(diff))}`}
                </p>
              )}
              {needsNote && (
                <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note"
                  placeholder={redo && !summary.auto ? 'Why are you redoing this count?' : 'Why is it different? (required)'}
                  className="h-10 w-full rounded-xl px-3 text-[13px] text-white outline-none" style={FIELD} />
              )}
              <div className="flex gap-2">
                <RdButton size="sm" variant="amber" className="flex-1" disabled={busy || countedNum == null || (needsNote && !note.trim())} onClick={() => void submit()} data-close-day>
                  {busy ? 'Closing…' : redo ? 'Save the count' : isToday ? 'Close the day now' : 'Close the day'}
                </RdButton>
                {redo && <RdButton size="sm" variant="ghost" onClick={() => setRedo(false)}>Cancel</RdButton>}
              </div>
              {isToday && !redo && <p className="text-[12px]" style={{ color: MUTED }}>Count the drawer and type the total to close early. Not closed by midnight, it closes by itself at the amount above.</p>}
            </div>
          )}

          {/* Cash taken out of the drawer (0271): who, how much, when. */}
          <div className="pt-3 space-y-2" style={{ borderTop: HAIR }} data-cash-outs>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-white">Taken out {isToday ? 'today' : 'that day'}</p>
              {isToday && !taking && <RdButton size="sm" variant="ghost" icon={HandCoins} onClick={() => setTaking(true)} data-take-out>Take cash out</RdButton>}
            </div>
            {taking && (
              <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${TONE.amber.line}` }} data-take-out-form>
                <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Why the cash left the drawer">
                  {([['handed_over', 'Handed over'], ['paid_out', 'Paid out']] as const).map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                      className="h-8 rounded-lg text-[12.5px] font-semibold"
                      style={kind === k ? { background: TONE.violet.bg, border: `1px solid ${TONE.violet.line}`, color: 'var(--color-text-primary, #fff)' } : { ...FIELD, color: SECOND }}>{label}</button>
                  ))}
                </div>
                {/* Focus scrolls the form into view inside the card's own scroll (1280 wide, it opens below the fold). */}
                <input autoFocus value={outAmount} inputMode="decimal" placeholder="Amount" aria-label="Amount taken out"
                  onChange={(e) => setOutAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  className="h-10 w-full rounded-xl px-3 text-[15px] font-semibold text-white text-right tabular-nums outline-none" style={FIELD} />
                {kind === 'handed_over' && (
                  <RdSelect label="Taken by" value={takenBy} onChange={setTakenBy} className="w-full">
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.role === 'admin' ? ' (owner)' : ' (desk)'}</option>)}
                  </RdSelect>
                )}
                <input value={outNote} onChange={(e) => setOutNote(e.target.value)} aria-label="Note" maxLength={300}
                  placeholder={kind === 'handed_over' ? 'Note (optional)' : 'What was it spent on? (required)'}
                  className="h-10 w-full rounded-xl px-3 text-[13px] text-white outline-none" style={FIELD} />
                <div className="flex gap-2">
                  <RdButton size="sm" variant="amber" className="flex-1" disabled={busy || !outReady} onClick={() => void takeOut()}>
                    {busy ? 'Saving…' : 'Record it'}
                  </RdButton>
                  <RdButton size="sm" variant="ghost" onClick={() => setTaking(false)}>Cancel</RdButton>
                </div>
              </div>
            )}
            {outs.length === 0 && !taking && (
              <p className="text-[12.5px]" style={{ color: MUTED }}>Nothing. When the owner collects cash or something is bought from the drawer, record it here so the count matches.</p>
            )}
            {outs.map((o) => (
              <div key={o.id} className="text-[12.5px] flex items-start justify-between gap-2" style={{ opacity: o.voided_at ? 0.55 : 1 }}>
                <div className="min-w-0">
                  <p className="text-white" style={{ textDecoration: o.voided_at ? 'line-through' : undefined }}>
                    {o.kind === 'handed_over' ? `Handed to ${o.takenByName ?? 'someone'}` : `Paid out: ${o.note ?? ''}`}
                  </p>
                  <p style={{ color: MUTED }}>
                    {time(o.created_at)}{o.recordedByName ? `, by ${o.recordedByName}` : ''}
                    {o.kind === 'handed_over' && o.note ? `. ${o.note}` : ''}
                    {o.voided_at ? `. Undone: ${o.void_reason ?? ''}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="tabular-nums font-semibold text-white">− {peso(o.amount)}</p>
                  {isAdmin && !o.voided_at && (
                    <button type="button" className="text-[12px] font-semibold" style={{ color: TONE.amber.fg }} onClick={() => setToUndo(o)}>Undo</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      <div className="pt-3 mt-3" style={{ borderTop: HAIR }}>
          <p className="text-[12.5px] font-medium mb-1.5" style={{ color: MUTED }}>Recent closes</p>
          {history.length === 0 && <p className="text-[12.5px]" style={{ color: MUTED }}>None yet. Each closed day shows here, with any difference.</p>}
          <div className="space-y-1 max-h-[132px] overflow-y-auto">
            {history.map((h) => (
              <button type="button" key={h.day} onClick={() => setDay(h.day)} className="w-full flex items-center justify-between gap-2 text-[12.5px] px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.04]"
                style={{ background: h.day === day ? TONE.violet.bg : 'transparent' }}>
                <span className="text-white">{new Date(`${h.day}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="tabular-nums font-semibold" style={{ color: h.auto || h.difference === 0 ? MUTED : TONE.amber.fg }}>
                  {h.auto ? 'not counted' : h.difference === 0 ? 'exact' : `${h.difference > 0 ? '+' : '−'}${peso(Math.abs(h.difference))}`}{h.previous ? ' (redone)' : ''}
                </span>
              </button>
            ))}
          </div>
      </div>

      <ConfirmDialog
        isOpen={!!toUndo}
        onClose={() => setToUndo(null)}
        onConfirm={(reason) => void undo(reason)}
        title="Undo cash taken out"
        message={toUndo ? `${peso(toUndo.amount)} ${toUndo.kind === 'handed_over' ? `handed to ${toUndo.takenByName ?? 'someone'}` : 'paid out'}. The drawer will count it again. It stays in the history, marked undone.` : ''}
        confirmText="Undo it"
        type="danger"
        reason={{ label: 'Why', placeholder: 'e.g. Recorded twice', required: true }}
      />
    </RdCard>
  );
}
