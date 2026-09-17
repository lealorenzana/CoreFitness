import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import Avatar from '../../../components/ui/Avatar';
import { NocButton, StatusPill } from '../../../components/ui/noc';
import { progressService, type TrainerFeedback } from '../../../services/progressService';
import { notificationService } from '../../../services/notificationService';

/**
 * Notes a trainer has sent this member (Nocturne redesign).
 *
 * These are real `notifications` rows — when a trainer sends a recommendation
 * from their app it inserts one, and this reads them back. There is no separate
 * feedback table on purpose: two tables holding the same message would
 * eventually disagree with the bell.
 *
 * Tapping a note opens it in full, names the coach, marks it read, and offers
 * their profile and a booking.
 *
 * **The sheet renders only while open.** It used to sit in an always-mounted
 * `AnimatePresence` inside the portal with a `pointer-events-auto` backdrop —
 * the exact shape CLAUDE.md records leaving invisible descendants over the whole
 * screen, because an exiting child that never unmounts keeps eating taps.
 * Animation is decoration here; nothing waits for it.
 *
 * The prototype's closing line said notes are "written after a session". That is
 * not a rule this app has — a coach can send one at any time — so it is not said.
 */
export default function TrainerFeedbackTab() {
  const memberId = useMemberId();
  const navigate = useNavigate();
  const [items, setItems] = useState<TrainerFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<TrainerFeedback | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await progressService.getTrainerFeedback(memberId);
        if (!cancelled) setItems(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [memberId]);

  const openNote = (note: TrainerFeedback) => {
    setOpen(note);
    // Reading it here counts everywhere — the same row backs the bell.
    if (!note.read) {
      setItems((list) => list.map((n) => (n.id === note.id ? { ...n, read: true } : n)));
      void notificationService.markAsRead(memberId, note.id).catch(() => {});
    }
  };

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;

  if (items.length === 0) {
    return (
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
        No notes from a coach yet. When one sends you a recommendation, it appears here and in your updates.
      </p>
    );
  }

  const modalRoot = document.getElementById('modal-root');
  const dated = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <>
      <div className="flex flex-col" style={{ gap: 14 }}>
        {items.map((f, i) => {
          // The newest note is filled, older ones sit on the page — the one
          // most likely to matter reads first without a label saying so.
          const newest = i === 0;
          return (
            <button
              key={f.id}
              onClick={() => openNote(f)}
              className="w-full text-left"
              style={{
                padding: 15,
                borderRadius: 12,
                background: newest ? 'var(--color-surface)' : 'transparent',
                boxShadow: newest ? 'var(--shadow-panel)' : '0 0 0 1px rgba(233, 233, 237, 0.08)',
              }}
            >
              <span className="flex items-center justify-between" style={{ gap: 10, fontSize: 12 }}>
                <span className="flex items-center min-w-0" style={{ gap: 8 }}>
                  <span className="truncate" style={{ color: newest || !f.read ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>
                    {f.trainerName ?? 'Your coach'}
                  </span>
                  {!f.read && <StatusPill label="New" tone="action" />}
                </span>
                <span className="flex-none" style={{ color: 'var(--color-text-muted)' }}>{dated(f.sentAt)}</span>
              </span>
              <span className="block line-clamp-3" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.55, color: 'var(--color-text-primary)' }}>
                {f.content}
              </span>
            </button>
          );
        })}
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          Notes come from your coaches. Reply at the desk or in your next session — this is not a chat.
        </p>
      </div>

      {modalRoot && open && createPortal(
        <div className="absolute inset-0 pointer-events-auto">
          <div onClick={() => setOpen(null)} className="absolute inset-0" style={{ background: 'rgba(8, 8, 14, 0.78)' }} />
          <div
            role="dialog" aria-modal="true" aria-label="Note from your coach"
            className="absolute inset-x-0 bottom-0"
            style={{
              background: 'var(--color-surface)',
              borderRadius: '20px 20px 0 0',
              boxShadow: '0 -1px 0 rgba(233, 233, 237, 0.18), 0 -18px 44px rgba(0, 0, 0, 0.6)',
              padding: '12px var(--gutter) calc(28px + env(safe-area-inset-bottom))',
            }}
          >
            <div aria-hidden className="mx-auto" style={{ width: 42, height: 4, borderRadius: 2, background: 'rgba(233, 233, 237, 0.25)' }} />
            <div className="flex items-start justify-between" style={{ gap: 12, marginTop: 14 }}>
              <div className="flex items-center min-w-0" style={{ gap: 12 }}>
                <Avatar name={open.trainerName ?? 'Coach'} photoUrl={null} size={42} />
                <div className="min-w-0">
                  <p className="truncate" style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{open.trainerName ?? 'Your coach'}</p>
                  <p style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
                    {new Date(open.sentAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {' · '}
                    {new Date(open.sentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close" className="grid place-items-center flex-none"
                style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(233, 233, 237, 0.14)', color: 'var(--color-text-secondary)' }}>
                <X size={16} />
              </button>
            </div>

            {/* The whole note, wrapped — no clamp; this is the point of opening
                it. `pre-wrap` keeps the coach's own line breaks. */}
            <p className="whitespace-pre-wrap" style={{ fontSize: 14.5, marginTop: 18, lineHeight: 1.6, color: 'var(--color-text-primary)' }}>
              {open.content}
            </p>

            <div className="flex" style={{ gap: 9, marginTop: 22 }}>
              {open.trainerId && (
                <NocButton variant="ghost" className="flex-1"
                  onClick={() => { setOpen(null); navigate(`/member/trainer/${open.trainerId}`); }}>
                  Profile
                </NocButton>
              )}
              <NocButton variant="action" className="flex-1"
                onClick={() => {
                  setOpen(null);
                  navigate('/member/book-class', open.trainerId ? { state: { trainerId: open.trainerId } } : undefined);
                }}>
                Book a session
              </NocButton>
            </div>
          </div>
        </div>,
        modalRoot,
      )}
    </>
  );
}
