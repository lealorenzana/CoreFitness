import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
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

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    // Snap to nearest horizontal edge
    const currentX = x.get();
    const midpoint = (containerWidth - bubbleSize) / 2;
    const snapLeft = 0;
    const snapRight = containerWidth - bubbleSize;

    if (currentX < midpoint) {
      x.set(snapLeft);
    } else {
      x.set(snapRight);
    }
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
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300, delay: 0.5 }}
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
