import { motion } from 'framer-motion';

/**
 * The Core Fitness mark, ringed — the same treatment as the boot splash in
 * `index.html`, so the app does not change its own logo one frame after
 * launching.
 *
 * The splash was the better-looking of the two and the login screen was the
 * odd one out: a rounded square with a glow behind it, against a ringed disc on
 * the screen immediately before it.
 *
 * ## The rings do not spin here, and that is deliberate
 *
 * On the splash the two arcs counter-rotate, which is honest — the app really
 * is starting, and the ring says so without pretending to measure progress it
 * cannot know. On a login screen nothing is loading. A ring that span forever
 * would be claiming work is happening, which is the same species of lie as a
 * progress bar with no source: motion asserting a state that is not true.
 *
 * So the arcs are drawn and left still. A **full faint circle sits underneath
 * them**, which the splash does not need — a spinning arc reads as a ring
 * because it sweeps, but a stationary arc just reads as a broken line. The base
 * circle is what makes it hold together at rest.
 *
 * ## Both brand colours stay on screen
 *
 * The splash uses violet outside and amber inside. This keeps that pairing but
 * leads with whichever role is selected, so the mark tints with the rest of the
 * screen and the two accents swap places rather than one disappearing.
 */
export default function BrandMark({
  /** Leading colour — the selected role's accent. */
  accent,
  /** The other brand colour, used for the counter arc. */
  counter,
  /** Shared with the rest of the tinted chrome so nothing arrives late. */
  transition,
  size = 96,
}: {
  accent: string;
  counter: string;
  transition?: string;
  size?: number;
}) {
  // Everything is a fraction of `size`, taken from the splash's 96px values, so
  // the mark holds together when it shrinks. A hardcoded 10px inner inset works
  // at 96 and swallows the whole disc at 48.
  const ring = Math.max(1.5, size * 0.021);
  const innerInset = size * 0.104;
  return (
    <motion.div
      // No `mx-auto`: centring is the caller's decision, and baked in here it
      // quietly overrode the left-aligned brand row with an auto margin.
      // `shrink-0` so the mark keeps its size inside a flex row.
      className="relative shrink-0"
      style={{ width: size, height: size }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
    >
      {/* Bloom. Framer drives the breathing because it is pure decoration — if
          it never runs, the mark is still a mark. */}
      <motion.span
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: -size * 0.35,
          background: `radial-gradient(circle, ${accent}55 0%, transparent 70%)`,
          transition,
        }}
        animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0.9, 0.55] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Base circle — the thing that makes a stationary ring read as a ring. */}
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ border: `${ring}px solid rgba(255,255,255,0.10)` }}
      />

      {/* Outer arc, in the selected role's colour. */}
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          border: `${ring}px solid transparent`,
          borderTopColor: accent,
          borderRightColor: `${accent}59`,
          transform: 'rotate(-38deg)',
          transition,
        }}
      />

      {/* Inner arc, the other brand colour, leaning the opposite way. */}
      <span
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: innerInset,
          border: `${ring}px solid transparent`,
          borderBottomColor: counter,
          borderLeftColor: `${counter}4D`,
          transform: 'rotate(20deg)',
          transition,
        }}
      />

      <img
        src="/logo.png"
        alt="Core Fitness"
        className="absolute object-contain"
        style={{
          inset: innerInset,
          width: size * 0.792,
          height: size * 0.792,
          borderRadius: size * 0.208,
          boxShadow: `0 0 40px ${accent}4D`,
          transition,
        }}
      />
    </motion.div>
  );
}
