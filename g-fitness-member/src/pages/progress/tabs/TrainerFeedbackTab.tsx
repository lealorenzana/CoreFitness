import { panelStyle } from '../../../components/ui/Card';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ChevronRight, X, CalendarPlus, User } from 'lucide-react';
import { useMemberId } from '../hooks/useMemberId';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import Avatar from '../../../components/ui/Avatar';
import { Pill } from '../../../components/ui/StatCard';
import { progressService, type TrainerFeedback } from '../../../services/progressService';
import { notificationService } from '../../../services/notificationService';

/**
 * Notes a trainer has sent this member.
 *
 * These are real `notifications` rows — when a trainer sends a recommendation
 * from their app it inserts one, and this reads them back. There is no separate
 * feedback table on purpose: two tables holding the same message would
 * eventually disagree, and the member would see one version in their bell and a
 * different one here.
 *
 * The cards used to be inert blocks of text with the message clipped to two
 * lines and no way to read the rest — a long note from a coach was literally
 * unreadable. Tapping one now opens it in full, names the trainer who wrote it,
 * marks it read, and offers to book with them.
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
    // Reading it here counts everywhere — the same row backs the bell, so
    // leaving it unread would keep a badge for something already read.
    if (!note.read) {
      setItems((list) => list.map((n) => (n.id === note.id ? { ...n, read: true } : n)));
      void notificationService.markAsRead(memberId, note.id).catch(() => {});
    }
  };

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;

  if (items.length === 0) {
    return <EmptyState icon={MessageSquare} title="No trainer notes yet"
      message="When a trainer sends you a recommendation, it appears here and in your notifications." />;
  }

  const modalRoot = typeof document !== 'undefined' ? document.getElementById('modal-root') : null;

  return (
    <>
      <div className="space-y-2">
        {items.map((f) => (
          <button
            key={f.id}
            onClick={() => openNote(f)}
            className="w-full p-4 text-left flex items-start gap-3 active:scale-[0.99] transition-transform"
            style={{
              ...panelStyle,
              borderRadius: 'var(--radius-panel)',
              // Unread notes carry the same violet wash as the bell, so the two
              // surfaces agree about what is new.
              background: f.read ? 'var(--color-surface-raised)' : 'var(--color-primary-light)',
            }}
          >
            <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: f.read ? 'var(--color-surface-high)' : 'var(--color-primary)' }}>
              <MessageSquare size={15} style={{ color: f.read ? 'var(--color-text-secondary)' : '#fff' }} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="block text-sm font-semibold text-white truncate">
                  {f.trainerName ?? 'Your trainer'}
                </span>
                {!f.read && <Pill label="New" tone="secondary" />}
              </span>
              <span className="block text-xs mt-1 leading-relaxed line-clamp-2"
                style={{ color: 'var(--color-text-secondary)' }}>
                {f.content}
              </span>
              <span className="block text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                {new Date(f.sentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {' · tap to read'}
              </span>
            </span>

            <ChevronRight size={16} className="flex-shrink-0 mt-1" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        ))}
      </div>

      {modalRoot && createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setOpen(null)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm pointer-events-auto"
              />
              <motion.div
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                role="dialog" aria-modal="true" aria-label="Trainer note"
                // Flush to the bottom edge, full width. `max-w-md` + centring
                // left a margin down both sides on anything wider than 448px,
                // so the sheet floated in the middle of a black screen instead
                // of reading as a sheet rising from the bottom.
                className="absolute inset-x-0 bottom-0 pointer-events-auto"
              >
                <div className="p-5 pb-8" style={{
                  background: 'var(--color-surface-raised)',
                  borderTop: '1px solid var(--color-border)',
                  borderTopLeftRadius: 'var(--radius-panel)',
                  borderTopRightRadius: 'var(--radius-panel)',
                  boxShadow: 'var(--shadow-panel)',
                }}>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={open.trainerName ?? 'Trainer'} photoUrl={null} size={44} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {open.trainerName ?? 'Your trainer'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {new Date(open.sentAt).toLocaleDateString('en-US', {
                            weekday: 'long', month: 'long', day: 'numeric',
                          })}
                          {' · '}
                          {new Date(open.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setOpen(null)} aria-label="Close"
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
                      <X size={17} />
                    </button>
                  </div>

                  {/* The whole note, wrapped — no clamp. This is the point of
                      opening it. `whitespace-pre-wrap` keeps the coach's own
                      line breaks instead of running everything together. */}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ color: 'var(--color-text-primary)' }}>
                    {open.content}
                  </p>

                  <div className="flex gap-2 mt-6">
                    {open.trainerId && (
                      <button
                        onClick={() => { setOpen(null); navigate(`/member/trainer/${open.trainerId}`); }}
                        className="flex-1 h-11 rounded-full font-semibold text-sm flex items-center justify-center gap-2"
                        style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
                        <User size={15} /> Profile
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setOpen(null);
                        navigate('/member/book-class', open.trainerId ? { state: { trainerId: open.trainerId } } : undefined);
                      }}
                      className="flex-1 h-11 rounded-full font-semibold text-sm text-black flex items-center justify-center gap-2"
                      style={{ background: 'var(--color-secondary)' }}>
                      <CalendarPlus size={15} /> Book a session
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        modalRoot
      )}
    </>
  );
}
