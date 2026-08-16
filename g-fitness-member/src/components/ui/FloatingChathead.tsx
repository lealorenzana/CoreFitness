import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion';
import { MessageSquare, Sparkles } from 'lucide-react';
import ChatbotPopup from './ChatbotPopup';

/**
 * Draggable floating chathead — like Messenger's chat bubble.
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
  const bubbleSize = 48;
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
        className="absolute inset-0 bottom-[72px] z-[200] pointer-events-none"
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
          {/* The bubble */}
          <div
            className="relative flex items-center justify-center rounded-full shadow-lg"
            style={{
              width: bubbleSize,
              height: bubbleSize,
              background: 'var(--color-primary)',
              boxShadow: '0 4px 20px rgba(124, 58, 237, 0.4)',
            }}
          >
            <MessageSquare size={20} className="text-white" />
            {/* Sparkle badge */}
            <span
              className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-secondary)', boxShadow: '0 2px 6px rgba(245,158,11,0.4)' }}
            >
              <Sparkles size={9} className="text-black" />
            </span>
          </div>

          {/* Pulse ring animation when idle */}
          <AnimatePresence>
            {!chatOpen && !isDragging && (
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: '2px solid var(--color-primary)' }}
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Chatbot popup */}
      <ChatbotPopup isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
