import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Sparkle } from '@phosphor-icons/react';
import ChatbotPopup from './ChatbotPopup';

/**
 * Draggable floating chathead — like Messenger's chat bubble.
 *
 * Restored 2026-09-17 at the member's request: the Nocturne pass replaced it with
 * header and Today links, and the assistant stopped being something anyone found.
 * The bar is now in flow, so the drag area ends at the bar's top edge (plus the
 * safe area) instead of guessing at a floating dock, and the layer sits at z 80 —
 * under the overlay roots, so the check-in sheet, More and modals cover it rather
 * than the bubble floating over them.
 * - Can be dragged anywhere within the phone screen
 * - Snaps to the nearest horizontal edge when released
 * - Tapping opens the AI Assistant popup
 * - Shows a small sparkle badge to indicate AI
 */
export default function FloatingChathead() {
  const [chatOpen, setChatOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Track position for edge-snapping
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Container dimensions for snapping
  const [containerWidth, setContainerWidth] = useState(375);
  const bubbleSize = 54;
  /** Must match the `right`/`bottom` inset the bubble is parked at. */
  const EDGE_GAP = 12;

  useEffect(() => {
    const el = constraintsRef.current;
    if (el) {
      setContainerWidth(el.offsetWidth);
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  /**
   * Magnet to whichever side it was let go nearest.
   *
   * The old version never worked, for two reasons.
   *
   * The bubble is anchored `right: 12`, so `x` is an offset *from the right
   * edge*: `x = 0` is already the right side and left is **negative**. The
   * snap treated `x` as a left-anchored coordinate and sent it to
   * `containerWidth - bubbleSize`, i.e. most of a screen further right, off
   * the edge. In practice the only way to reach the left was to physically
   * drag it all the way there and have the constraint stop it.
   *
   * And it used `x.set()`, which teleports. Snapping is the whole feel of a
   * chat head, so it animates.
   */
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    // 0 = parked right, -travel = parked left.
    const travel = Math.max(0, containerWidth - bubbleSize - EDGE_GAP * 2);
    const target = x.get() < -travel / 2 ? -travel : 0;
    animate(x, target, { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 });
  }, [x, containerWidth]);

  const handleTap = () => {
    if (!isDragging) {
      setChatOpen(true);
    }
  };

  // Scale effect while dragging
  const scale = useTransform(
    x,
    [0, containerWidth - bubbleSize],
    [1, 1]
  );

  return (
    <>
      {/* Drag constraints container — fills the phone screen area above the dock */}
      <div
        ref={constraintsRef}
        /* Sits above the dock rather than beside it. `bottom-[72px]` cleared
           the bar itself but not the check-in bump that rises out of it, so at
           rest the bubble covered the bottom-right corner of whatever card was
           last on screen — a stat tile on Progress, a Redeem button on Rewards.
           It is still draggable anywhere above this line. */
        className="absolute left-0 right-0 top-0 z-[80] pointer-events-none"
        style={{ bottom: 'calc(var(--bar-height) + env(safe-area-inset-bottom))' }}
      >
        <motion.div
          drag
          dragConstraints={constraintsRef}
          dragElastic={0.1}
          dragMomentum={false}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={handleDragEnd}
          onClick={handleTap}
          style={{ x, y, scale, position: 'absolute', bottom: 16, right: 12 }}
          className="pointer-events-auto cursor-grab active:cursor-grabbing"
          whileTap={{ scale: 0.92 }}
          initial={{ scale: 0, opacity: 0 }}
          /* The head hands over to the panel: it drops away as the window
             grows out of this exact corner, and comes back as it collapses.
             Leaving it sitting on top of its own expanded window is what gave
             the old version away as a dialog rather than a bubble. */
          animate={{ scale: chatOpen ? 0 : 1, opacity: chatOpen ? 0 : 1 }}
          transition={{ type: 'spring', damping: 22, stiffness: 320, delay: chatOpen ? 0 : 0.12 }}
        >
          {/* The bubble — a glass orb (redesigned 2026-09-17).

              A slowly turning violet-to-amber ring around a frosted core, with
              the assistant's sparkle in the middle: the app's two colours and
              the same glass as its sheets, instead of a flat violet disc with a
              message glyph and an amber badge that read as a notification
              count. The ring's spin and the idle halo are CSS, inside
              prefers-reduced-motion: no-preference (see .ai-orb in index.css). */}
          <div
            role="button"
            aria-label="Open the AI assistant"
            className="ai-orb relative grid place-items-center rounded-full"
            style={{ width: bubbleSize, height: bubbleSize }}
          >
            <span aria-hidden className="ai-orb__ring absolute inset-0 rounded-full" />
            <span aria-hidden className="ai-orb__core absolute rounded-full" style={{ inset: 2 }} />
            <Sparkle aria-hidden size={22} weight="fill" className="relative" style={{
              color: '#e9e3ff',
              filter: 'drop-shadow(0 0 6px rgba(196, 181, 253, 0.85))',
            }} />
            {!chatOpen && !isDragging && <span aria-hidden className="ai-orb__halo absolute rounded-full" />}
          </div>
        </motion.div>
      </div>

      {/* Chatbot popup */}
      <ChatbotPopup isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
