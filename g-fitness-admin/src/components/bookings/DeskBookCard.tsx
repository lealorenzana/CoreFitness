import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, X } from 'lucide-react';
import { listMembers } from '../../lib/api/members';
import { listMemberships } from '../../lib/api/memberships';
import { listTrainers, type TrainerWithProfile } from '../../lib/api/trainers';
import { listAllAvailability, type TrainerAvailabilityRow } from '../../lib/api/trainerAvailability';
import { listPtSessions, deskBookPt, type PtSessionRow } from '../../lib/api/ptSessions';
import { deskBookClass } from '../../lib/api/bookings';
import { notifyUser } from '../../lib/api/notify';
import { loadSessionsBetween, type CalendarSession } from '../../services/scheduleService';
import { addDays, localDateKey, todayKey } from '../../utils/dates';
import { showToast } from '../../utils/toast';
import { Initials } from '../ui/rd';
import GymMascot from '../ui/GymMascot';

const dayLabel = (key: string, today: string) => {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short' });
};
const dateOf = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); };
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

/**
 * Book for a member, at the desk. Since 2026-11-27 (owner) a floating page like Add member (`am-*` in v2.css): a
 * panel in the gym's colour with the three steps and the kettlebell, then who, the day, and a class with seats left
 * or a coach's free 1-on-1 slot, and one amber Book button. A desk booking is confirmed at once and the member is
 * told (0204 for classes; pt_sessions_insert_frontdesk for 1-on-1). The database still refuses a full class, a plan
 * without classes, or a clash, and says which.
 */
export default function DeskBookCard({ open, onClose, onBooked, only }: { open: boolean; onClose: () => void; onBooked: () => void;
  /** One kind only (2026-11-14): Class bookings books classes, Personal training books 1-on-1, no switch between. */
  only?: 'class' | 'pt' }) {
  const [today] = useState(() => todayKey());
  const [members, setMembers] = useState<{ id: string; name: string; photo: string | null; plan: string }[]>([]);
  const [trainers, setTrainers] = useState<TrainerWithProfile[]>([]);
  const [avail, setAvail] = useState<TrainerAvailabilityRow[]>([]);
  const [pts, setPts] = useState<PtSessionRow[]>([]);
  const [who, setWho] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'class' | 'pt'>(only ?? 'class');
  const [day, setDay] = useState(today);
  const [coach, setCoach] = useState('');
  const [classes, setClasses] = useState<CalendarSession[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [ms, ts, av, pt, mships] = await Promise.all([listMembers().catch(() => []), listTrainers().catch(() => []), listAllAvailability().catch(() => []), listPtSessions().catch(() => []), listMemberships().catch(() => [])]);
      const planOf = new Map<string, { at: string; name: string }>();
      for (const x of mships) { const seen = planOf.get(x.member_id); if (!seen || x.created_at > seen.at) planOf.set(x.member_id, { at: x.created_at, name: x.membership_plans?.name ?? '' }); }
      setMembers(ms.filter((m) => m.profile.status === 'active').map((m) => ({ id: m.profile.id, name: `${m.profile.first_name} ${m.profile.last_name}`, photo: m.profile.photo_url ?? null, plan: planOf.get(m.profile.id)?.name ?? '' })));
      setTrainers(ts.filter((t) => t.profile.status === 'active'));
      setAvail(av);
      setPts(pt);
    })();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    void (async () => { setClasses(await loadSessionsBetween(day, day).catch(() => [])); })();
  }, [day, busy, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const hits = q.trim() ? members.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const member = members.find((m) => m.id === who) ?? null;
  const [nowMs] = useState(() => Date.now());
  const openClasses = (classes ?? []).filter((c) => new Date(c.startsAt).getTime() > nowMs);

  /** A coach's free slots that day: their hours, cut into slots, minus what is taken. */
  const slots = useMemo(() => {
    if (!coach) return [];
    const [y, m, d] = day.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const taken = pts.filter((p) => p.trainer_id === coach && (p.status === 'pending' || p.status === 'approved') && localDateKey(p.starts_at) === day)
      .map((p) => [new Date(p.starts_at).getTime(), new Date(p.starts_at).getTime() + p.duration_minutes * 60000]);
    const out: { at: string; minutes: number; free: boolean }[] = [];
    for (const a of avail.filter((x) => x.trainer_id === coach && x.day_of_week === dow)) {
      const [sh, sm] = a.start_time.split(':').map(Number); const [eh, em] = a.end_time.split(':').map(Number);
      for (let t = sh * 60 + sm; t + a.slot_minutes <= eh * 60 + em; t += a.slot_minutes) {
        const start = new Date(y, m - 1, d, Math.floor(t / 60), t % 60).getTime();
        const end = start + a.slot_minutes * 60000;
        if (start <= nowMs) continue;
        out.push({ at: new Date(start).toISOString(), minutes: a.slot_minutes, free: !taken.some(([s, e]) => s < end && start < e) });
      }
    }
    return out.sort((p, r) => p.at.localeCompare(r.at));
  }, [coach, day, avail, pts, nowMs]);

  const chosenClass = openClasses.find((c) => c.id === pick) ?? null;
  const chosenSlot = slots.find((s) => s.at === pick) ?? null;
  const coachName = (id: string) => { const t = trainers.find((x) => x.profile.id === id); return t ? `${t.profile.first_name} ${t.profile.last_name}` : ''; };
  const book = async () => {
    if (!member) return;
    setBusy(true);
    try {
      if (kind === 'class' && chosenClass) {
        await deskBookClass(member.id, chosenClass.id);
        showToast(`${member.name} is booked into ${chosenClass.name}: they have been told`, 'success');
      } else if (kind === 'pt' && chosenSlot && coach) {
        await deskBookPt({ trainerId: coach, memberId: member.id, startsAt: chosenSlot.at, durationMinutes: chosenSlot.minutes });
        const first = trainers.find((t) => t.profile.id === coach)?.profile.first_name ?? 'your coach';
        await notifyUser({ userId: member.id, type: 'booking', title: 'Booked by the gym', message: `A 1-on-1 with ${first} on ${dayLabel(day, today) === 'Today' ? 'today' : day} at ${timeOf(chosenSlot.at)} is confirmed.`, actionUrl: '/member/bookings' }).catch(() => undefined);
        setPts(await listPtSessions().catch(() => pts));
        showToast(`${member.name} has a 1-on-1 at ${timeOf(chosenSlot.at)}: they have been told`, 'success');
      }
      setPick(null);
      onBooked();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not book that', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const picked = !!(chosenClass || chosenSlot);
  const steps = [
    { title: 'Who it is for', done: !!member },
    { title: kind === 'pt' ? 'The day, coach and time' : 'The day and class', done: picked },
    { title: 'Book it', done: false },
  ];
  const say = !member ? 'Who is it for? Type their name.'
    : !picked ? (kind === 'pt' && !coach ? `Now the day and a coach for ${member.name.split(' ')[0]}.` : 'Now pick a time.')
    : 'Ready. They are told the moment you book.';

  return createPortal((
    <div className="am-root" role="dialog" aria-modal="true" aria-label="Book for a member" data-desk-book>
      <div className="am-scrim" onClick={onClose} />
      <div className="am-win bk-win">
        <aside className="am-side">
          <div>
            <h2>Book for a member</h2>
            <p>A desk booking is confirmed at once, and the member is told.</p>
          </div>
          <ol className="am-parts" aria-label="Steps">
            {steps.map((s, i) => (
              <li key={s.title}><span className={`bk-step ${s.done ? 'done' : ''}`}><span className={`n ${s.done ? 'ok' : ''}`}>{s.done ? <Check size={12} /> : i + 1}</span>{s.title}</span></li>
            ))}
          </ol>
          <div className="am-buddy" aria-hidden>
            <p key={say} className="am-say">{say}</p>
            <GymMascot src="/images/admin-art/mascot-kettlebell.webp" />
          </div>
        </aside>

        <section className="am-main">
          <button type="button" aria-label="Close" onClick={onClose} className="am-x"><X size={16} /></button>
          <div className="am-form">
            <section className="am-part" aria-labelledby="bk-p0">
              <h3 id="bk-p0"><span>1</span>Who it is for</h3>
              {member ? (
                <div className="bk-chosen"><Initials name={member.name} photo={member.photo} size={32} />
                  <span className="flex-1 min-w-0"><b>{member.name}</b><small>{member.plan || 'no plan'}</small></span>
                  <button type="button" className="am-btn sm" onClick={() => { setWho(null); setPick(null); }}>Change</button></div>
              ) : (
                <div className="bk-find">
                  <label className="bk-search"><Search size={16} />
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type the member's name" aria-label="Member to book" /></label>
                  {hits.length > 0 && (
                    <div className="bk-hits">
                      {hits.map((m) => (
                        <button key={m.id} type="button" onClick={() => { setWho(m.id); setQ(''); }}>
                          <Initials name={m.name} photo={m.photo} size={32} /><span className="flex-1 min-w-0"><b>{m.name}</b><small>{m.plan || 'no plan'}</small></span></button>
                      ))}
                    </div>
                  )}
                  {q.trim() && hits.length === 0 && <p className="am-hint">No active member by that name.</p>}
                </div>
              )}
            </section>

            <section className="am-part" aria-labelledby="bk-p1">
              <h3 id="bk-p1"><span>2</span>{kind === 'pt' ? 'The day, coach and time' : 'The day and class'}</h3>
              {!only && (
                <div className="v2-seg" style={{ justifySelf: 'start' }}>
                  <button type="button" data-on={kind === 'class' ? '' : undefined} onClick={() => { setKind('class'); setPick(null); }}>Class</button>
                  <button type="button" data-on={kind === 'pt' ? '' : undefined} onClick={() => { setKind('pt'); setPick(null); }}>1-on-1</button>
                </div>
              )}
              <div className="bk-days">
                {days.map((k) => (
                  <button key={k} type="button" className={day === k ? 'on' : ''} onClick={() => { setDay(k); setPick(null); }}>
                    <b>{dayLabel(k, today)}</b><small>{dateOf(k)}</small></button>
                ))}
              </div>
              {kind === 'pt' && (
                <div className="bk-coaches" role="radiogroup" aria-label="Coach for the 1-on-1">
                  {trainers.map((t) => (
                    <button key={t.profile.id} type="button" role="radio" aria-checked={coach === t.profile.id} className={coach === t.profile.id ? 'on' : ''}
                      onClick={() => { setCoach(t.profile.id); setPick(null); }}>
                      <Initials name={`${t.profile.first_name} ${t.profile.last_name}`} photo={t.profile.photo_url ?? null} size={26} />{t.profile.first_name} {t.profile.last_name}
                    </button>
                  ))}
                  {trainers.length === 0 && <p className="am-hint">No active coaches yet.</p>}
                </div>
              )}
              <div className="bk-slots" data-desk-slots>
                {kind === 'class' ? (
                  classes === null ? <span className="am-hint">Loading the classes</span> : openClasses.length === 0 ? <span className="am-hint">No classes left that day.</span> : openClasses.map((c) => {
                    const left = c.capacity - c.booked;
                    return (
                      <button key={c.id} type="button" className={`wide ${pick === c.id ? 'on' : ''}`} disabled={left <= 0} onClick={() => setPick(c.id)}>
                        <b>{timeOf(c.startsAt)}</b><span>{c.name}</span><small>{left <= 0 ? 'full' : `${left} left`}</small></button>
                    );
                  })
                ) : !coach ? <span className="am-hint">Pick a coach to see their free times.</span> : slots.length === 0 ? <span className="am-hint">{coachName(coach)} has no hours set for that day.</span> : slots.map((s) => (
                  <button key={s.at} type="button" className={pick === s.at ? 'on' : ''} disabled={!s.free} onClick={() => setPick(s.at)} data-tip={s.free ? undefined : 'Taken'}>
                    <b>{timeOf(s.at)}</b><small>{s.free ? `${s.minutes} min` : 'taken'}</small></button>
                ))}
              </div>
            </section>
          </div>
          <footer className="am-foot">
            <span className="am-sum">{member && chosenClass ? <><b>{member.name}</b> · {chosenClass.name}, {dayLabel(day, today)} {timeOf(chosenClass.startsAt)}</>
              : member && chosenSlot ? <><b>{member.name}</b> · 1-on-1 with {coachName(coach)}, {dayLabel(day, today)} {timeOf(chosenSlot.at)}</>
              : 'Pick a member and a time.'}</span>
            <button type="button" className="am-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="am-btn go" disabled={busy || !member || !picked} onClick={() => void book()} data-desk-book-go>
              <Check size={15} />{busy ? 'Booking' : member && picked ? `Book ${member.name.split(' ')[0]}` : 'Book'}</button>
          </footer>
        </section>
      </div>
    </div>
  ), document.body);
}
