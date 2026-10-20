import AddTrainerWizard from '../components/trainers/AddTrainerWizard';
import EditTrainerModal from '../components/trainers/EditTrainerModal';
import CredentialReview from '../components/trainers/CredentialReview';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { addDays, todayKey } from '../utils/dates';
import { useCallback, useEffect, useState } from 'react';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TrainerDetailDrawer from '../components/ui/TrainerDetailDrawer';
import TrainerMonthTotals from '../components/ui/TrainerMonthTotals';
import { DotMenu } from '../components/ui/rd';
import { usePaged } from '../hooks/usePaged';
import { useFitRows } from '../hooks/useFitRows';
import { Av, Pager } from './attendance/parts';
import './attendance/att.css';
import { listCoachings } from '../lib/api/coaching';
import { currentLockoutReason } from '../lib/api/accountEvents';
import { CalendarRange, X, Archive, UserX, UserCheck, Users, ShieldCheck, Plus, Pencil, Eye, ChevronUp, ChevronDown, Search, SquareCheck, AlertTriangle } from 'lucide-react';
import { showToast } from '../utils/toast';
import {
  listTrainers,
  listArchivedTrainers,
  setTrainerStatus,
  getRatingSummaries,
  getTrainerMonths,
} from '../lib/api/trainers';
import { listAllAvailability } from '../lib/api/trainerAvailability';
import type { ProfileStatus } from '../types/db';
import { goalsFor } from '../lib/coachGoals';

interface TrainerDisplay {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  specialization: string;
  email: string;
  phone: string | null;
  bio: string | null;
  photoUrl: string | null;
  /** Free-text weekday labels from `trainer_profiles.availability` — display
   *  only. The hours members actually book live in `trainer_availability`. */
  availabilityDays: string[];
  /** Background from 0041. All optional, all the trainer's own statement —
   *  the admin can fill them in for a coach who has not opened the app yet. */
  yearsExperience: number | null;
  certifications: string[];
  focusAreas: string[];
  achievements: string | null;
  /** The **public** figure: null until three members have evaluated (0066).
   *  Kept so the admin can see what a member sees. */
  ratingAverage: number | null;
  /** The gym's own figure, from `trainer_evaluation_months` — never withheld.
   *  0042 hid this from the admin too; 0066 reverses that deliberately, because
   *  a gym that cannot read its own evaluations cannot act on them. */
  gymAverage: number | null;
  /** The most recent month evaluated, for "is this current or from March?". */
  latestPeriod: string | null;
  ratingCount: number;
  /** How many real bookable-hour windows this trainer has set (0015). */
  bookableWindows: number;
  status: ProfileStatus;
}

const TRAINERS_PER_PAGE = 8;
type TSortKey = 'name' | 'specialty' | 'credentials' | 'rating' | 'windows' | 'status';


const REASONS = ['Missed classes', 'On leave', 'Conduct', 'Credentials lapsed', 'Other'];

/**
 * Suspending a coach (2026-10-20, from the owner's mock-up): a reason is required
 * (set_account_status refuses a blank one), picked in a tap or written out, and
 * the desk is told what is still booked with them — those stay, so reassign first.
 */
function SuspendCoachDialog({ coach, onClose, onConfirm }: { coach: TrainerDisplay; onClose: () => void; onConfirm: (why: string) => void }) {
  const [why, setWhy] = useState('');
  const [tag, setTag] = useState('');
  const [booked, setBooked] = useState<{ classes: number; sessions: number } | null>(null);
  useEffect(() => {
    void (async () => {
      const now = new Date().toISOString();
      const [c, s] = await Promise.all([
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('trainer_id', coach.id).gte('scheduled_at', now),
        supabase.from('pt_sessions').select('id', { count: 'exact', head: true }).eq('trainer_id', coach.id).gte('starts_at', now).in('status', ['pending', 'approved', 'confirmed']),
      ]);
      setBooked({ classes: c.count ?? 0, sessions: s.count ?? 0 });
    })();
  }, [coach.id]);
  const text = [tag && tag !== 'Other' ? tag : '', why.trim()].filter(Boolean).join(' — ');
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(5,4,10,0.72)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="att" style={{ height: 'auto', overflow: 'visible', width: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="a-card glow" role="dialog" aria-label={`Suspend ${coach.name}`} data-suspend-coach>
          <div className="a-ct"><h3><AlertTriangle size={16} style={{ color: 'var(--a-a300)' }} />Suspend {coach.name}</h3>
            <button type="button" className="a-link" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
          <div className="a-sub" style={{ lineHeight: 1.5, fontSize: 12 }}>
            They can’t sign in to the trainer app.{' '}
            {booked == null ? 'Checking what is booked with them…'
              : booked.classes + booked.sessions === 0 ? 'Nothing is booked with them.'
                : <>Their {booked.classes} upcoming class{booked.classes === 1 ? '' : 'es'} and {booked.sessions} booked session{booked.sessions === 1 ? '' : 's'} stay — <b style={{ color: '#fff' }}>reassign them first</b> or the desk handles them.</>}
          </div>
          <div className="a-lbl" style={{ margin: '12px 0 6px' }}>Why? <span style={{ color: 'var(--a-a300)' }}>*</span></div>
          <div className="flex gap-1.5 flex-wrap">
            {REASONS.map((r) => <button key={r} type="button" className={`a-chip ${tag === r ? 'on' : ''}`} onClick={() => setTag(tag === r ? '' : r)} aria-pressed={tag === r}>{r}</button>)}
          </div>
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} maxLength={280} aria-label="Reason for suspension"
            placeholder="Missed three classes without notice this month." className="a-input" style={{ marginTop: 8, width: '100%', resize: 'none', fontSize: 12.5 }} />
          <div className="a-sub" style={{ marginTop: 6 }}>Kept on their account history, so the next admin knows why.{tag === 'Other' && !why.trim() ? ' Say what happened.' : ''}</div>
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <button type="button" className="a-btn ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="button" className="a-btn amber" style={{ flex: 1 }} disabled={!text || (tag === 'Other' && !why.trim())} onClick={() => onConfirm(text)}>Suspend</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Trainers() {
  /** Sessions and classes each coach delivered in a month (0095). */
  const [showTotals, setShowTotals] = useState(false);
  const [trainers, setTrainers] = useState<TrainerDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  /** The coach being edited — EditTrainerModal, the same sections as Add (2026-10-20). */
  const [editing, setEditing] = useState<TrainerDisplay | null>(null);
  const [toSuspend, setToSuspend] = useState<TrainerDisplay | null>(null);
  const [toArchive, setToArchive] = useState<TrainerDisplay | null>(null);
  /** trainer id → their verified credentials in date (0054/0160), for the mark on each card. */
  const [verified, setVerified] = useState<Map<string, { title: string; expiresOn: string | null }[]>>(new Map());
  /** trainer id → certificates waiting for the owner's decision: "Needs review" on the card. */
  const [pending, setPending] = useState<Map<string, number>>(new Map());
  /** Ticked rows, for suspending or archiving several at once. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<'suspend' | 'archive' | 'restore' | null>(null);
  const [tSort, setTSort] = useState<{ key: TSortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  /** The roster's chips (2026-10-20 redesign). */
  const [chip, setChip] = useState<'all' | 'active' | 'suspended' | 'nohours'>('all');
  /** Tick boxes show only while selecting, so the everyday table stays clean. */
  const [selecting, setSelecting] = useState(false);
  /** What the cards and columns add: bookable hours a week, active trainees, the last coach check-in,
   *  why a suspended coach is suspended, and this month's classes and PT sessions. Each optional. */
  const [extra, setExtra] = useState<{ hours: Map<string, number>; trainees: Map<string, number>; lastIn: Map<string, string>; reasons: Map<string, string>; month: { classes: number; pt: number } | null }>(
    { hours: new Map(), trainees: new Map(), lastIn: new Map(), reasons: new Map(), month: null });
  // Credentials are a view of this page (2026-10-10), in the address so /credentials can land on it.
  const [params, setParams] = useSearchParams();
  const reviewing = params.get('view') === 'credentials';
  const setReviewing = (on: boolean) => setParams(on ? { view: 'credentials' } : {}, { replace: true });

  const loadTrainers = useCallback(async () => {
    setLoading(true);
    void (async () => {
      // Admin reads every row (0054); members see the same set through public_trainer_credentials.
      const full = await supabase.from('trainer_credentials').select('trainer_id, title, expires_on').eq('status', 'verified');
      // Before 0160 there is no expires_on: the titles alone, all counted as in date.
      const { data } = full.error ? await supabase.from('trainer_credentials').select('trainer_id, title').eq('status', 'verified') : full;
      const today = todayKey();
      const map = new Map<string, { title: string; expiresOn: string | null }[]>();
      for (const c of ((data ?? []) as { trainer_id: string; title: string; expires_on?: string | null }[])) {
        if (c.expires_on && c.expires_on < today) continue;
        map.set(c.trainer_id, [...(map.get(c.trainer_id) ?? []), { title: c.title, expiresOn: c.expires_on ?? null }]);
      }
      setVerified(map);
      const { data: waiting } = await supabase.from('trainer_credentials').select('trainer_id').eq('status', 'pending');
      const counts = new Map<string, number>();
      for (const c of (waiting ?? []) as { trainer_id: string }[]) counts.set(c.trainer_id, (counts.get(c.trainer_id) ?? 0) + 1);
      setPending(counts);
    })();
    try {
      // Bookable-hour windows come from the real table, in one query for the
      // whole roster — the card needs to say whether a trainer is actually
      // bookable, and the CSV on trainer_profiles cannot answer that.
      const [rows, availability, scores, months] = await Promise.all([
        showArchived ? listArchivedTrainers() : listTrainers(),
        listAllAvailability().catch(() => []),
        // Degrades to an empty map rather than failing the roster: the gym needs
        // its trainer list far more than it needs the scores on it.
        getRatingSummaries().catch(() => new Map()),
        getTrainerMonths().catch(() => []),
      ]);

      // Weighted by how many evaluations each month carried — a month with one
      // 5 and a month with nine 3s do not deserve equal say in the overall.
      const gymScore = new Map<string, { sum: number; n: number; latest: string }>();
      for (const m of months) {
        const at = gymScore.get(m.trainer_id) ?? { sum: 0, n: 0, latest: m.period };
        at.sum += m.average_stars * m.evaluations;
        at.n += m.evaluations;
        if (m.period > at.latest) at.latest = m.period;
        gymScore.set(m.trainer_id, at);
      }
      const windowsByTrainer = new Map<string, number>();
      const hours = new Map<string, number>();
      const hm = (t: string) => { const [h, m] = t.split(':').map(Number); return h + (m || 0) / 60; };
      for (const a of availability) {
        windowsByTrainer.set(a.trainer_id, (windowsByTrainer.get(a.trainer_id) ?? 0) + 1);
        hours.set(a.trainer_id, (hours.get(a.trainer_id) ?? 0) + Math.max(0, hm(a.end_time) - hm(a.start_time)));
      }
      void (async () => {
        const [coachings, checks, summary] = await Promise.all([
          listCoachings(),
          supabase.from('coach_checkins').select('trainer_id, check_in_time').order('check_in_time', { ascending: false }).limit(500),
          supabase.rpc('trainer_month_summary', { p_month: `${todayKey().slice(0, 7)}-01` }),
        ]);
        const trainees = new Map<string, number>();
        for (const c of coachings ?? []) if (c.status === 'active') trainees.set(c.trainer_id, (trainees.get(c.trainer_id) ?? 0) + 1);
        const lastIn = new Map<string, string>();
        for (const r of ((checks.data ?? []) as { trainer_id: string; check_in_time: string }[])) if (!lastIn.has(r.trainer_id)) lastIn.set(r.trainer_id, r.check_in_time);
        const sum = summary.error ? null : ((summary.data ?? []) as { classes_led: number; pt_sessions: number }[])
          .reduce((acc, r) => ({ classes: acc.classes + Number(r.classes_led || 0), pt: acc.pt + Number(r.pt_sessions || 0) }), { classes: 0, pt: 0 });
        const reasons = new Map<string, string>();
        for (const { profile } of rows) {
          if (profile.status !== 'suspended') continue;
          const why = await currentLockoutReason(profile.id);
          if (why) reasons.set(profile.id, why);
        }
        setExtra({ hours, trainees, lastIn, reasons, month: sum });
      })();

      setTrainers(
        rows.map(({ profile, trainer }) => ({
          id: profile.id,
          name: `${profile.first_name} ${profile.last_name}`.trim(),
          firstName: profile.first_name ?? '',
          lastName: profile.last_name ?? '',
          specialization: trainer.specialization || 'General Training',
          email: profile.email,
          phone: profile.phone,
          bio: trainer.bio,
          photoUrl: profile.photo_url,
          ratingAverage: scores.get(profile.id)?.average_stars ?? null,
          gymAverage: (() => {
            const g = gymScore.get(profile.id);
            return g && g.n > 0 ? Math.round((g.sum / g.n) * 10) / 10 : null;
          })(),
          latestPeriod: gymScore.get(profile.id)?.latest ?? null,
          ratingCount: scores.get(profile.id)?.rating_count ?? 0,
          yearsExperience: trainer.years_experience ?? null,
          certifications: trainer.certifications ?? [],
          focusAreas: trainer.focus_areas ?? [],
          achievements: trainer.achievements ?? null,
          availabilityDays: trainer.availability
            ? trainer.availability.split(',').map((d) => d.trim()).filter(Boolean)
            : [],
          bookableWindows: windowsByTrainer.get(profile.id) ?? 0,
          status: profile.status,
        }))
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load trainers', 'error');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { void (async () => { await loadTrainers(); })(); }, [loadTrainers]);

  const visible = trainers.filter((t) => {
    const q = search.trim().toLowerCase();
    if (chip === 'active' && t.status !== 'active') return false;
    if (chip === 'suspended' && t.status !== 'suspended') return false;
    if (chip === 'nohours' && !(t.bookableWindows === 0 && t.status === 'active')) return false;
    return (
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      t.specialization.toLowerCase().includes(q)
    );
  });

  const sortedTrainers = [...visible].sort((a, b) => {
    const dir = tSort.dir === 'asc' ? 1 : -1;
    switch (tSort.key) {
      case 'specialty': return dir * a.specialization.localeCompare(b.specialization);
      case 'credentials': return dir * ((verified.get(a.id)?.length ?? 0) - (verified.get(b.id)?.length ?? 0));
      case 'rating': return dir * ((a.gymAverage ?? -1) - (b.gymAverage ?? -1));
      case 'windows': return dir * (a.bookableWindows - b.bookableWindows);
      case 'status': return dir * a.status.localeCompare(b.status);
      default: return dir * a.name.localeCompare(b.name);
    }
  });
  const { ref: fitRef, perPage: fitPer, rowHeight: fitRowHeight } = useFitRows(TRAINERS_PER_PAGE);
  const paged = usePaged(sortedTrainers, fitPer);

  /**
   * Suspend / reactivate / archive.
   *
   * A coach who left the gym stayed on the roster with a working login forever
   * until these existed. Archive keeps every class and session they ever ran —
   * a delete would orphan them.
   */
  const changeStatus = async (trainer: TrainerDisplay, status: ProfileStatus, message: string, reason?: string) => {
    try {
      await setTrainerStatus(trainer.id, status, reason);
      showToast(message, 'success');
      setToSuspend(null);
      setToArchive(null);
      await loadTrainers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update that account', 'error');
    }
  };
  /** The same, for every coach ticked in the table — one confirmation with the real count. */
  const runBulk = async (reason?: string) => {
    if (!bulk) return;
    const chosen = trainers.filter((t) => picked.has(t.id));
    const next: ProfileStatus = bulk === 'suspend' ? 'suspended' : bulk === 'archive' ? 'archived' : 'active';
    let done = 0;
    for (const t of chosen) {
      try { await setTrainerStatus(t.id, next, reason); done += 1; } catch { /* counted below */ }
    }
    showToast(`${done} of ${chosen.length} ${bulk === 'suspend' ? 'suspended' : bulk === 'archive' ? 'archived' : 'restored'}`, done === chosen.length ? 'success' : 'error');
    setBulk(null); setPicked(new Set());
    await loadTrainers();
  };

  const openEdit = (trainer: TrainerDisplay) => setEditing(trainer);

  const waitingTotal = [...pending.values()].reduce((a, b) => a + b, 0);
  if (reviewing) {
    return (
      <div className="att" data-credentials-view>
        <div className="a-head">
          <div className="min-w-0">
            <h1>Credentials</h1>
            <p>Coaches&rsquo; certificates — look at each document, then verify or reject it.{waitingTotal ? ` ${waitingTotal} waiting.` : ''}</p>
          </div>
          <nav className="a-tabs" aria-label="Trainers views">
            <a href="#" onClick={(e) => { e.preventDefault(); setReviewing(false); setShowArchived(false); }}><Users size={14} />Coaches<em>{trainers.length}</em></a>
            <a href="#" className="on" onClick={(e) => e.preventDefault()}><ShieldCheck size={14} />Credentials{waitingTotal > 0 && <em>{waitingTotal}</em>}</a>
            <a href="#" onClick={(e) => { e.preventDefault(); setReviewing(false); setShowArchived(true); }}><Archive size={14} />Archived</a>
          </nav>
        </div>
        <CredentialReview onChanged={loadTrainers}
          coaches={trainers.filter((x) => x.status === 'active').map((x) => ({ id: x.id, name: x.name, photoUrl: x.photoUrl }))} />
      </div>
    );
  }

  const pageIds = paged.visible.map((t) => t.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => picked.has(id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const activeN = trainers.filter((t) => t.status === 'active').length;
  const suspendedN = trainers.filter((t) => t.status === 'suspended').length;
  const noHours = trainers.filter((t) => t.bookableWindows === 0 && t.status === 'active');
  const weekHours = trainers.reduce((a, t) => a + (extra.hours.get(t.id) ?? 0), 0);
  const withHours = trainers.filter((t) => (extra.hours.get(t.id) ?? 0) > 0).length;
  const firstWaiting = [...pending.entries()][0];
  const firstWaitingName = firstWaiting ? trainers.find((t) => t.id === firstWaiting[0])?.name.split(' ')[0] : null;
  const head = (label: string, key: TSortKey) => (
    <button type="button" onClick={() => setTSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))}
      className="inline-flex items-center gap-1 uppercase" style={{ color: tSort.key === key ? 'var(--a-p300)' : 'inherit', letterSpacing: 'inherit' }}>
      {label}{tSort.key === key && (tSort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
    </button>
  );
  const lastIn = (iso: string | undefined) => {
    if (!iso) return '—';
    const d = Math.round((new Date(`${todayKey()}T00:00:00`).getTime() - new Date(`${iso.slice(0, 10)}T00:00:00`).getTime()) / 86_400_000);
    return d <= 0 ? `Today ${new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}` : d === 1 ? 'Yesterday' : `${d} days ago`;
  };

  return (
    <div className="att" data-trainers>
      <TrainerMonthTotals isOpen={showTotals} onClose={() => setShowTotals(false)} />
      <div className="a-head">
        <div className="min-w-0">
          <h1>{showArchived ? 'Archived trainers' : 'Trainers'}</h1>
          <p>{showArchived ? 'Classes and sessions they ran are kept.' : `${trainers.length} coach${trainers.length === 1 ? '' : 'es'} · ${activeN} active${waitingTotal ? ` · ${waitingTotal} credential${waitingTotal === 1 ? '' : 's'} to review` : ''}`}</p>
        </div>
        <nav className="a-tabs" aria-label="Trainers views">
          <a href="#" className={!showArchived ? 'on' : ''} onClick={(e) => { e.preventDefault(); setShowArchived(false); setPicked(new Set()); }}><Users size={14} />Coaches{!showArchived && <em>{trainers.length}</em>}</a>
          <a href="#" onClick={(e) => { e.preventDefault(); setReviewing(true); }}><ShieldCheck size={14} />Credentials{waitingTotal > 0 && <em>{waitingTotal}</em>}</a>
          <a href="#" className={showArchived ? 'on' : ''} onClick={(e) => { e.preventDefault(); setShowArchived(true); setPicked(new Set()); }}><Archive size={14} />Archived</a>
        </nav>
        <button type="button" className="a-btn" onClick={() => setShowTotals(true)}><CalendarRange size={15} />Monthly totals</button>
        <button type="button" className="a-btn violet" onClick={() => setShowAddModal(true)}><Plus size={15} />Add trainer</button>
      </div>

      {!showArchived && (
        <div className="a-grid flex-none" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }} data-trainer-cards>
          <button type="button" className="a-card press text-left" onClick={() => { setChip('active'); paged.setPage(1); }}>
            <div className="a-lbl">Active coaches</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><div className="a-num">{activeN}</div><span className="a-sub">of {trainers.length}{suspendedN ? ` · ${suspendedN} suspended` : ''}</span></div>
          </button>
          {/* "Bookable" counts real trainer_availability windows — the weekday blurb produces no slots. */}
          <button type="button" className="a-card press text-left" onClick={() => { setChip('nohours'); paged.setPage(1); }}>
            <div className="a-lbl">Bookable this week</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><div className="a-num">{Math.round(weekHours)}</div><span className="a-sub">hours across {withHours} coach{withHours === 1 ? '' : 'es'}</span></div>
            {noHours.length > 0 && <div className="a-sub" style={{ marginTop: 6, color: 'var(--a-a300)' }}>{noHours.length === 1 ? `${noHours[0].name.split(' ')[0]} has no hours set` : `${noHours.length} coaches have no hours set`}</div>}
          </button>
          <button type="button" className="a-card press text-left" style={waitingTotal ? { borderColor: '#3e310f' } : undefined} onClick={() => setReviewing(true)} data-review-card>
            <div className="a-lbl" style={waitingTotal ? { color: 'var(--a-a300)' } : undefined}>Credentials to review</div>
            <div className="a-num">{waitingTotal}</div>
            <div className="a-sub" style={{ marginTop: 6 }}>{waitingTotal ? <>{firstWaitingName ?? 'A coach'}{waitingTotal > 1 ? ` and ${waitingTotal - 1} more` : ''} · <span style={{ color: 'var(--a-a300)' }}>review now</span></> : 'nothing waiting'}</div>
          </button>
          <button type="button" className="a-card press text-left" onClick={() => setShowTotals(true)}>
            <div className="a-lbl">This month</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><div className="a-num">{extra.month ? extra.month.classes : '—'}</div><span className="a-sub">classes led{extra.month ? ` · ${extra.month.pt} PT session${extra.month.pt === 1 ? '' : 's'}` : ''}</span></div>
            <div className="a-sub" style={{ marginTop: 6 }}>for paying them — open Monthly totals</div>
          </button>
        </div>
      )}

      <div className="a-card" style={{ flex: 1 }} data-trainers-table>
        <div className="a-ct">
          {picked.size > 0 ? (
            <div className="flex items-center gap-2" data-trainer-bulk>
              <b style={{ fontSize: 13 }}>{picked.size} selected</b>
              {!showArchived && <button type="button" className="a-btn soft sm" onClick={() => setBulk('suspend')}><UserX size={12} />Suspend</button>}
              <button type="button" className="a-btn sm" onClick={() => setBulk(showArchived ? 'restore' : 'archive')}><Archive size={12} />{showArchived ? 'Restore' : 'Archive'}</button>
              <button type="button" className="a-link" onClick={() => setPicked(new Set())}>Clear</button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              {([['all', 'All', trainers.length], ['active', 'Active', activeN], ['suspended', 'Suspended', suspendedN], ['nohours', 'No hours set', noHours.length]] as [typeof chip, string, number][]).map(([k, l, n]) => (
                <button key={k} type="button" className={`a-chip ${chip === k ? 'v' : ''}`} onClick={() => { setChip(k); paged.setPage(1); }} data-chip={k}>{l} <em>{n}</em></button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 items-center">
            <label className="a-input sm" style={{ width: 230 }}><Search size={14} />
              <input value={search} onChange={(e) => { setSearch(e.target.value); paged.setPage(1); }} placeholder="Name or specialty…" aria-label="Search trainers" /></label>
            <button type="button" className={`a-btn sm ${selecting ? 'soft' : ''}`} onClick={() => { setSelecting(!selecting); setPicked(new Set()); }} data-select-mode><SquareCheck size={13} />{selecting ? 'Done' : 'Select'}</button>
          </div>
        </div>
        <div ref={fitRef} className="a-scroll" style={{ flex: 1 }}>
          <table className="a-table">
            <thead><tr>
              {selecting && <th style={{ width: 34 }}><input type="checkbox" aria-label="Select this page" checked={allOnPage}
                onChange={(e) => setPicked((s) => { const n = new Set(s); pageIds.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id))); return n; })} /></th>}
              <th>{head('Coach', 'name')}</th><th>{head('Credentials', 'credentials')}</th><th>{head('Rating', 'rating')}</th><th>{head('Bookable hours', 'windows')}</th>
              <th>Trainees</th><th>{head('Status', 'status')}</th><th>Last in</th><th />
            </tr></thead>
            <tbody>
              {!loading && paged.visible.map((trainer) => {
                const list = verified.get(trainer.id) ?? [];
                const soon = list.filter((c) => c.expiresOn && c.expiresOn <= addDays(todayKey(), 30)).length;
                const waiting = pending.get(trainer.id) ?? 0;
                const found = goalsFor({ specialization: trainer.specialization, bio: trainer.bio,
                  achievements: trainer.achievements, focus_areas: trainer.focusAreas, certifications: trainer.certifications });
                const hrs = extra.hours.get(trainer.id) ?? 0;
                const trainees = extra.trainees.get(trainer.id) ?? 0;
                return (
                  <tr key={trainer.id} data-trainer-row onClick={() => setViewingId(trainer.id)} style={{ cursor: 'pointer', height: paged.total > paged.perPage ? fitRowHeight : undefined }}>
                    {selecting && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${trainer.name}`} checked={picked.has(trainer.id)} onChange={() => toggle(trainer.id)} /></td>}
                    <td>
                      <div className="a-who"><Av name={trainer.name} photo={trainer.photoUrl} />
                        <div className="min-w-0"><b className="block truncate">{trainer.name}</b>
                          {/* The member app's "Find your coach" — lib/coachGoals.ts, identical in both apps. */}
                          <div className="a-sub truncate" data-tip={found.length ? `Members find them under: ${found.map((f) => f.goal.label).join(', ')}` : 'Not matched to a member goal yet'}>
                            {trainer.specialization}{trainer.yearsExperience != null ? ` · ${trainer.yearsExperience} yr${trainer.yearsExperience === 1 ? '' : 's'}` : ''}
                          </div></div></div>
                    </td>
                    <td onClick={(e) => { if (waiting) { e.stopPropagation(); setReviewing(true); } }}>
                      <span className="inline-flex flex-col items-start gap-1">
                        {list.length > 0 && <span className={`a-pill ${soon ? 'a' : 'v'}`} data-tip={`Verified by you: ${list.map((c) => c.title).join(', ')}`}>{list.length} verified{soon ? ` · ${soon} expiring` : ''}</span>}
                        {waiting > 0 && <span className="a-pill a" data-needs-review data-tip="Certificates waiting for you — verify or reject them">Needs review · {waiting}</span>}
                        {list.length === 0 && waiting === 0 && <span className="a-sub">None uploaded</span>}
                      </span>
                    </td>
                    {/* The gym's own figure, whatever the count; the line under it says what members see. */}
                    <td><b>{trainer.gymAverage != null ? `★ ${trainer.gymAverage.toFixed(1)}` : '—'}</b>
                      <div className="a-sub">{trainer.gymAverage == null ? 'no ratings yet' : trainer.ratingAverage == null ? `${trainer.ratingCount || 'few'} rating${trainer.ratingCount === 1 ? '' : 's'} · not public yet` : `${trainer.ratingCount} ratings`}</div></td>
                    <td>{trainer.bookableWindows > 0
                      ? <span>{trainer.bookableWindows} window{trainer.bookableWindows === 1 ? '' : 's'}{hrs ? ` · ${Math.round(hrs)} h/wk` : ''}</span>
                      : <span style={{ color: 'var(--a-a300)' }}>No hours set</span>}</td>
                    <td>{trainees} trainee{trainees === 1 ? '' : 's'}</td>
                    <td>
                      <span className={`a-pill ${trainer.status === 'active' ? 'v' : trainer.status === 'suspended' ? 'a' : ''}`}>{trainer.status === 'active' ? 'Active' : trainer.status.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}</span>
                      {trainer.status === 'suspended' && extra.reasons.get(trainer.id) && <div className="a-sub truncate" style={{ marginTop: 3, maxWidth: 170 }} data-suspend-reason>&ldquo;{extra.reasons.get(trainer.id)}&rdquo;</div>}
                    </td>
                    <td className="a-sub whitespace-nowrap">{lastIn(extra.lastIn.get(trainer.id))}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-1.5">
                        {!showArchived && (trainer.status === 'suspended'
                          ? <button type="button" className="a-btn soft sm" onClick={() => setToSuspend(trainer)}><UserCheck size={12} />Reactivate</button>
                          : <>
                            <button type="button" className="a-btn ghost sm" onClick={() => openEdit(trainer)}><Pencil size={12} />Edit</button>
                            <button type="button" className="a-btn ghost sm" onClick={() => setToSuspend(trainer)}><UserX size={12} />Suspend</button>
                          </>)}
                        {showArchived && <button type="button" className="a-btn sm" onClick={() => setToArchive(trainer)}><Archive size={12} />Restore</button>}
                        <DotMenu label={`More for ${trainer.name}`} items={[
                          { label: 'View profile', icon: Eye, onClick: () => setViewingId(trainer.id) },
                          { label: 'Edit trainer', icon: Pencil, onClick: () => openEdit(trainer), hidden: showArchived },
                          { label: 'Archive trainer', icon: Archive, onClick: () => setToArchive(trainer), tone: 'danger', hidden: showArchived },
                          { label: 'Review credentials', icon: ShieldCheck, onClick: () => setReviewing(true) },
                          { label: 'Monthly totals', icon: CalendarRange, onClick: () => setShowTotals(true) },
                        ]} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading ? <p className="a-sub text-center" style={{ padding: 30 }}>Loading trainers…</p>
            : visible.length === 0 && (
              <div className="a-sub text-center" style={{ padding: 30 }}>
                <b className="block text-white" style={{ fontSize: 14 }}>{search ? 'No trainer matches' : showArchived ? 'No archived trainers' : chip !== 'all' ? 'Nobody here' : 'No trainers yet'}</b>
                {search ? `Nothing matches “${search}”.` : showArchived ? 'Archived trainers keep every class and session they ever ran.' : chip !== 'all' ? '' : 'Add a coach and they get a login for the trainer app.'}
              </div>
            )}
        </div>
        <div className="a-sub" style={{ paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} data-rd-footer>
          <span>{paged.total ? `Showing ${(paged.page - 1) * paged.perPage + 1}–${Math.min(paged.total, paged.page * paged.perPage)} of ${paged.total} ${showArchived ? 'archived trainers' : 'trainers'} · ` : ''}click a coach to open their profile, classes, 1-on-1s, members and evaluations{selecting ? '' : ' · Select to suspend or archive several'}</span>
          <Pager page={paged.page} pages={paged.totalPages} onPage={paged.setPage} />
        </div>
      </div>

      <TrainerDetailDrawer trainerId={viewingId} onClose={() => setViewingId(null)} onChanged={loadTrainers} />

      {/* Suspending a coach (2026-10-19/20): why, in a word or a sentence, and what is still booked with them. */}
      {toSuspend && toSuspend.status !== 'suspended' && (
        <SuspendCoachDialog key={toSuspend.id} coach={toSuspend} onClose={() => setToSuspend(null)}
          onConfirm={(why) => void changeStatus(toSuspend, 'suspended', `${toSuspend.name} suspended — they can no longer log in`, why)} />
      )}

      <ConfirmDialog
        isOpen={bulk !== null}
        onClose={() => setBulk(null)}
        onConfirm={(why) => void runBulk(why)}
        reason={bulk === 'restore'
          ? { label: 'Note (optional)', placeholder: 'Back from leave on 1 November.' }
          : { label: bulk === 'suspend' ? 'Reason for suspension' : 'Reason for archiving', required: true,
              placeholder: bulk === 'suspend' ? 'Missed three classes without notice this month.' : 'Left the gym at the end of September.',
              hint: 'The same reason is kept on each coach’s account history.' }}
        title={bulk === 'suspend' ? 'Suspend trainers' : bulk === 'archive' ? 'Archive trainers' : 'Restore trainers'}
        message={bulk === 'suspend'
          ? `Suspend ${picked.size} trainer${picked.size === 1 ? '' : 's'}? They cannot log in to the trainer app; classes and booked sessions stay as they are. Reversible at any time.`
          : bulk === 'archive'
            ? `Archive ${picked.size} trainer${picked.size === 1 ? '' : 's'}? They drop off the roster and cannot log in; every class and session they ran is kept.`
            : `Restore ${picked.size} trainer${picked.size === 1 ? '' : 's'} to the active roster? They can log in again.`}
        confirmText={bulk === 'suspend' ? 'Suspend' : bulk === 'archive' ? 'Archive' : 'Restore'}
        type={bulk === 'restore' ? 'info' : bulk === 'archive' ? 'danger' : 'warning'}
      />


      <ConfirmDialog
        isOpen={!!toSuspend && toSuspend.status === 'suspended'}
        onClose={() => setToSuspend(null)}
        onConfirm={(why) => {
          if (!toSuspend) return;
          const next: ProfileStatus = toSuspend.status === 'suspended' ? 'active' : 'suspended';
          void changeStatus(
            toSuspend,
            next,
            next === 'suspended'
              ? `${toSuspend.name} suspended — they can no longer log in`
              : `${toSuspend.name} reactivated`,
            why,
          );
        }}
        /* Required to suspend, optional to reinstate — the database enforces the same (0069). */
        reason={toSuspend?.status === 'suspended'
          ? { label: 'Note (optional)', placeholder: 'Back from leave on 1 November.', hint: 'Kept on the account history.' }
          : { label: 'Reason for suspension', required: true, placeholder: 'Missed three classes without notice this month.',
              hint: 'Kept on the coach’s account history, so the next admin knows why.' }}
        title={toSuspend?.status === 'suspended' ? 'Reactivate Trainer' : 'Suspend Trainer'}
        message={
          toSuspend?.status === 'suspended'
            ? `Let ${toSuspend?.name ?? 'this trainer'} log in again? Their classes and sessions are untouched — this only restores access.`
            : `Suspend ${toSuspend?.name ?? 'this trainer'}? They will not be able to log in to the trainer app. Their classes and booked sessions stay exactly as they are, so anything already scheduled still needs handling at the desk. Reversible at any time.`
        }
        confirmText={toSuspend?.status === 'suspended' ? 'Reactivate' : 'Suspend'}
        type={toSuspend?.status === 'suspended' ? 'info' : 'warning'}
      />

      <ConfirmDialog
        isOpen={!!toArchive}
        onClose={() => setToArchive(null)}
        onConfirm={(why) => {
          if (!toArchive) return;
          void changeStatus(
            toArchive,
            showArchived ? 'active' : 'archived',
            showArchived
              ? `${toArchive.name} restored to the active roster`
              : `${toArchive.name} archived. Their classes and session history are kept.`,
            why,
          );
        }}
        title={showArchived ? 'Restore Trainer' : 'Archive Trainer'}
        message={
          showArchived
            ? `Restore ${toArchive?.name ?? 'this trainer'} to the active roster? They will be able to log in again.`
            : `Archive ${toArchive?.name ?? 'this trainer'}? They drop off the roster and can no longer log in, but every class they taught and every session they ran is kept — deleting them would orphan all of it. You can restore them later.`
        }
        confirmText={showArchived ? 'Restore' : 'Archive'}
        type={showArchived ? 'info' : 'danger'}
        reason={showArchived
          ? { label: 'Note (optional)', placeholder: 'Rejoined the team on 1 November.' }
          : { label: 'Reason for archiving', required: true, placeholder: 'Left the gym at the end of September.',
              hint: 'Kept with their classes and session history.' }}
      />

      {showAddModal && <AddTrainerWizard onClose={() => setShowAddModal(false)} onCreated={loadTrainers} />}

      {editing && <EditTrainerModal trainer={editing} onClose={() => setEditing(null)} onSaved={loadTrainers} />}
    </div>
  );
}
