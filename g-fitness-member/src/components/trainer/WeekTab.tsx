import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X } from '@phosphor-icons/react';
import Avatar from '../ui/Avatar';
import CancelBookingDialog from '../ui/CancelBookingDialog';
import { Panel, StatusPill } from '../ui/noc';
import { toast } from '../ui/Toast';
import { listTrainerPtSessions, type PtSessionRow } from '../../lib/api/ptSessions';
import { listMyTrainerMembers, type TrainerRosterRow } from '../../lib/api/trainerRoster';
import { myCoachings } from '../../lib/api/coaching';
import { getBookingModes, type BookingModes } from '../../lib/api/bookings';
import {
  coachDecides, decideRequest, decidedText, loadTrainerRequests, modeFor, waitedLabel, type TrainerRequest,
} from '../../services/trainerRequests';
import { errorMessage } from '../../utils/errorMessage';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' });

/** One thing on the week: a 1-on-1 session or (where the gym runs classes) a member's class booking. */
interface WeekItem { kind: 'pt' | 'class'; id: string; memberId: string; startsAt: string; title: string }

/**
 * This week — what a coach runs Monday to Sunday, on the phone's own clock
 * (simplify, 2026-10-28; it replaced Bookings and keeps everything it did):
 *
 *   to decide   every pending request — ✓ / ✕ when it is this coach's call; a
 *               sentence when the front desk decides it, or the coach accepted
 *               and the desk confirms (0180); how long each has waited, and a
 *               banner for anyone waiting more than a day
 *   the week    each day's approved sessions, tagged Package or Single — and,
 *               where the gym runs classes, members' class bookings — each
 *               cancelled only through cancel_booking() with a reason (0081)
 */
export default function WeekTab({ trainerId, classesOn }: { trainerId: string | null; classesOn: boolean }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<PtSessionRow[] | null>(null);
  const [roster, setRoster] = useState<TrainerRosterRow[]>([]);
  const [packaged, setPackaged] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<TrainerRequest[]>([]);
  const [modes, setModes] = useState<BookingModes>({ classMode: 'coach', ptMode: 'coach' });
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<WeekItem | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!trainerId) return;
    const [s, r, c, rq, m] = await Promise.all([
      listTrainerPtSessions(trainerId).catch(() => null), listMyTrainerMembers().catch(() => [] as TrainerRosterRow[]),
      myCoachings().catch(() => null), loadTrainerRequests(trainerId).catch(() => [] as TrainerRequest[]), getBookingModes().catch(() => null),
    ]);
    setSessions(s); setRoster(r);
    setPackaged(new Set((c ?? []).filter((x) => x.iAm !== 'member' && x.status === 'active').map((x) => x.memberId)));
    setRequests(rq);
    if (m) setModes(m);
  }, [trainerId]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const names = new Map(roster.map((m) => [m.member_id, m]));
  const shown = requests.filter((r) => r.kind === 'pt' || classesOn);
  const pending = shown.filter((r) => r.status === 'pending');
  // Only what this coach can still decide is theirs to be nudged about (0180).
  const overdue = pending.filter((r) => coachDecides(r, modes) && now - new Date(r.requestedAt).getTime() > 86_400_000).length;

  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const end = monday.getTime() + 7 * 86_400_000;
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  const inWeek = (iso: string) => { const t = new Date(iso).getTime(); return t >= monday.getTime() && t < end; };
  const week: WeekItem[] = [
    ...(sessions ?? []).filter((s) => s.status === 'approved' && inWeek(s.starts_at))
      .map((s) => ({ kind: 'pt' as const, id: s.id, memberId: s.member_id, startsAt: s.starts_at, title: 'Session' })),
    ...shown.filter((r) => r.kind === 'class' && r.status === 'approved' && r.startsAt && inWeek(r.startsAt))
      .map((r) => ({ kind: 'class' as const, id: r.id, memberId: r.memberId, startsAt: r.startsAt as string, title: r.title })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const decide = async (r: TrainerRequest, status: 'approved' | 'rejected') => {
    if (!trainerId) return;
    setBusy(r.id);
    try { await decideRequest(r, status, trainerId); toast.success(decidedText(r, status, modes, names.get(r.memberId)?.name)); await load(); }
    catch (e) { toast.error(errorMessage(e, 'Could not save that decision')); }
    finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col" style={{ gap: 16 }} data-week-tab>
      {overdue > 0 && (
        <Panel glow="action">
          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-secondary)' }}>
            {overdue === 1 ? 'One member has been waiting more than a day.' : `${overdue} members have been waiting more than a day.`}
          </p>
          <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-secondary)' }}>Declining is a decision too — it lets them book someone else.</p>
        </Panel>
      )}

      {pending.length > 0 && (
        <section data-week-requests>
          <p className="eyebrow">Requests · {pending.length}</p>
          {pending.map((r) => {
            const p = names.get(r.memberId);
            const waited = waitedLabel(r.requestedAt, now);
            const mine = coachDecides(r, modes);
            const mode = modeFor(r, modes);
            return (
              <div key={`${r.kind}:${r.id}`} data-request={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-separator)' }}>
                <div className="flex items-center" style={{ gap: 10 }}>
                  {p && <Avatar name={p.name} photoUrl={p.photo_url} size={34} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>{p?.name ?? 'Member'}</span>
                    <span className="block" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {[r.kind === 'pt' ? 'Session' : r.title, r.startsAt ? `${shortDay(r.startsAt)}, ${time(r.startsAt)}` : 'Not scheduled', waited].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {mine && (
                    <>
                      <button type="button" className="td-no noc-press" disabled={busy === r.id} onClick={() => void decide(r, 'rejected')} aria-label="Decline"><X size={16} /></button>
                      <button type="button" className="td-ok noc-press" disabled={busy === r.id} onClick={() => void decide(r, 'approved')} aria-label="Accept"><Check size={18} weight="bold" /></button>
                    </>
                  )}
                </div>
                {/* The gym chose who decides (0180): then the row says so instead of offering buttons the database would refuse. */}
                {!mine && (
                  <p data-desk-decides style={{ marginTop: 6, paddingLeft: p ? 44 : 0, fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                    {r.coachOk ? 'You accepted — waiting for the front desk to confirm.' : mode === 'off' ? 'Bookings are paused at your gym.' : 'The front desk decides this one at your gym.'}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {sessions === null ? (
        <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>Your sessions could not be loaded. Pull to try again.</p>
      ) : week.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }} data-week-empty>
          Nothing booked this week. Members book you inside your hours — set them on Your hours.
        </p>
      ) : days.map((d) => {
        const list = week.filter((s) => dayKey(new Date(s.startsAt)) === dayKey(d));
        if (list.length === 0) return null;
        return (
          <section key={dayKey(d)} data-week-day>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {d.toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'short' })}
            </h2>
            {list.map((s) => {
              const p = names.get(s.memberId);
              const tag = s.kind === 'class' ? s.title : packaged.has(s.memberId) ? 'Package' : 'Single';
              const ahead = new Date(s.startsAt).getTime() > now;
              return (
                <div key={`${s.kind}:${s.id}`} className="flex items-center" data-week-session={s.kind} style={{ gap: 10, padding: '9px 0', borderBottom: '1px solid var(--color-separator)' }}>
                  <span className="flex-none tabular-nums" style={{ width: 62, fontSize: 13, color: 'var(--color-text-secondary)' }}>{time(s.startsAt)}</span>
                  <button type="button" onClick={() => navigate(`/trainer/pt/${s.memberId}`)} className="min-w-0 flex-1 text-left flex items-center noc-press" style={{ gap: 8, justifyContent: 'flex-start' }}>
                    <span className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{p?.name ?? 'Member'}</span>
                    <StatusPill label={tag} tone={tag === 'Package' ? 'structure' : 'muted'} />
                  </button>
                  {/* cancel_booking() refuses one that has started (0081). */}
                  {ahead && <button type="button" onClick={() => setCancelling(s)} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-secondary)' }}>Cancel</button>}
                </div>
              );
            })}
          </section>
        );
      })}

      <CancelBookingDialog open={cancelling !== null} kind={cancelling?.kind ?? 'pt'} id={cancelling?.id ?? null} actor="trainer"
        title={cancelling ? `${names.get(cancelling.memberId)?.name ?? 'Member'} · ${cancelling.kind === 'class' ? `${cancelling.title} · ` : ''}${shortDay(cancelling.startsAt)}, ${time(cancelling.startsAt)}` : ''}
        onClose={() => setCancelling(null)} onCancelled={() => { setCancelling(null); void load(); }} />
    </div>
  );
}
