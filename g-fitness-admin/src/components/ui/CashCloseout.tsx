import { useCallback, useEffect, useState } from 'react';
import { Wallet, CheckCircle2, AlertTriangle, HandCoins, Bot, Check, ShoppingBag, Undo2, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { RdCard, RdButton } from './rd';
import { TONE } from './rdTokens';
import ConfirmDialog from './ConfirmDialog';
import { showToast } from '../../utils/toast';
import { addDays, daysBetween, todayKey } from '../../utils/dates';
import SideWindow from './SideWindow';
import PageGuide from '../guides/PageGuide';
import { supabase } from '../../lib/supabaseClient';
import {
  autoCloseDays, cashDay, closeCashDay, closeoutsBetween, drawerPeople, listCashOuts, recentCloseouts, recordCashOut, voidCashOut,
  type CashDay, type CashOut, type CashOutKind, type Closeout,
} from '../../lib/api/cash';

// A drawer can be below zero when more was handed over than came in: said as −₱1,660.00, never ₱-1,660.00.
const peso = (n: number) => `${n < 0 ? '−' : ''}₱${Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const SECOND = 'var(--color-text-secondary)';
const MUTED = 'var(--color-text-muted)';
const HAIR = '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.08)';
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
  /** The "Take cash out" form, in its own floating page, today only. */
  const [kind, setKind] = useState<CashOutKind>('handed_over');
  const [outAmount, setOutAmount] = useState('');
  const [outNote, setOutNote] = useState('');
  const [takenBy, setTakenBy] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [toUndo, setToUndo] = useState<CashOut | null>(null);
  const [swept, setSwept] = useState(false);
  /** The drawer's one floating page (owner, 2026-11-28). */
  const [open, setOpen] = useState(false);
  /** The page's two tabs (owner, 2026-11-28): each fits the window with its button in view. */
  const [dTab, setDTab] = useState<'count' | 'outs'>('count');
  /** The month the floating page's calendar shows ('YYYY-MM'), and its closes (owner, 2026-11-28). */
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [monthCloses, setMonthCloses] = useState<Closeout[]>([]);
  const [monthFailed, setMonthFailed] = useState(false);
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

  // One month of closes for the calendar; re-read when the month changes or a close lands (history reloads).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const [y, m] = month.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      try {
        const c = await closeoutsBetween(`${month}-01`, `${month}-${String(last).padStart(2, '0')}`);
        if (alive) { setMonthCloses(c); setMonthFailed(false); }
      } catch {
        if (alive) setMonthFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [open, month, history]);

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
      setOutAmount(''); setOutNote('');
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

  const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' });
  const live = outs.filter((o) => !o.voided_at);
  const outTotal = live.reduce((s, o) => s + o.amount, 0);
  const pickDay = (d: string) => { setDay(d); setRedo(false); setCounted(''); setNote(''); };
  // The last seven days, oldest first, each with how it closed (owner, 2026-11-28: one drawer, one calendar).
  const today = todayKey();
  const dayOf = (d: string, list: Closeout[]): WeekDay => {
    const h = list.find((x) => x.day === d);
    const state: DayState = h ? (h.auto ? 'auto' : h.difference === 0 ? 'exact' : 'off')
      : d === today ? 'open' : 'none';
    const word = h ? (h.auto ? 'not counted' : h.difference === 0 ? 'matched' : `${h.difference > 0 ? 'over' : 'short'} ${peso(Math.abs(h.difference))}`)
      : d === today ? 'not closed yet' : 'no close';
    return { day: d, state, word: `${word}${h?.previous ? ' (redone)' : ''}` };
  };
  const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => dayOf(d, history));
  const monthDays = (() => {
    const [y, m] = month.split('-').map(Number);
    const lead = new Date(y, m - 1, 1).getDay();
    const count = new Date(y, m, 0).getDate();
    const all = [...monthCloses, ...history];
    return [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => dayOf(`${month}-${String(i + 1).padStart(2, '0')}`, all))];
  })();
  /** Past the automatic close's reach (the last 7 days), a day is looked at, never counted or redone. */
  const readOnly = daysBetween(day, today) > 7;
  const status = !summary ? 'Reading the drawer'
    : !summary.closed ? (isToday ? 'Not closed yet' : 'Not closed')
    : summary.auto ? 'Closed automatically, nobody counted'
    : summary.difference === 0 ? 'Closed, the count matched'
    : `Closed, ${(summary.difference ?? 0) > 0 ? 'over' : 'short'} by ${peso(Math.abs(summary.difference ?? 0))}`;
  const statusTone = !summary || summary.auto || summary.difference === 0 ? SECOND : TONE.amber.fg;
  const whenWord = isToday ? `Today, ${dayLabel(day)}` : dayLabel(day);

  return (
    // Grows to the rail's height, so its bottom meets the records beside it (2026-10-25).
    // One drawer, one button, one floating page (owner, 2026-11-28: three buttons for one day confused the desk).
    <RdCard className="p-4 flex flex-col min-h-0 gap-3" style={{ flexGrow: 1 }} data-cash>
      <div className="flex items-center gap-2">
        <Wallet size={18} style={{ color: TONE.amber.fg }} />
        <h3 className="text-[15px] font-semibold text-white flex-1">The drawer</h3>
        {/* Money: the steps are one tap away, on the card and in its page (owner, 2026-11-28). */}
        <PageGuide id="cash-drawer" label="How it works" />
      </div>

      <div data-drawer-hero>
        <p className="text-[13px] font-semibold flex items-center gap-2" style={{ color: isToday ? 'var(--color-text-primary)' : TONE.amber.fg }}>
          <span data-drawer-day>{whenWord}</span>
          {!isToday && (
            <button type="button" className="text-[12.5px] font-semibold ml-auto" style={{ color: TONE.amber.fg }} onClick={() => pickDay(today)} data-back-today>Back to today</button>
          )}
        </p>
        <p className="text-[12.5px] mt-2" style={{ color: SECOND }}>{summary?.closed ? 'Should have been in the drawer' : 'Should be in the drawer now'}</p>
        <p className="text-[28px] font-bold tabular-nums text-white leading-tight">{summary ? peso(summary.expected) : '…'}</p>
        <p className="text-[12.5px] mt-1 flex items-center gap-1.5" style={{ color: statusTone }} data-drawer-status>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusTone }} />{status}
        </p>
      </div>

      {/* Where the number comes from, so nobody has to open anything to trust it. */}
      {summary && (
        <div className="space-y-1.5 text-[12.5px] pt-3" style={{ borderTop: HAIR }} data-drawer-parts>
          {line('Left from the last close', peso(summary.opening))}
          {line('Cash in', `+ ${peso(summary.cashIn)}`)}
          {line(`Taken out ${isToday ? 'today' : 'that day'}`, `− ${peso(summary.refundsOut + summary.handedOver + summary.paidOut)}`)}
        </div>
      )}

      <div className="pt-3" style={{ borderTop: HAIR }}>
        <p className="text-[12.5px] font-medium mb-2" style={{ color: MUTED }}>Last 7 days</p>
        <WeekStrip week={week} picked={day} onPick={pickDay} />
        {/* What the colours mean, said once, so a new desk person can read the strip. */}
        <DayKey />
      </div>

      <div className="mt-auto grid gap-2">
        <RdButton size="md" variant={summary && !summary.closed ? 'primary' : 'secondary'} className="w-full" onClick={() => { setMonth(day.slice(0, 7)); setOpen(true); }} data-open-drawer>
          {summary && !summary.closed ? 'Count the drawer' : 'Open the drawer'}
        </RdButton>
      </div>

      {open && (
        <SideWindow label="End of day" size="wide" data-drawer-window onClose={() => setOpen(false)}
          // The side is fixed text of a fixed length (owner, 2026-11-28: nothing pushes the mascot). The day is on the calendar and in its line.
          title="End of day"
          blurb="The system counts the drawer. Closes by itself at midnight."
          figure={{ n: summary ? peso(summary.expected).replace(/\.00$/, '') : '…', word: 'in the drawer' }}
          facts={[
            { icon: <HandCoins size={14} />, text: 'Cash taken or spent goes under Taken out.' },
            { icon: <Undo2 size={14} />, text: 'Only the owner can redo or undo.' },
          ]}
          say={`${isToday ? 'Today' : dayLabel(day)}: ${(status === 'Closed automatically, nobody counted' ? 'not counted' : status).replace(/^Closed, the count /, '').toLowerCase()}.`}
          art="/images/admin-art/mascot-coin.webp">
          {/* The calendar on the left, the day's work on the right in two tabs: nothing below the fold. */}
          <div className="att" style={{ height: '100%', overflow: 'hidden', padding: 0, gap: 0, display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) minmax(0, 1fr)', columnGap: 32 }} data-drawer-body>
            <div className="min-h-0">
              <MonthCalendar month={month} days={monthDays} picked={day} today={today} failed={monthFailed}
                onPick={pickDay} onMonth={setMonth} />
              <DayKey />
              {!monthFailed && <MonthSummary closes={monthCloses.filter((c) => c.day.startsWith(month))} />}
            </div>
            <div className="flex flex-col min-h-0">
              <div className="flex items-center gap-3" style={{ marginRight: 40, minHeight: 32 }}>
                <nav className="a-tabs" role="tablist" aria-label="The day's drawer" style={{ marginLeft: 0 }} data-drawer-tabs>
                  <button type="button" role="tab" aria-selected={dTab === 'count'} className={dTab === 'count' ? 'on' : ''} onClick={() => setDTab('count')} data-tab="count">Count and close</button>
                  <button type="button" role="tab" aria-selected={dTab === 'outs'} className={dTab === 'outs' ? 'on' : ''} onClick={() => setDTab('outs')} data-tab="outs">
                    Taken out{live.length > 0 && <em>{live.length}</em>}
                  </button>
                </nav>
                <p className="text-[13px] font-semibold ml-auto" style={{ color: isToday ? 'var(--color-text-primary)' : TONE.amber.fg }}>{whenWord}</p>
                <PageGuide id="cash-drawer" label="How it works" />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ marginTop: 18, paddingRight: 4 }} role="tabpanel">
            {dTab === 'count' ? (<div data-tab-count>
            {summary === undefined ? (
              <div className="h-24 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ) : (
              <div className="space-y-3">
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
                        {!readOnly && <button type="button" className="text-[12.5px] font-semibold mt-1" style={{ color: TONE.amber.fg }} onClick={() => setRedo(true)}>Type the real count</button>}
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
                        {isAdmin && !readOnly && (
                          <button type="button" className="text-[12.5px] font-semibold mt-1" style={{ color: TONE.amber.fg }} onClick={() => setRedo(true)}>Redo this count</button>
                        )}
                      </>
                    )}
                  </div>
                ) : readOnly ? (
                  <p className="rounded-xl p-3 text-[13px] flex items-start gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgb(var(--hair-rgb, 255 255 255) / 0.07)', color: SECOND }} data-read-only>
                    <Lock size={14} className="mt-0.5 flex-shrink-0" />Nobody closed this day, and it is past the last 7 days, so it can only be looked at. A count this late cannot be checked against the drawer.
                  </p>
                ) : (
                  <div className="space-y-2" data-close-form>
                    <label className="a-input big"><span style={{ fontWeight: 700 }}>₱</span>
                      <input value={counted} inputMode="decimal" placeholder="Counted, e.g. 8245" aria-label="Amount counted"
                        onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ''))} style={{ fontWeight: 700 }} /></label>
                    {diff != null && (
                      <p className="text-[12.5px] font-semibold" style={{ color: Math.abs(diff) < 0.001 ? TONE.violet.fg : TONE.amber.fg }}>
                        {Math.abs(diff) < 0.001 ? 'Matches' : `${diff > 0 ? 'Over' : 'Short'} ${peso(Math.abs(diff))}`}
                      </p>
                    )}
                    {needsNote && (
                      <label className="a-input" style={{ fontSize: 13 }}>
                        <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note"
                          placeholder={redo && !summary.auto ? 'Why are you redoing this count?' : 'Why is it different? (required)'} /></label>
                    )}
                    <div className="flex gap-2">
                      <button type="button" className="a-btn amber flex-1" disabled={busy || countedNum == null || (needsNote && !note.trim())} onClick={() => void submit()} data-close-day>
                        <Check size={15} />{busy ? 'Closing…' : redo ? 'Save the count' : isToday ? 'Close the day now' : 'Close the day'}
                      </button>
                      {redo && <button type="button" className="a-btn" onClick={() => setRedo(false)}>Cancel</button>}
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>) : (<div data-tab-outs>
            {/* Cash taken out of the drawer (0271): who, how much, when. */}
            <div className="a-lbl" style={{ margin: '0 0 8px', display: 'flex', justifyContent: 'space-between' }} data-cash-outs-head>
              <span>Taken out {isToday ? 'today' : 'that day'}</span>
              {live.length > 0 && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{live.length} {live.length === 1 ? 'time' : 'times'}, − {peso(outTotal)}</span>}
            </div>
            {/* What the tab is for, before anything is typed (owner, 2026-11-28). */}
            <p className="text-[12.5px] mb-3" style={{ color: SECOND }} data-outs-help>
              Any cash that leaves the drawer during the day goes here, so the count at closing still matches. Payments and sales are counted by themselves; only money going out is recorded here.
            </p>
            <div data-cash-outs>
              {isToday && (
                <div data-take-out-form>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Why the cash left the drawer">
                    {([['handed_over', 'Handed over', HandCoins, 'Someone took it'], ['paid_out', 'Paid out', ShoppingBag, 'Bought from it']] as const).map(([k, label, Icon, sub]) => (
                      <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                        className={`a-opt ${kind === k ? 'on' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                        <Icon size={16} />
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}><b style={{ fontSize: 12.5 }} className="block">{label}</b><div className="a-sub">{sub}</div></div>
                        {kind === k && <span className="tick" style={{ position: 'static' }}><Check size={12} /></span>}
                      </button>
                    ))}
                  </div>
                  {/* What each choice means, said where it is picked (owner, 2026-11-28: money, so nobody guesses). */}
                  <p className="text-[12.5px] mt-2 flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: 'rgb(var(--hair-rgb, 255 255 255) / 0.04)', color: SECOND }} data-kind-help>
                    {kind === 'handed_over' ? <HandCoins size={14} className="mt-0.5 flex-shrink-0" /> : <ShoppingBag size={14} className="mt-0.5 flex-shrink-0" />}
                    <span>{kind === 'handed_over'
                      ? 'Someone took cash out of the drawer to keep or bring somewhere, like the owner collecting at closing. Type the amount and pick who took it.'
                      : 'Drawer cash was spent on something for the gym, like drinking water or cleaning supplies. Type what it cost and write what was bought.'}</span>
                  </p>
                  <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: kind === 'handed_over' ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
                    <label className="a-input"><span style={{ fontWeight: 700 }}>₱</span>
                      <input value={outAmount} inputMode="decimal" placeholder="Amount" aria-label="Amount taken out"
                        onChange={(e) => setOutAmount(e.target.value.replace(/[^\d.]/g, ''))} style={{ fontWeight: 700 }} /></label>
                    {kind === 'handed_over' && (
                      <label className="a-input" style={{ fontSize: 13 }}><HandCoins size={14} />
                        <select value={takenBy} onChange={(e) => setTakenBy(e.target.value)} aria-label="Taken by"
                          style={{ background: 'transparent', border: 0, outline: 'none', flex: 1, minWidth: 0, color: 'inherit' }}>
                          {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.role === 'admin' ? ' (owner)' : ' (desk)'}</option>)}
                        </select></label>
                    )}
                  </div>
                  <label className="a-input mt-2" style={{ fontSize: 13 }}>
                    <input value={outNote} onChange={(e) => setOutNote(e.target.value)} aria-label="Note" maxLength={300}
                      placeholder={kind === 'handed_over' ? 'Note (optional), e.g. Morning pickup' : 'What was it for? (required)'} /></label>
                  <button type="button" className="a-btn w-full" style={{ marginTop: 8 }} disabled={busy || !outReady} onClick={() => void takeOut()} data-take-out>
                    <HandCoins size={15} />{busy ? 'Saving…' : outNum && outNum > 0
                      ? `Record ${peso(outNum)} ${kind === 'handed_over' ? `handed to ${people.find((p) => p.id === takenBy)?.name ?? 'someone'}` : 'paid out'}`
                      : 'Record cash taken out'}
                  </button>
                </div>
              )}
              {outs.length === 0 && (
                <p className="a-sub" style={{ padding: '10px 0' }}>{isToday ? 'Nothing yet. When the owner collects cash or something is bought from the drawer, record it so the count matches.' : 'Nothing was taken out that day.'}</p>
              )}
              {outs.map((o) => (
                <div key={o.id} className="pr-row" style={{ opacity: o.voided_at ? 0.55 : 1, padding: '12px 2px' }}>
                  <span className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0" style={{ background: 'rgb(var(--hair-rgb, 255 255 255) / 0.06)' }}>
                    {o.kind === 'handed_over' ? <HandCoins size={15} /> : <ShoppingBag size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)', textDecoration: o.voided_at ? 'line-through' : undefined }}>
                      {o.kind === 'handed_over' ? `Handed to ${o.takenByName ?? 'someone'}` : `Paid out: ${o.note ?? ''}`}
                    </p>
                    <p className="a-sub">
                      {time(o.created_at)}{o.recordedByName ? `, by ${o.recordedByName}` : ''}
                      {o.kind === 'handed_over' && o.note ? `. ${o.note}` : ''}
                      {o.voided_at ? `. Undone: ${o.void_reason ?? ''}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="tabular-nums font-semibold text-[13px]" style={{ color: 'var(--color-text-primary)' }}>− {peso(o.amount)}</p>
                    {isAdmin && !o.voided_at && (
                      <button type="button" className="text-[12px] font-semibold" style={{ color: TONE.amber.fg }} onClick={() => setToUndo(o)}>Undo</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </div>)}
              </div>
            </div>
          </div>
        </SideWindow>
      )}

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

type DayState = 'exact' | 'off' | 'auto' | 'open' | 'none';
const STATE_FILL: Record<DayState, string> = {
  exact: TONE.violet.bg, off: TONE.amber.bg, auto: 'rgb(var(--hair-rgb, 255 255 255) / 0.05)', open: 'transparent', none: 'transparent',
};
const STATE_INK: Record<DayState, string> = { exact: TONE.violet.fg, off: TONE.amber.fg, auto: MUTED, open: 'var(--color-text-primary)', none: MUTED };
const dayBorder = (state: DayState, on: boolean) => on ? '1.5px solid var(--color-text-primary)'
  : state === 'open' || state === 'none' ? '1px dashed rgb(var(--hair-rgb, 255 255 255) / 0.22)' : '1px solid transparent';

/** What the day colours mean, said once, so a new desk person can read the strip and the month. */
function DayKey() {
  return (
    <div className="flex justify-between mt-2 text-[12px] whitespace-nowrap" style={{ color: MUTED }} data-week-key>
      <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: TONE.violet.fg }} />Matched</span>
      <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: TONE.amber.fg }} />Short/over</span>
      <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgb(var(--hair-rgb, 255 255 255) / 0.25)' }} />Not counted</span>
      <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ border: '1px dashed rgb(var(--hair-rgb, 255 255 255) / 0.4)' }} />Open</span>
    </div>
  );
}

/** The month in three numbers, straight from its saved closes (owner, 2026-11-28). Days nobody closed are left out:
 *  a day before the gym started looks the same, and counting it would accuse the desk of nothing. */
function MonthSummary({ closes }: { closes: Closeout[] }) {
  const matched = closes.filter((c) => !c.auto && c.difference === 0).length;
  const off = closes.filter((c) => !c.auto && c.difference !== 0);
  const net = off.reduce((s, c) => s + c.difference, 0);
  const auto = closes.filter((c) => c.auto).length;
  const row = (dot: string, label: string, n: number, extra?: string) => (
    <div className="flex items-center gap-2 py-2" style={{ borderTop: HAIR }}>
      <i className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: dot }} />
      <span className="flex-1 text-[13px]" style={{ color: SECOND }}>{label}</span>
      {extra && <span className="text-[12.5px] tabular-nums" style={{ color: TONE.amber.fg }}>{extra}</span>}
      <b className="text-[14px] tabular-nums w-8 text-right" style={{ color: 'var(--color-text-primary)' }}>{n}</b>
    </div>
  );
  return (
    <div className="mt-5" data-month-summary>
      <p className="text-[12.5px] font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>This month</p>
      {closes.length === 0 ? (
        <p className="text-[12.5px] py-2" style={{ color: MUTED, borderTop: HAIR }}>No day was closed this month.</p>
      ) : (
        <>
          {row(TONE.violet.fg, 'Days the count matched', matched)}
          {row(TONE.amber.fg, 'Days short or over', off.length, off.length ? `net ${net > 0 ? '+' : net < 0 ? '−' : ''}${peso(Math.abs(net))}` : undefined)}
          {row('rgb(var(--hair-rgb, 255 255 255) / 0.25)', 'Days nobody counted', auto)}
        </>
      )}
    </div>
  );
}

/** A month of the drawer: ‹ › to move, each day coloured by how it closed, days to come not pickable. */
function MonthCalendar({ month, days, picked, today, failed, onPick, onMonth }: {
  month: string; days: (WeekDay | null)[]; picked: string; today: string; failed: boolean;
  onPick: (day: string) => void; onMonth: (month: string) => void;
}) {
  const [y, m] = month.split('-').map(Number);
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1); onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const atNow = month >= today.slice(0, 7);
  const navBtn = 'w-8 h-8 rounded-lg grid place-items-center hover:bg-white/[0.06] disabled:opacity-35 disabled:cursor-not-allowed';
  return (
    <div data-month>
      <div className="flex items-center gap-2 mb-2" style={{ marginRight: 40 }}>
        <p className="text-[14px] font-semibold flex-1" style={{ color: 'var(--color-text-primary)' }} data-month-title>
          {new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
        </p>
        <button type="button" className={navBtn} style={{ border: HAIR, color: SECOND }} onClick={() => shift(-1)} aria-label="Month before" data-month-prev><ChevronLeft size={15} /></button>
        <button type="button" className={navBtn} style={{ border: HAIR, color: SECOND }} onClick={() => shift(1)} disabled={atNow} aria-label="Next month" data-month-next><ChevronRight size={15} /></button>
      </div>
      {failed && <p className="text-[12.5px] mb-2" style={{ color: TONE.amber.fg }}>This month's closes could not be read. The colours may be missing.</p>}
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }} role="radiogroup" aria-label="Pick a day">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => <span key={w} className="text-[12px] text-center pb-1" style={{ color: MUTED }}>{w}</span>)}
        {days.map((w, i) => {
          if (!w) return <span key={`b${i}`} />;
          const future = w.day > today;
          const on = w.day === picked;
          const d = new Date(`${w.day}T00:00:00`);
          return (
            <button key={w.day} type="button" role="radio" aria-checked={on} disabled={future} onClick={() => onPick(w.day)}
              aria-label={`${d.toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' })}: ${future ? 'still to come' : w.word}`}
              data-tip={future ? undefined : w.word} data-month-day={w.day} data-state={future ? 'future' : w.state}
              className="h-9 rounded-lg grid place-items-center text-[13px] font-semibold tabular-nums disabled:cursor-default"
              style={future ? { color: MUTED, opacity: 0.4 } : { background: STATE_FILL[w.state], color: STATE_INK[w.state], border: dayBorder(w.state, on) }}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
type WeekDay = { day: string; state: DayState; word: string };

/** The last seven days as squares, coloured by how each closed; the picked one is outlined. The rail's way to change day. */
function WeekStrip({ week, picked, onPick }: { week: WeekDay[]; picked: string; onPick: (day: string) => void }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }} role="radiogroup" aria-label="Pick a day" data-week>
      {week.map((w) => {
        const d = new Date(`${w.day}T00:00:00`);
        const on = w.day === picked;
        return (
          <button key={w.day} type="button" role="radio" aria-checked={on} onClick={() => onPick(w.day)}
            aria-label={`${d.toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' })}: ${w.word}`} data-tip={w.word} data-week-day={w.day} data-state={w.state}
            className="rounded-lg py-1.5 grid place-items-center gap-0.5"
            style={{ background: STATE_FILL[w.state], border: dayBorder(w.state, on) }}>
            <span className="text-[12px]" style={{ color: MUTED }}>{d.toLocaleDateString('en-PH', { weekday: 'short' })}</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: STATE_INK[w.state] }}>{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}
