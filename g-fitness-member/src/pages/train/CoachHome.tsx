import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, ChatCircleText, HourglassMedium } from '@phosphor-icons/react';
import { LineRow, SeeAll, SectionHead } from '../../components/ui/noc';
import SuggestedTimes from '../../components/coaching/SuggestedTimes';
import { SkeletonList } from '../../components/ui/Skeleton';
import MyPackage from '../../components/coaching/MyPackage';
import type { Coaching } from '../../lib/api/coaching';
import { getCurrentMemberId, isUpcoming, listMyBookings, type MyBooking } from '../../services/bookingService';
import { useT } from '../../lib/i18n';
import { useBookingModes } from '../../hooks/useBookingModes';

const when = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : 'Not scheduled yet');

// A session is asked for, then confirmed: "booking" is not a member's word (owner, 2026-11-24).
const STATE: Record<MyBooking['status'], string> = {
  pending: 'Asked', approved: 'Confirmed', rejected: 'Declined', cancelled: 'Cancelled',
};

/**
 * Train → Coach (simplify, 2026-10-28): personal training, in one place —
 * **your package** (its chat, how far through, paying, a stand-in, ending it:
 * what the Your coach page did), **your sessions** coming and the last few past
 * (each opens the chat with that coach — chat is for single sessions too), and
 * **Book a session** / **Find a coach**. My bookings and Rooms folded in here;
 * every session, with cancel, rebook and evaluate, is See all.
 */
export default function CoachHome() {
  const ptOff = useBookingModes()?.ptMode === 'off';
  const navigate = useNavigate();
  const t = useT();
  const [rows, setRows] = useState<MyBooking[] | null | undefined>(undefined);
  /** The package running now (2026-11-14): one coach, so one card — no session list, no Find a coach. */
  const [pkg, setPkg] = useState<Coaching | null | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const id = await getCurrentMemberId();
      const list = id ? await listMyBookings(id) : [];
      setRows(list.filter((r) => r.kind === 'pt'));
    } catch {
      setRows(null);
    }
  }, []);
  useEffect(() => { void (async () => { await reload(); })(); }, [reload]);

  const [now] = useState(() => Date.now()); // the moment the screen opened
  const coming = (rows ?? []).filter((r) => isUpcoming(r, now)).sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  const past = (rows ?? []).filter((r) => !isUpcoming(r, now) && r.status === 'approved');
  const preview = [...coming.slice(0, 3), ...past.slice(0, Math.max(0, 4 - Math.min(coming.length, 3)))];

  const chat = (r: MyBooking) => r.trainerId && navigate(`/member/chat/${r.trainerId}`);
  // With a package: the next session with this coach (or their stand-in), worded for the card.
  const mineCoaches = pkg ? [pkg.trainerId, ...(pkg.standin ? [pkg.standin.trainerId] : [])] : [];
  const nextWithCoach = pkg && rows ? coming.find((r) => r.trainerId && mineCoaches.includes(r.trainerId)) ?? null : undefined;
  const nextWords = nextWithCoach === undefined ? undefined
    : nextWithCoach ? `${when(nextWithCoach.startsAt)} · ${t(STATE[nextWithCoach.status])}` : null;

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <div>
        <SectionHead title={pkg ? t('Your coach') : t('Train with a coach')} />
        <MyPackage next={pkg ? nextWords : undefined} onCurrent={setPkg} />
      </div>

      {pkg && !ptOff && rows !== undefined && (
        <SuggestedTimes coaching={pkg} onAsked={() => void reload()} />
      )}

      {pkg ? (
        rows && rows.length > 0 && <SeeAll label={t('All your sessions')} count={rows.length} onClick={() => navigate('/member/sessions')} />
      ) : (
      <section aria-label={t('Your sessions')} data-coach-sessions>
        <SectionHead title={t('Your sessions')} />
        {rows === undefined ? <SkeletonList count={2} />
          : rows === null ? <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{t('Your sessions could not be loaded. Pull to try again.')}</p>
          : preview.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }} data-sessions-empty>{t('No sessions yet.')}</p>
          : preview.map((r, i) => {
            const ahead = isUpcoming(r, now);
            return (
              <LineRow key={r.id} last={i === preview.length - 1}
                icon={ahead ? (r.status === 'pending' ? HourglassMedium : CalendarCheck) : ChatCircleText}
                tone={ahead && r.status === 'approved' ? 'mine' : 'info'}
                title={when(r.startsAt)}
                meta={`${r.trainerName ? `${t('With')} ${r.trainerName}` : t('Your coach')} · ${ahead ? t(STATE[r.status]) : t('Done')}`}
                action={r.trainerId ? <ChatCircleText size={20} aria-label={t('Chat')} /> : undefined} actionTone="structure"
                onClick={r.trainerId ? () => chat(r) : undefined} />
            );
          })}
        {rows && rows.length > 0 && <SeeAll label={t('All your sessions')} count={rows.length} onClick={() => navigate('/member/sessions')} />}
      </section>
      )}

      {/* The package card asks for a session; without one, MyPackage shows the gym's two ways in. A second
          "Book with" button here read as buying something new (owner, 2026-11-24). */}
    </div>
  );
}
