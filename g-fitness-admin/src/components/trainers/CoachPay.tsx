import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, Check, HandCoins, Lock, Undo2 } from 'lucide-react';
import { showToast } from '../../utils/toast';
import { todayKey } from '../../utils/dates';
import { getGymContext } from '../../lib/gymContext';
import {
  behindOnDues, coachDues, coachEarnings, DUES_METHODS, getHouseRules, recordDues, settleCut, undoDues, unsettleCut,
  type DuesMethod, type DuesMonth, type EarningsMonth, type HouseRules,
} from '../../lib/api/coachingRules';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const monthLabel = (m: string) => new Date(`${m}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

/**
 * Trainers → Coach pay (0235): the gym's share of what members paid each coach
 * directly, and each coach's dues — the two money rules the owner set in
 * Setup → How coaching works / Settings → Personal training. The desk marks a month's share paid and records
 * dues; only the owner can undo either. A rule that is off says so and where to
 * switch it on, rather than showing an empty table.
 */
export default function CoachPay() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<HouseRules | null | undefined>(undefined);
  const [earn, setEarn] = useState<EarningsMonth[] | null>(null);
  const [dues, setDues] = useState<DuesMonth[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [earnMonth, setEarnMonth] = useState<string | null>(null);
  const [duesMonth, setDuesMonth] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The coach whose dues are being recorded, and the form's values.
  const [recording, setRecording] = useState<{ trainerId: string; amount: string; method: DuesMethod } | null>(null);
  const thisMonth = `${todayKey().slice(0, 7)}-01`;

  const load = useCallback(async () => {
    setFailed(null);
    const [r, ctx] = await Promise.all([getHouseRules(), getGymContext()]);
    setRules(r);
    setIsOwner(ctx?.role === 'admin');
    if (!r) return;
    try {
      const [e, d] = await Promise.all([r.cutOn ? coachEarnings(6) : Promise.resolve([]), r.duesOn ? coachDues(12) : Promise.resolve([])]);
      setEarn(e); setDues(d);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Coach pay could not be loaded.');
    }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const earnMonths = useMemo(() => [...new Set((earn ?? []).map((x) => x.month))].sort().reverse(), [earn]);
  const duesMonths = useMemo(() => [...new Set((dues ?? []).map((x) => x.month))].sort().reverse(), [dues]);
  const em = earnMonth ?? earnMonths[0] ?? null;
  const dm = duesMonth ?? duesMonths[0] ?? null;
  const behind = useMemo(() => new Map(behindOnDues(dues ?? [], thisMonth).map((b) => [b.trainerId, b.months])), [dues, thisMonth]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); showToast(ok, 'success'); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That did not go through', 'error'); }
    finally { setBusy(null); }
  };

  if (rules === undefined) return <div className="a-card"><p className="a-sub">Loading coach pay…</p></div>;
  if (rules === null) {
    return <div className="a-card" data-coach-pay-missing><p className="a-sub">Coach pay is not available yet — the database update for it has not been added.</p></div>;
  }

  const off = (what: string, why: string) => (
    <div className="flex flex-col items-start gap-2" style={{ padding: '6px 0' }} data-rule-off>
      <p className="a-sub inline-flex items-start gap-1.5"><Lock size={13} className="mt-0.5 flex-none" />{why}</p>
      <button type="button" className="a-btn sm" onClick={() => navigate('/settings?tab=coaching')}>Switch on {what} in Settings → Personal training</button>
    </div>
  );
  const months = (list: string[], value: string | null, set: (m: string) => void, name: string) => (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={name}>
      {list.map((m) => (
        <button key={m} type="button" role="tab" aria-selected={m === value} onClick={() => set(m)}
          className={`a-chip ${m === value ? 'v' : ''}`}>{monthLabel(m)}</button>
      ))}
    </div>
  );

  const earnRows = (earn ?? []).filter((x) => x.month === em);
  const duesRows = (dues ?? []).filter((x) => x.month === dm);

  return (
    <div className="a-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', alignItems: 'start' }} data-coach-pay>
      {failed && <div className="a-card" style={{ gridColumn: '1 / -1' }} role="alert"><p className="a-sub">{failed}</p></div>}

      <section className="a-card" data-coach-share>
        <div className="a-ct">
          <h3><HandCoins size={15} />The gym&rsquo;s share</h3>
          {rules.cutOn && <small>{rules.cutPercent}% of what members paid each coach</small>}
        </div>
        {!rules.cutOn ? off('the share', 'Off — your coaches keep all of what members pay them.') : (
          <>
            {months(earnMonths, em, setEarnMonth, 'Share month')}
            <table className="a-table" style={{ marginTop: 10 }}>
              <thead><tr><th>Coach</th><th>Packages</th><th>Paid to coach</th><th>Gym&rsquo;s share</th><th /></tr></thead>
              <tbody>
                {earnRows.map((r) => (
                  <tr key={r.trainerId} data-share-row={r.trainerId}>
                    <td>{r.trainerName}</td>
                    <td>{r.packages}</td>
                    <td>{peso(r.paidTotal)}</td>
                    <td><b>{peso(r.owed)}</b>{r.settled && r.percent !== rules.cutPercent && <span className="a-sub"> at {r.percent}%</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.settled ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="a-pill v"><Check size={11} />Paid to the gym</span>
                          {isOwner && <button type="button" className="a-btn sm" disabled={busy === `u${r.trainerId}`} aria-label={`Undo ${r.trainerName}'s share for ${monthLabel(r.month)}`}
                            onClick={() => void act(`u${r.trainerId}`, () => unsettleCut(r.trainerId, r.month), 'Marked not paid')}><Undo2 size={13} /></button>}
                        </span>
                      ) : r.owed > 0 ? (
                        <button type="button" className="a-btn sm violet" disabled={busy === `s${r.trainerId}`}
                          onClick={() => void act(`s${r.trainerId}`, () => settleCut(r.trainerId, r.month), `${r.trainerName.split(' ')[0]}'s share marked paid`)}>Mark paid</button>
                      ) : <span className="a-sub">nothing owed</span>}
                    </td>
                  </tr>
                ))}
                {earnRows.length === 0 && <tr><td colSpan={5}><span className="a-sub">No active coaches.</span></td></tr>}
              </tbody>
            </table>
            <p className="a-sub" style={{ marginTop: 10 }}>Counted from coaching packages your coaches marked Received. Single 1-on-1 sessions record no price, so they are not counted.</p>
          </>
        )}
      </section>

      <section className="a-card" data-coach-dues>
        <div className="a-ct">
          <h3><Banknote size={15} />Coach dues</h3>
          {rules.duesOn && <small>{peso(rules.duesAmount)} a month{rules.duesSince ? ` since ${monthLabel(rules.duesSince)}` : ''}</small>}
        </div>
        {!rules.duesOn ? off('coach dues', 'Off — coaches pay the gym nothing to train here.') : (
          <>
            {months(duesMonths, dm, setDuesMonth, 'Dues month')}
            <table className="a-table" style={{ marginTop: 10 }}>
              <thead><tr><th>Coach</th><th>Due</th><th>Paid</th><th /></tr></thead>
              <tbody>
                {duesRows.map((r) => {
                  const late = behind.get(r.trainerId) ?? 0;
                  const open = recording?.trainerId === r.trainerId;
                  return (
                    <tr key={r.trainerId} data-dues-row={r.trainerId}>
                      <td>
                        {r.trainerName}
                        {late > 0 && <span className="a-pill a" style={{ marginLeft: 6 }} data-dues-behind>Behind · {late} month{late === 1 ? '' : 's'}</span>}
                      </td>
                      <td>{peso(r.due)}</td>
                      <td>{r.paid != null ? <>{peso(r.paid)} <span className="a-sub">· {DUES_METHODS.find((x) => x.key === r.method)?.label ?? r.method}</span></> : <span className="a-sub">not yet</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        {r.paid != null ? (
                          isOwner ? <button type="button" className="a-btn sm" disabled={busy === `d${r.trainerId}`} aria-label={`Undo ${r.trainerName}'s dues for ${monthLabel(r.month)}`}
                            onClick={() => void act(`d${r.trainerId}`, () => undoDues(r.trainerId, r.month), 'Payment removed')}><Undo2 size={13} /></button> : null
                        ) : open ? (
                          <span className="inline-flex items-center gap-1.5" data-dues-form>
                            <input className="a-input" style={{ width: 84 }} inputMode="decimal" aria-label="Amount paid" value={recording.amount}
                              onChange={(e) => setRecording({ ...recording, amount: e.target.value.replace(/[^0-9.]/g, '') })} />
                            <select className="a-input" aria-label="How it was paid" value={recording.method}
                              onChange={(e) => setRecording({ ...recording, method: e.target.value as DuesMethod })}>
                              {DUES_METHODS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                            </select>
                            <button type="button" className="a-btn sm violet" disabled={busy === `r${r.trainerId}` || !(Number(recording.amount) > 0)}
                              onClick={() => void act(`r${r.trainerId}`, async () => { await recordDues(r.trainerId, r.month, Number(recording.amount), recording.method); setRecording(null); }, 'Dues recorded')}>Save</button>
                            <button type="button" className="a-btn sm" onClick={() => setRecording(null)}>Cancel</button>
                          </span>
                        ) : (
                          <button type="button" className="a-btn sm" onClick={() => setRecording({ trainerId: r.trainerId, amount: String(r.due), method: 'cash' })}>Record</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {duesRows.length === 0 && <tr><td colSpan={4}><span className="a-sub">No active coaches.</span></td></tr>}
              </tbody>
            </table>
            <p className="a-sub" style={{ marginTop: 10 }}>Behind means a month before this one is unpaid. A coach behind still checks in and coaches.</p>
          </>
        )}
      </section>
    </div>
  );
}
