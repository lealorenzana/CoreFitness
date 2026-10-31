import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, ChatCircleText, HourglassMedium } from '@phosphor-icons/react';
import { LineRow, NocButton, SeeAll, SectionHead } from '../../components/ui/noc';
import { SkeletonList } from '../../components/ui/Skeleton';
import MyPackage from '../../components/coaching/MyPackage';
import { getCurrentMemberId, isUpcoming, listMyBookings, type MyBooking } from '../../services/bookingService';
import { useT } from '../../lib/i18n';

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
  const navigate = useNavigate();
  const t = useT();
  const [rows, setRows] = useState<MyBooking[] | null | undefined>(undefined);

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

  const now = Date.now();
  const coming = (rows ?? []).filter((r) => isUpcoming(r, now)).sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  const past = (rows ?? []).filter((r) => !isUpcoming(r, now) && r.status === 'approved');
  const preview = [...coming.slice(0, 3), ...past.slice(0, Math.max(0, 4 - Math.min(coming.length, 3)))];

  const chat = (r: MyBooking) => r.trainerId && navigate(`/member/chat/${r.trainerId}`);

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <div>
        <SectionHead title={t('Your package')} />
        <MyPackage />
      </div>

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

      <div className="grid grid-cols-2" style={{ gap: 8 }}>
        <NocButton variant="fill" onClick={() => navigate('/member/book-session')}>{t('Book a session')}</NocButton>
        <NocButton variant="ghost" onClick={() => navigate('/member/trainers')}>{t('Find a coach')}</NocButton>
      </div>
    </div>
  );
}
