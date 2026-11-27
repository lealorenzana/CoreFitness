import { useCallback, useEffect, useState } from 'react';
import GymMascot from '../components/ui/GymMascot';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Handshake, Inbox } from 'lucide-react';
import { Av } from './attendance/parts';
import './attendance/att.css';
import Bookings from './Bookings';
import Coaching from './Coaching';
import { showToast } from '../utils/toast';
import type { QueueRow } from '../services/bookingQueueService';
import { loadToDecide, decideSession, deskMayAnswer, type ToDecide } from '../services/deskActions';
import { confirmCoachingPayment, deskDecideCoaching, type CoachingApproval, type CoachingRow } from '../lib/api/coaching';
import { listMembers } from '../lib/api/members';
import { listTrainers } from '../lib/api/trainers';
import { useGymModules, moduleOn } from '../hooks/useGymModules';
import { useTour } from '../components/tour/Tour';
import { tourFor } from '../lib/tours';
import SkelRows from '../components/ui/SkelRows';

type Tab = 'decide' | 'sessions' | 'packages';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const when = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : 'Time to be set');
const waited = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'asked today' : days === 1 ? 'waiting 1 day' : `waiting ${days} days`;
};

type Decide = ToDecide;

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
  /** Who approves a member's pick of a coach (0258). */
  const [approval, setApproval] = useState<CoachingApproval>('coach');

  const load = useCallback(async () => {
    try {
      // What the gym (not the coach) answers: services/deskActions, shared with Notifications' Needs you.
      const [todo, ms, ts] = await Promise.all([loadToDecide(), listMembers().catch(() => []), listTrainers().catch(() => [])]);
      setApproval(todo.approval);
      setData(todo);
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
  // A package ask is the desk's to answer when the gym says so (0258): 'desk' always; 'coach, then desk' once the coach said yes.
  const deskMay = (r: CoachingRow) => deskMayAnswer(approval, r);
  const count = data ? data.sessions.length + data.payments.length + data.asked.filter(deskMay).length : 0;
  const answerAsk = async (r: CoachingRow, accept: boolean) => {
    let price: number | null = null;
    if (accept && r.fee_mode === 'trainer_direct' && r.price == null) {
      const said = window.prompt(`What ${name(r.trainer_id)} charges for ${r.months} month${r.months === 1 ? '' : 's'} (₱0 if nothing)`);
      if (said == null) return;
      price = Number(said.replace(/[^\d.]/g, ''));
      if (!Number.isFinite(price)) { showToast('Enter an amount in pesos', 'error'); return; }
    }
    setBusy(r.id);
    try {
      await deskDecideCoaching(r.id, accept, price);
      showToast(accept ? `${name(r.trainer_id)} is now ${name(r.member_id)}’s coach` : 'Declined: the member has been told', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    } finally {
      setBusy('');
    }
  };

  const decide = async (r: QueueRow, decision: 'approved' | 'rejected') => {
    setBusy(r.id);
    try {
      const { notified } = await decideSession(r, decision);
      if (!notified) showToast('Decision saved, but the member could not be notified', 'error');
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
      showToast(found ? 'Confirmed: the package has started' : 'They have been asked to check it', 'success');
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
        // To decide (owner, 2026-11-27): the Needs you look (nb-* in v2.css): a band in the gym's colour with a count,
        // three figures and a mascot, then the answers grouped, one amber button for the first thing waiting.
        <div className="a-card ptd" style={{ flex: 1, padding: 0, overflow: 'hidden' }} data-to-decide>
          {data === undefined ? <SkelRows label="Loading…" />
            : data === null ? <p className="a-sub" style={{ padding: 18, color: 'var(--a-a300)' }}>What waits could not be loaded. Refresh to try again.</p>
            : (() => {
              const total = data.sessions.length + data.payments.length + data.asked.length;
              const owed = data.payments.reduce((s, r) => s + (r.price ?? 0), 0);
              let amberUsed = false;
              /** The answer that moves things on: amber for the first one on the page, plain after that. */
              const yes = () => { const go = !amberUsed; amberUsed = true; return go ? 'nb-btn go' : 'nb-btn strong'; };
              const row = (key: string, kind: string, who: string, photo: string | null | undefined, title: React.ReactNode, line: React.ReactNode, acts: React.ReactNode) => (
                <div key={key} className="nb-item" data-decide-row={kind}>
                  <Av name={who} photo={photo} small />
                  <div className="min-w-0"><b>{title}</b><p>{line}</p></div>
                  <div className="nb-acts">{acts}</div>
                </div>
              );
              return (
                <div className="nb-home">
                  <div className="nb-band">
                    <div className="nb-hd">
                      {/* The same count as the tab: what the gym answers, not a package ask its coach decides. */}
                      <h2>{count === 0 ? 'Nothing for you to decide' : `${count} thing${count === 1 ? '' : 's'} to decide`}</h2>
                      <p>{count === 0 ? 'Session requests, package payments and package asks show here as they come in.'
                        : 'The gym’s answers on personal training. Each one tells the member straight away.'}</p>
                    </div>
                    <div className="nb-sum">
                      <div><b>{data.sessions.length}</b><span>sessions to confirm</span></div>
                      <div><b>{peso(owed)}</b><span>package payments to check</span></div>
                      <div><b>{data.asked.length}</b><span>package asks</span></div>
                    </div>
                    <GymMascot className="nb-buddy" key={count === 0 ? 'done' : 'wait'} aria-hidden
                      src={count === 0 ? '/images/admin-art/mascot-clipboard.webp' : '/images/admin-art/mascot-kettlebell.webp'} />
                  </div>
                  {total === 0 ? <p className="nb-none" style={{ padding: '18px 22px' }} data-decide-empty>Nothing waits for you: requests and payments show here as they come in.</p> : (
                    <div className="nb-need">
                      {data.sessions.length > 0 && (
                        <section>
                          <h3>Single sessions <span>{data.sessions.length}</span></h3>
                          {data.sessions.map((r) => row(`s:${r.id}`, 'session', r.memberName, names[r.memberId]?.photo,
                            <>{r.memberName} <span className="ptd-what">Single session{r.trainerName ? ` with ${r.trainerName}` : ''}</span></>,
                            <>{when(r.when)} · {waited(r.requestedAt)}{r.coachOkName ? ` · ${r.coachOkName} accepted` : ''}</>,
                            <>
                              <button type="button" className="nb-btn" disabled={busy === r.id} onClick={() => void decide(r, 'rejected')}>Decline</button>
                              <button type="button" className={yes()} disabled={busy === r.id} onClick={() => void decide(r, 'approved')}>Confirm</button>
                            </>))}
                        </section>
                      )}
                      {data.payments.length > 0 && (
                        <section>
                          <h3>Package payments <span>{data.payments.length}</span></h3>
                          {data.payments.map((r) => row(`p:${r.id}`, 'payment', name(r.member_id), names[r.member_id]?.photo,
                            <>{name(r.member_id)} <span className="ptd-what">{r.months}-month package · {r.price != null ? peso(r.price) : 'no price'}</span></>,
                            <>With {name(r.trainer_id)} · {r.pay_reference ? `ref ${r.pay_reference}` : 'to pay at the desk'} · starts when confirmed</>,
                            <>
                              {r.pay_reference && <button type="button" className="nb-btn" disabled={busy === r.id} onClick={() => void confirmPay(r, false)}>Not found</button>}
                              <button type="button" className={yes()} disabled={busy === r.id} onClick={() => void confirmPay(r, true)}>{r.pay_reference ? 'Confirm payment' : 'Paid in cash'}</button>
                            </>))}
                        </section>
                      )}
                      {data.asked.length > 0 && (
                        <section>
                          <h3>Package asks <span>{data.asked.length}</span></h3>
                          {data.asked.map((r) => row(`a:${r.id}`, 'asked', name(r.member_id), names[r.member_id]?.photo,
                            <>{name(r.member_id)} <span className="ptd-what">Asked for a {r.months}-month package with {name(r.trainer_id)}</span></>,
                            <>{waited(r.created_at)} · {approval === 'desk' ? 'you decide'
                              : approval === 'coach_desk' ? (r.coach_ok_at ? `${name(r.trainer_id)} said yes: you confirm` : `waiting for ${name(r.trainer_id)} first`)
                              : 'the coach decides'}</>,
                            approval === 'coach' ? (
                              <button type="button" className="nb-btn" onClick={() => navigate('/personal-training?tab=packages')}>See packages</button>
                            ) : (<>
                              <button type="button" className="nb-btn" disabled={busy === r.id} onClick={() => void answerAsk(r, false)} data-ask-decline>Decline</button>
                              {deskMay(r) && <button type="button" className={yes()} disabled={busy === r.id} onClick={() => void answerAsk(r, true)} data-ask-confirm>Confirm</button>}
                            </>)))}
                        </section>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
}
