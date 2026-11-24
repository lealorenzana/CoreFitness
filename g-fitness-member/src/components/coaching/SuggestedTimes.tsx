import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassSheet from '../ui/GlassSheet';
import { Chip, NocButton, SectionHead } from '../ui/noc';
import { toast } from '../ui/Toast';
import { getCurrentMemberId, listOpenPtSlots } from '../../services/bookingService';
import { requestPtSession } from '../../lib/api/ptSessions';
import { listMyPlan } from '../../lib/api/gymPlans';
import { getBookingRules, repeatBooking, type BookingRules } from '../../lib/api/bookingRules';
import { suggestTimes, type Suggestion } from '../../lib/suggestTimes';
import { todayKey } from '../../utils/dates';
import { errorMessage } from '../../utils/errorMessage';
import type { Coaching } from '../../lib/api/coaching';

const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const weekday = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { weekday: 'long' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

/**
 * Under the package card (owner, 2026-11-24): times when the coach is free on the member's own training days.
 * Tap one, choose once or every week, and it is asked for: the session through the same insert as Book a session,
 * the weeks through 0260's repeat_booking (only when the gym lets members repeat). Every week is still asked for
 * and confirmed the gym's way; nothing is booked without the coach's yes.
 */
export default function SuggestedTimes({ coaching, onAsked }: { coaching: Coaching; onAsked: () => void }) {
  const navigate = useNavigate();
  const today = todayKey();
  const standin = coaching.standin && coaching.standin.from <= today && today <= coaching.standin.to ? coaching.standin : null;
  const coachId = standin?.trainerId ?? coaching.trainerId;
  const coachFirst = (standin?.name ?? coaching.trainerName).split(' ')[0];
  const [list, setList] = useState<Suggestion[] | null | undefined>(undefined);
  const [rules, setRules] = useState<BookingRules | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [pick, setPick] = useState<Suggestion | null>(null);
  const [weekly, setWeekly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        const [slots, plan, r] = await Promise.all([
          id ? listOpenPtSlots(coachId, 14, id) : Promise.resolve([]),
          id ? listMyPlan(id).catch(() => []) : Promise.resolve([]),
          getBookingRules().catch(() => null),
        ]);
        if (!alive) return;
        setMemberId(id);
        setRules(r);
        setList(suggestTimes(slots, plan.filter((p) => p.active !== false).map((p) => ({ day: p.day_of_week, at: p.remind_at ? p.remind_at.slice(0, 5) : null }))));
      } catch {
        if (alive) setList(null);
      }
    })();
    return () => { alive = false; };
  }, [coachId, round]);

  const canRepeat = !!rules?.repeatsOn && rules.repeatWho.includes('member');
  const byWeeks = rules?.repeatKind !== 'until_stopped';
  // Never past the package's end, never past the gym's own limit.
  const weeksLeft = coaching.endsOn ? Math.max(1, Math.floor((new Date(`${coaching.endsOn}T00:00:00`).getTime() - openedAt) / (7 * 864e5))) : 4;
  const weeks = Math.max(2, Math.min(rules?.repeatMaxWeeks ?? 4, weeksLeft));

  const ask = async () => {
    if (!pick || !memberId) return;
    setBusy(true);
    try {
      const row = await requestPtSession({ trainerId: coachId, memberId, startsAt: pick.startsAt, durationMinutes: pick.durationMinutes });
      if (weekly && canRepeat) {
        const res = await repeatBooking('pt', row.id, byWeeks ? weeks : null);
        if (!res.ok) toast.error(`The first one is asked. ${res.message}`);
        else toast.success(`Asked for every ${weekday(pick.startsAt)}. ${coachFirst} confirms each one.`);
      } else {
        toast.success(row.status === 'approved' ? 'Confirmed. It is in your sessions.' : `Asked. You will be told when ${coachFirst} confirms.`);
      }
      setPick(null);
      setRound((n) => n + 1);
      onAsked();
    } catch (err) {
      toast.error(errorMessage(err, 'That time could not be asked for. Pick another.'));
    } finally {
      setBusy(false);
    }
  };

  if (!list) return null;
  if (list.length === 0) {
    return (
      <p data-suggest-empty style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        {coachFirst} has no open times in the next two weeks. Message them to find one.
      </p>
    );
  }
  const fits = list[0].fitsPlan;
  return (
    <section aria-label="Times that fit your week" data-suggested-times>
      <SectionHead title={fits ? 'Times that fit your week' : `${coachFirst}'s next open times`} />
      <p className="slot-note">{fits ? 'Each one falls on one of your training days.' : `Open times in ${coachFirst}'s hours.`}</p>
      {/* Three date tiles side by side, the same date block as Events (2026-11-24). */}
      <div className="slot-grid noc-rows">
        {list.map((s) => {
          const d = new Date(s.startsAt);
          return (
            <button key={s.startsAt} type="button" className="slot-tile noc-press-soft" aria-label={`Ask for ${when(s.startsAt)}`}
              onClick={() => { setWeekly(canRepeat); setPick(s); }}>
              <span className="slot-day">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <b>{d.getDate()}</b>
              <span className="slot-day">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
              <span className="slot-time">{clock(s.startsAt)}</span>
              {!fits && <span className="slot-len">{s.durationMinutes} min</span>}
              <span className="slot-ask">Ask</span>
            </button>
          );
        })}
      </div>
      {!fits && (
        <button type="button" onClick={() => navigate('/member/gym-plan')} data-set-days
          style={{ fontSize: 12.5, marginTop: 6, color: 'var(--color-primary-300)', textAlign: 'left' }}>
          Set your training days to see times that fit your week
        </button>
      )}

      <GlassSheet open={pick !== null} onClose={() => !busy && setPick(null)}
        title={`Ask ${coachFirst} for a session`}
        subtitle={pick ? when(pick.startsAt) : undefined}
        footer={<NocButton variant="fill" className="w-full" disabled={busy} onClick={() => void ask()}>
          {busy ? 'Asking…' : weekly && canRepeat && pick ? `Ask for every ${weekday(pick.startsAt)}` : 'Ask for this one'}
        </NocButton>}>
        {canRepeat && pick && (
          <div className="flex flex-col" style={{ gap: 10 }} data-repeat-choice>
            <div className="flex flex-wrap" style={{ gap: 8 }} role="radiogroup" aria-label="How often">
              <Chip label="Just this once" on={!weekly} onClick={() => setWeekly(false)} />
              <Chip label={`Every ${weekday(pick.startsAt)} at ${clock(pick.startsAt)}`} on={weekly} onClick={() => setWeekly(true)} />
            </div>
            {weekly && (
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
                {byWeeks ? `For the next ${weeks} weeks.` : 'Every week until you stop it.'} Each week is asked for on its own and {coachFirst} confirms it; a week that cannot go ahead is listed in your sessions with the reason.
              </p>
            )}
          </div>
        )}
        {!canRepeat && (
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
            {coachFirst} gets your request and you are told when it is confirmed.
          </p>
        )}
      </GlassSheet>
    </section>
  );
}
