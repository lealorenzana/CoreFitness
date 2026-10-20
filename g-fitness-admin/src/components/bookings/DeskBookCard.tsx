import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Check, Search, X } from 'lucide-react';
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
import { Av } from '../../pages/attendance/parts';

const dayLabel = (key: string, today: string) => {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tmrw';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short' });
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

/**
 * Book for a member, at the desk (2026-10-20, the Bookings mock-up): pick the
 * member, a class with seats left on a day — or a coach's free 1-on-1 slot —
 * and book. A desk booking is confirmed at once and the member is told (0204
 * for classes; pt_sessions_insert_frontdesk for 1-on-1). The database still
 * refuses a full class, a plan without classes, or a clash, and says which.
 */
export default function DeskBookCard({ onBooked, focusKey }: { onBooked: () => void; focusKey?: number }) {
  const [today] = useState(() => todayKey());
  const [members, setMembers] = useState<{ id: string; name: string; photo: string | null; plan: string }[]>([]);
  const [trainers, setTrainers] = useState<TrainerWithProfile[]>([]);
  const [avail, setAvail] = useState<TrainerAvailabilityRow[]>([]);
  const [pts, setPts] = useState<PtSessionRow[]>([]);
  const [who, setWho] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'class' | 'pt'>('class');
  const [day, setDay] = useState(today);
  const [coach, setCoach] = useState('');
  const [classes, setClasses] = useState<CalendarSession[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [ms, ts, av, pt, mships] = await Promise.all([listMembers().catch(() => []), listTrainers().catch(() => []), listAllAvailability().catch(() => []), listPtSessions().catch(() => []), listMemberships().catch(() => [])]);
      const planOf = new Map<string, { at: string; name: string }>();
      for (const x of mships) { const seen = planOf.get(x.member_id); if (!seen || x.created_at > seen.at) planOf.set(x.member_id, { at: x.created_at, name: x.membership_plans?.name ?? '' }); }
      setMembers(ms.filter((m) => m.profile.status === 'active').map((m) => ({ id: m.profile.id, name: `${m.profile.first_name} ${m.profile.last_name}`, photo: m.profile.photo_url ?? null, plan: planOf.get(m.profile.id)?.name ?? '' })));
      setTrainers(ts.filter((t) => t.profile.status === 'active'));
      setAvail(av);
      setPts(pt);
    })();
  }, [focusKey]);
  useEffect(() => {
    void (async () => { setClasses(await loadSessionsBetween(day, day).catch(() => [])); })();
  }, [day, busy]);

  const hits = q.trim() ? members.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5) : [];
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
  const book = async () => {
    if (!member) return;
    setBusy(true);
    try {
      if (kind === 'class' && chosenClass) {
        await deskBookClass(member.id, chosenClass.id);
        showToast(`${member.name} is booked into ${chosenClass.name} — they have been told`, 'success');
      } else if (kind === 'pt' && chosenSlot && coach) {
        await deskBookPt({ trainerId: coach, memberId: member.id, startsAt: chosenSlot.at, durationMinutes: chosenSlot.minutes });
        const coachName = trainers.find((t) => t.profile.id === coach)?.profile.first_name ?? 'your coach';
        await notifyUser({ userId: member.id, type: 'booking', title: 'Booked by the gym', message: `A 1-on-1 with ${coachName} on ${dayLabel(day, today) === 'Today' ? 'today' : day} at ${timeOf(chosenSlot.at)} is confirmed.`, actionUrl: '/member/bookings' }).catch(() => undefined);
        setPts(await listPtSessions().catch(() => pts));
        showToast(`${member.name} has a 1-on-1 at ${timeOf(chosenSlot.at)} — they have been told`, 'success');
      }
      setPick(null);
      onBooked();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not book that', 'error');
    } finally {
      setBusy(false);
    }
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  return (
    <div className="a-card glow" data-desk-book style={{ flexShrink: 0 }}>
      <div className="a-ct"><h3><CalendarPlus size={16} />Book for a member</h3><small>at the desk, in 3 taps</small></div>
      {member ? (
        <div className="a-input" style={{ fontSize: 12.5 }}><Av name={member.name} photo={member.photo} small /><span className="truncate" style={{ color: '#fff' }}>{member.name}</span>
          {member.plan && <span className="a-pill" style={{ marginLeft: 'auto' }}>{member.plan}</span>}
          <button type="button" className="a-link" onClick={() => { setWho(null); setPick(null); }} aria-label="Change member"><X size={14} /></button></div>
      ) : (
        <div className="relative">
          <label className="a-input" style={{ fontSize: 12.5 }}><Search size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find the member…" aria-label="Member to book" /></label>
          {hits.length > 0 && (
            <div className="a-card" style={{ position: 'absolute', zIndex: 6, left: 0, right: 0, top: 46, padding: '4px 10px' }}>
              {hits.map((m) => (
                <button key={m.id} type="button" className="a-row w-full text-left" onClick={() => { setWho(m.id); setQ(''); }}>
                  <Av name={m.name} photo={m.photo} small /><div className="t"><b>{m.name}</b>{m.plan && <small>{m.plan}</small>}</div></button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="a-seg" style={{ margin: '10px 0' }}>
        <button type="button" className={kind === 'class' ? 'on' : ''} onClick={() => { setKind('class'); setPick(null); }}>Class</button>
        <button type="button" className={kind === 'pt' ? 'on' : ''} onClick={() => { setKind('pt'); setPick(null); }}>1-on-1</button>
      </div>
      <div className="flex gap-1 flex-wrap">
        {days.map((k) => <button key={k} type="button" className={`a-chip ${day === k ? 'v' : ''}`} style={{ padding: '5px 9px' }} onClick={() => { setDay(k); setPick(null); }}>{dayLabel(k, today)}</button>)}
      </div>
      {kind === 'pt' && (
        <select className="a-in" style={{ marginTop: 8, fontSize: 12.5, padding: '7px 10px' }} value={coach} onChange={(e) => { setCoach(e.target.value); setPick(null); }} aria-label="Coach for the 1-on-1">
          <option value="">Pick a coach…</option>
          {trainers.map((t) => <option key={t.profile.id} value={t.profile.id}>{t.profile.first_name} {t.profile.last_name}</option>)}
        </select>
      )}
      <div className="a-slots" style={{ marginTop: 8, maxHeight: 120, overflowY: 'auto' }} data-desk-slots>
        {kind === 'class' ? (
          classes === null ? <span className="a-sub">Loading…</span> : openClasses.length === 0 ? <span className="a-sub">No classes left that day.</span> : openClasses.map((c) => {
            const left = c.capacity - c.booked;
            return (
              <button key={c.id} type="button" className={`a-slot ${pick === c.id ? 'on' : ''}`} disabled={left <= 0} onClick={() => setPick(c.id)}>
                {timeOf(c.startsAt)} {c.name} · {left <= 0 ? 'full' : `${left} left`}</button>
            );
          })
        ) : !coach ? <span className="a-sub">Pick a coach to see their free times.</span> : slots.length === 0 ? <span className="a-sub">No hours set for that day.</span> : slots.map((s) => (
          <button key={s.at} type="button" className={`a-slot ${pick === s.at ? 'on' : ''}`} disabled={!s.free} onClick={() => setPick(s.at)}>{timeOf(s.at)}</button>
        ))}
      </div>
      <button type="button" className="a-btn amber" style={{ marginTop: 12 }} disabled={busy || !member || !(chosenClass || chosenSlot)} onClick={() => void book()} data-desk-book-go>
        <Check size={15} />{member && chosenClass ? `Book ${member.name.split(' ')[0]} into ${chosenClass.name} · ${timeOf(chosenClass.startsAt)}`
          : member && chosenSlot ? `Book ${member.name.split(' ')[0]} a 1-on-1 · ${timeOf(chosenSlot.at)}` : 'Pick a member and a time'}
      </button>
      <div className="a-sub" style={{ marginTop: 6 }}>A desk booking is confirmed at once — the member is told.</div>
    </div>
  );
}
