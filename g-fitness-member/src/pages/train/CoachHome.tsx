import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, ChatCircleText, HourglassMedium } from '@phosphor-icons/react';
import { LineRow, NocButton, SeeAll, SectionHead } from '../../components/ui/noc';
import { SkeletonList } from '../../components/ui/Skeleton';
import MyPackage from '../../components/coaching/MyPackage';
import type { Coaching } from '../../lib/api/coaching';
import { getCurrentMemberId, isUpcoming, listMyBookings, type MyBooking } from '../../services/bookingService';
import { useT } from '../../lib/i18n';
import { useBookingModes } from '../../hooks/useBookingModes';

const when = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : 'Not scheduled yet');

const STATE: Record<MyBooking['status'], string> = {
  pending: 'waiting for them to say yes', approved: 'confirmed', rejected: 'declined', cancelled: 'cancelled',
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

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await getCurrentMemberId();
        const list = id ? await listMyBookings(id) : [];
        if (alive) setRows(list.filter((r) => r.kind === 'pt'));
      } catch {
        if (alive) setRows(null);
      }
    })();
    return () => { alive = false; };
  }, []);

  const [now] = useState(() => Date.now()); // the moment the screen opened
  const coming = (rows ?? []).filter((r) => isUpcoming(r, now)).sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  const past = (rows ?? []).filter((r) => !isUpcoming(r, now) && r.status === 'approved');
  const preview = [...coming.slice(0, 3), ...past.slice(0, Math.max(0, 4 - Math.min(coming.length, 3)))];

  const chat = (r: MyBooking) => r.trainerId && navigate(`/member/chat/${r.trainerId}`);
  // With a package: the next session with this coach (or their stand-in), worded for the card.
  const mineCoaches = pkg ? [pkg.trainerId, ...(pkg.standin ? [pkg.standin.trainerId] : [])] : [];
  const nextWithCoach = pkg && rows ? coming.find((r) => r.trainerId && mineCoaches.includes(r.trainerId)) ?? null : undefined;
  const nextWords = nextWithCoach === undefined ? undefined
    : nextWithCoach ? `${when(nextWithCoach.startsAt)}${nextWithCoach.status === 'pending' ? ` · ${t('waiting for them to say yes')}` : ''}` : null;

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <div>
        <SectionHead title={pkg ? t('Your coach') : t('Your package')} />
        <MyPackage next={pkg ? nextWords : undefined} onCurrent={setPkg} />
      </div>

      {pkg ? (
        rows && rows.length > 0 && <SeeAll label={t('All your sessions')} count={rows.length} onClick={() => navigate('/member/sessions')} />
      ) : (
      <section aria-label={t('Your sessions')} data-coach-sessions>
        <SectionHead title={t('Your sessions')} />
        {rows === undefined ? <SkeletonList count={2} />
          : rows === null ? <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{t('Your sessions could not be loaded. Pull to try again.')}</p>
          : preview.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }} data-sessions-empty>{t('No sessions yet. Book one with any coach.')}</p>
          : preview.map((r, i) => {
            const ahead = isUpcoming(r, now);
            return (
              <LineRow key={r.id} last={i === preview.length - 1}
                icon={ahead ? (r.status === 'pending' ? HourglassMedium : CalendarCheck) : ChatCircleText}
                tone={ahead && r.status === 'approved' ? 'mine' : 'info'}
                title={when(r.startsAt)}
                meta={`${r.trainerName ? `${t('With')} ${r.trainerName}` : t('Your coach')} · ${ahead ? t(STATE[r.status]) : t('done')}`}
                action={r.trainerId ? <ChatCircleText size={20} aria-label={t('Chat')} /> : undefined} actionTone="structure"
                onClick={r.trainerId ? () => chat(r) : undefined} />
            );
          })}
        {rows && rows.length > 0 && <SeeAll label={t('All your sessions')} count={rows.length} onClick={() => navigate('/member/sessions')} />}
      </section>
      )}

      {ptOff ? (
        <p data-pt-booking-off style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
          {t('Your gym books 1-on-1 sessions at the front desk, not in the app.')}
        </p>
      ) : pkg ? (
        // On a package: one coach. Book with them (or their stand-in) only; Switch coach lives in Manage package.
        <div data-book-with-coach>
          <NocButton variant="fill" className="w-full"
            onClick={() => navigate('/member/book-session', { state: { trainerId: pkg.standin ? undefined : pkg.trainerId, onlyTrainers: mineCoaches } })}>
            {t('Book with')} {pkg.trainerName.split(' ')[0]}
          </NocButton>
        </div>
      ) : pkg === null && (
        <div className="grid grid-cols-2" style={{ gap: 8 }}>
          <NocButton variant="fill" onClick={() => navigate('/member/book-session')}>{t('Book a session')}</NocButton>
          <NocButton variant="ghost" onClick={() => navigate('/member/trainers')}>{t('Find a coach')}</NocButton>
        </div>
      )}
      {/* Booking off, no coach yet: the coaches are still there to find. */}
      {ptOff && pkg === null && (
        <NocButton variant="ghost" onClick={() => navigate('/member/trainers')}>{t('Find a coach')}</NocButton>
      )}
    </div>
  );
}
