import { useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'framer-motion';

/**
 * A list row you can swipe either way.
 *
 * Two things here are deliberate and easy to get wrong.
 *
 * **The action fires on `onDragEnd`, before any animation.** `onDragEnd` is a
 * pointer event, so it arrives whether or not the page is compositing; an
 * `onAnimationComplete` handler would silently never run on a backgrounded tab
 * and the swipe would appear to do nothing. The slide-away is decoration that
 * happens after the decision, never the thing that triggers it.
 *
 * **`dragDirectionLock` is required, not a nicety.** Without it a slightly
 * diagonal finger movement while scrolling the list grabs the row instead, and
 * the list becomes impossible to scroll on a real phone.
 */

const THRESHOLD = 72;

export default function SwipeRow({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  disabled = false,
}: {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Revealed as the row moves left (i.e. the row is dragged toward the left). */
  leftAction?: { icon: ReactNode; label: string; color: string };
  rightAction?: { icon: ReactNode; label: string; color: string };
  disabled?: boolean;
}) {
  const x = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  // Distinguishes a tap from the end of a drag, so releasing a swipe doesn't
  // also open the row.
  const moved = useRef(false);

  const rightOpacity = useTransform(x, [0, THRESHOLD], [0, 1]);
  const leftOpacity = useTransform(x, [-THRESHOLD, 0], [1, 0]);

  const handleEnd = (_: unknown, info: PanInfo) => {
    setDragging(false);
    const dx = info.offset.x;

    if (dx > THRESHOLD && onSwipeRight) {
      onSwipeRight();
      animate(x, 320, { duration: 0.18 });
      return;
    }
    if (dx < -THRESHOLD && onSwipeLeft) {
      onSwipeLeft();
      animate(x, -320, { duration: 0.18 });
      return;
    }
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 38 });
  };

  if (disabled) return <>{children}</>;

  return (
    <div className="relative overflow-hidden">
      {/* Action beds sit behind the row and light up as it moves over them. */}
      {rightAction && (
        <motion.div
          className="absolute inset-y-0 left-0 w-1/2 flex items-center justify-start px-5 gap-2 pointer-events-none"
          style={{ background: rightAction.color, opacity: rightOpacity }}
        >
          {rightAction.icon}
          <span className="text-xs font-bold text-black">{rightAction.label}</span>
        </motion.div>
      )}
      {leftAction && (
        <motion.div
          className="absolute inset-y-0 right-0 w-1/2 flex items-center justify-end px-5 gap-2 pointer-events-none"
          style={{ background: leftAction.color, opacity: leftOpacity }}
        >
          <span className="text-xs font-bold text-white">{leftAction.label}</span>
          {leftAction.icon}
        </motion.div>
      )}

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: onSwipeLeft ? -140 : 0, right: onSwipeRight ? 140 : 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        style={{ x, position: 'relative', touchAction: 'pan-y' }}
        onDragStart={() => { setDragging(true); moved.current = true; }}
        onDragEnd={handleEnd}
        // Cleared on the next tick so the click that follows a release is
        // swallowed, but ordinary taps still get through.
        onPointerDown={() => { moved.current = false; }}
        onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); moved.current = false; } }}
        className={dragging ? 'cursor-grabbing' : ''}
      >
        {children}
      </motion.div>
    </div>
  );
}
