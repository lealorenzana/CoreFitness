import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Handshake, Inbox } from 'lucide-react';
import { Av } from './attendance/parts';
import './attendance/att.css';
import Bookings from './Bookings';
import Coaching from './Coaching';
import { showToast } from '../utils/toast';
import { supabase } from '../lib/supabaseClient';
import { setPtSessionStatus } from '../lib/api/ptSessions';
import { sweepStaleRequests } from '../lib/api/bookings';
import { notifyUser } from '../lib/api/notify';
import { loadBookingQueue, type QueueRow } from '../services/bookingQueueService';
import { coachingSweep, confirmCoachingPayment, listCoachings, type CoachingRow } from '../lib/api/coaching';
import { listMembers } from '../lib/api/members';
import { listTrainers } from '../lib/api/trainers';
import { useGymModules, moduleOn } from '../hooks/useGymModules';
import { useTour } from '../components/tour/Tour';
import { tourFor } from '../lib/tours';

type Tab = 'decide' | 'sessions' | 'packages';
type Mode = 'instant' | 'coach' | 'desk' | 'coach_desk' | 'off';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const when = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : 'Time to be set');
const waited = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'asked today' : days === 1 ? 'waiting 1 day' : `waiting ${days} days`;
};

interface Decide {
  /** 1-on-1 requests the gym may decide at this gym (0180/0203). */
  sessions: QueueRow[];
  /** Packages paid to the gym, waiting for the desk to confirm (0181). */
  payments: CoachingRow[];
  /** Packages a member asked a coach for, not answered yet — the coach decides; the desk sees it. */
  asked: CoachingRow[];
}

/**
 * Personal training (simplify, 2026-10-28; mock-up approved): single sessions
 * and monthly packages, in one place — **To decide** (the 1-on-1 requests the
 * gym decides, package payments to confirm, and packages waiting on a coach),
 * **Sessions** (the Bookings page's 1-on-1s, everything it did) and
 * **Packages** (the Coaching page, everything it did). Class bookings have
 * their own page under Classes, shown only while the gym runs classes.
 */
export default function PersonalTraining() {
  const navigate = useNavigate();
  const modules = useGymModules();
  const packagesOn = moduleOn(modules, 'coaching');
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') as Tab | null;
  const tab: Tab = asked === 'sessions' || (asked === 'packages' && packagesOn) ? asked : 'decide';
  const setTab = (t: Tab) => setParams(t === 'decide' ? {} : { tab: t }, { replace: true });
  useTour(tourFor(tab === 'decide' ? 'personal-training' : ''));

  const [data, setData] = useState<Decide | null | undefined>(undefined);
  const [names, setNames] = useState<Record<string, { name: string; photo: string | null }>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      await Promise.all([sweepStaleRequests().catch(() => undefined), Promise.resolve(coachingSweep()).catch(() => undefined)]);
      const [queue, coachings, settings, ms, ts] = await Promise.all([
        loadBookingQueue(), listCoachings().catch(() => null),
        supabase.from('gym_settings').select('pt_booking_approval').maybeSingle(),
        listMembers().catch(() => []), listTrainers().catch(() => []),
      ]);
      const mode = ((settings.data as { pt_booking_approval: Mode | null } | null)?.pt_booking_approval ?? 'coach') as Mode;
      // The same rule Bookings uses: the gym decides unless the coach does, and
      // always when the coach is not active (0203) — so nothing is stranded.
      const gymMay = (r: QueueRow) => !r.coachActive || (mode !== 'coach' && (mode !== 'coach_desk' || !!r.coachOkName));
      const list = coachings ?? [];
      setData({
        sessions: queue.rows.filter((r) => r.kind === 'pt' && r.status === 'pending' && gymMay(r))
          .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
        payments: list.filter((r) => r.fee_mode === 'gym_priced' && (r.status === 'payment_sent' || r.status === 'awaiting_payment')),
        asked: list.filter((r) => r.status === 'requested'),
      });
      setNames(Object.fromEntries([
        ...ms.map((x) => [x.profile.id, { name: `${x.profile.first_name} ${x.profile.last_name}`, photo: x.profile.photo_url ?? null }]),
        ...ts.map((x) => [x.profile.id, { name: `${x.profile.first_name} ${x.profile.last_name}`, photo: x.profile.photo_url ?? null }]),
      ]));
    } catch {
      setData(null);
    }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const name = (id: string | null) => (id ? names[id]?.name ?? 'Someone' : '—');
  const count = data ? data.sessions.length + data.payments.length : 0;

  const decide = async (r: QueueRow, decision: 'approved' | 'rejected') => {
    setBusy(r.id);
    try {
      await setPtSessionStatus(r.id, decision);
      await notifyUser({
        userId: r.memberId, type: 'booking',
        title: decision === 'approved' ? 'Session confirmed' : 'Session not approved',
        message: decision === 'approved' ? `Your session on ${when(r.when)} is confirmed. See you there.`
          : `Your session on ${when(r.when)} could not be approved. Ask the front desk for another time.`,
        actionUrl: '/member/sessions',
      }).catch(() => showToast('Decision saved, but the member could not be notified', 'error'));
      showToast(decision === 'approved' ? 'Session confirmed' : 'Session declined', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    } finally {
      setBusy('');
    }
  };
  const confirmPay = async (r: CoachingRow, found: boolean) => {
    setBusy(r.id);
    try {
      await confirmCoachingPayment(r.id, found, found ? (r.pay_reference ? 'online' : 'cash') : null);
      showToast(found ? 'Confirmed — the package has started' : 'They have been asked to check it', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="att" data-personal-training>
      <div className="a-head">
        <div className="min-w-0">
          <h1>Personal training</h1>
          <p>Single sessions and monthly packages, in one place</p>
        </div>
        <nav className="a-tabs" aria-label="Personal training" data-pt-tabs>
          <button type="button" className={tab === 'decide' ? 'on' : ''} onClick={() => setTab('decide')}><Inbox size={14} />To decide{count > 0 && <em>{count}</em>}</button>
          <button type="button" className={tab === 'sessions' ? 'on' : ''} onClick={() => setTab('sessions')}><CalendarDays size={14} />Sessions</button>
          {packagesOn && <button type="button" className={tab === 'packages' ? 'on' : ''} onClick={() => setTab('packages')}><Handshake size={14} />Packages</button>}
        </nav>
      </div>

      {tab === 'sessions' && <Bookings scope="pt" embedded />}
      {tab === 'packages' && <Coaching embedded />}
      {tab === 'decide' && (
        <div className="a-card" style={{ flex: 1, padding: 0 }} data-to-decide>
          {data === undefined ? <p className="a-sub" style={{ padding: 18 }}>Loading…</p>
            : data === null ? <p className="a-sub" style={{ padding: 18, color: 'var(--a-a300)' }}>What waits could not be loaded. Refresh to try again.</p>
            : count + data.asked.length === 0 ? <p className="a-sub text-center" style={{ padding: 26 }} data-decide-empty>Nothing waits for you — requests and payments show here as they come in.</p>
            : (
              <div className="a-scroll" style={{ flex: 1 }}>
                <table className="a-table">
                  <thead><tr><th>Member</th><th>What</th><th>Coach</th><th>When</th><th /></tr></thead>
                  <tbody>
                    {data.sessions.map((r) => (
                      <tr key={`s:${r.id}`} data-decide-row="session">
                        <td><div className="a-who"><Av name={r.memberName} photo={names[r.memberId]?.photo} small /><b>{r.memberName}</b></div></td>
                        <td>Single session{r.coachOkName ? <span className="a-sub"> · {r.coachOkName} accepted</span> : null}</td>
                        <td>{r.trainerName ?? '—'}</td>
                        <td>{when(r.when)} <span className="a-sub">· {waited(r.requestedAt)}</span></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button type="button" className="a-btn ghost sm" disabled={busy === r.id} onClick={() => void decide(r, 'rejected')}>Decline</button>{' '}
                          <button type="button" className="a-btn violet sm" disabled={busy === r.id} onClick={() => void decide(r, 'approved')}>Confirm</button>
                        </td>
                      </tr>
                    ))}
                    {data.payments.map((r) => (
                      <tr key={`p:${r.id}`} data-decide-row="payment">
                        <td><div className="a-who"><Av name={name(r.member_id)} photo={names[r.member_id]?.photo} small /><b>{name(r.member_id)}</b></div></td>
                        <td>{r.months}-month package · {r.price != null ? peso(r.price) : 'no price'} <span className="a-sub">· {r.pay_reference ? `ref ${r.pay_reference}` : 'to pay at the desk'}</span></td>
                        <td>{name(r.trainer_id)}</td>
                        <td>Starts when confirmed</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.pay_reference && <><button type="button" className="a-btn ghost sm" disabled={busy === r.id} onClick={() => void confirmPay(r, false)}>Not found</button>{' '}</>}
                          <button type="button" className="a-btn violet sm" disabled={busy === r.id} onClick={() => void confirmPay(r, true)}>{r.pay_reference ? 'Confirm payment' : 'Paid in cash'}</button>
                        </td>
                      </tr>
                    ))}
                    {data.asked.map((r) => (
                      <tr key={`a:${r.id}`} data-decide-row="asked">
                        <td><div className="a-who"><Av name={name(r.member_id)} photo={names[r.member_id]?.photo} small /><b>{name(r.member_id)}</b></div></td>
                        <td>Asked for a {r.months}-month package</td>
                        <td>{name(r.trainer_id)}</td>
                        <td><span className="a-sub">{waited(r.created_at)} · the coach decides</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="a-btn ghost sm" onClick={() => navigate('/personal-training?tab=packages')}>See packages</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
