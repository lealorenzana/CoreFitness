import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * An anchored panel that escapes its scroll container.
 *
 * Both pickers live inside modals whose body is `overflow-y-auto`. An
 * absolutely-positioned dropdown inside one of those is **clipped** by it — the
 * calendar would simply be cut off at the modal's edge. So the panel is
 * portalled to `document.body` and positioned from the trigger's bounding rect
 * instead.
 *
 * Position is recomputed on scroll and resize (capture phase, so it catches the
 * modal's own scrolling too), because a fixed panel does not travel with an
 * anchor that moves.
 *
 * `useLayoutEffect` rather than `requestAnimationFrame`: rAF does not fire on a
 * page that isn't compositing, and a panel that measures itself one frame late
 * visibly jumps.
 */

export interface PopoverProps {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Panel width in px. Matched to the anchor when omitted. */
  width?: number;
}

const GAP = 6;
const MARGIN = 8;

export default function Popover({ anchor, open, onClose, children, width }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;

    const place = () => {
      const a = anchor.getBoundingClientRect();
      const panel = panelRef.current;
      const w = width ?? a.width;
      const h = panel?.offsetHeight ?? 0;

      // Below by default; above when there isn't room and there is room up top.
      const roomBelow = window.innerHeight - a.bottom;
      const above = roomBelow < h + GAP + MARGIN && a.top > h + GAP + MARGIN;
      const top = above ? a.top - h - GAP : a.bottom + GAP;

      // Never let it run off the right edge of a narrow window.
      const left = Math.max(MARGIN, Math.min(a.left, window.innerWidth - w - MARGIN));
      setPos({ top, left });
    };

    place();
    // Capture phase: a scroll inside the modal body does not bubble to window.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, width, children]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // mousedown, not click: a click listener closes the panel before a button
    // inside it ever receives its own click event.
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown, true);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed rounded-xl shadow-2xl overflow-hidden"
      style={{
        // Above the modals, which sit at z-50 (Members, Trainers) and z-[200] (Events).
        zIndex: 300,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: width ?? anchor?.offsetWidth,
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        // Hidden until measured, so it never flashes at the top-left corner.
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body
  );
}
