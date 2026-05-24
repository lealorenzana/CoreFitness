'use client';
import * as React from 'react';
import { useRef, useState, useCallback } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Dumbbell } from 'lucide-react';

// ─── Yellow theme tokens ──────────────────────────────────────────────────────
const Y = {
  gold: '#f6c90e',
  goldDeep: '#c9a227',
  goldGlow: 'rgba(246,201,14,0.18)',
  bg: '#050400',
};

// ─── Injected CSS ─────────────────────────────────────────────────────────────
const FOOTER_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&display=swap');

.gf-footer-wrapper {
  font-family: 'Plus Jakarta Sans', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ── Marquee ── */
@keyframes gf-marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.gf-marquee-track { animation: gf-marquee 38s linear infinite; }

/* ── Aurora breathe ── */
@keyframes gf-breathe {
  0%   { transform: translate(-50%,-50%) scale(1);    opacity: 0.5; }
  100% { transform: translate(-50%,-50%) scale(1.12); opacity: 1;   }
}
.gf-breathe-orb { animation: gf-breathe 8s ease-in-out infinite alternate; }

/* ── Glass pill ── */
.gf-pill {
  --pill-bg:        var(--color-surface-raised);
  --pill-border:    var(--color-border);
  background: 'var(--pill-bg)';
  border: 1px solid 'var(--pill-border)';
  transition: all 0.3s ease;
  cursor: pointer;
}
.gf-pill:hover {
  background: 'var(--color-secondary-light)';
  border-color: rgba(246,201,14,0.45);
  color: #fff;
}

/* ── Flat grid bg (no fading mask, no gradient lines) ── */
.gf-grid-bg {
  background: transparent;
}

/* ── Giant bg text ── */
.gf-giant-text {
  font-size: clamp(60px, 18vw, 260px);
  line-height: 0.8;
  font-weight: 900;
  letter-spacing: -0.05em;
  color: 'var(--color-secondary-light)';
  -webkit-text-stroke: 1px 'var(--color-secondary-light)';
  white-space: nowrap;
  user-select: none;
  pointer-events: none;
  width: 100%;
  text-align: center;
}

/* ── Flat heading (no gradient text) ── */
.gf-text-glow {
  color: #ffffff;
}
`;

// ─── Magnetic button — pure framer-motion, no GSAP ───────────────────────────
type MagneticProps = React.HTMLAttributes<HTMLElement> & {
  as?: React.ElementType;
  href?: string;
  onClick?: () => void;
};

function MagneticButton({ as: Tag = 'button', children, className = '', ...props }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, rotX: 0, rotY: 0 });

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    setPos({ x: x * 0.4, y: y * 0.4, rotX: -y * 0.15, rotY: x * 0.15 });
  }, []);

  const handleLeave = useCallback(() => setPos({ x: 0, y: 0, rotX: 0, rotY: 0 }), []);

  const springCfg = { type: 'spring' as const, stiffness: 200, damping: 18 };
  const elasticCfg = { type: 'spring' as const, stiffness: 120, damping: 10 };
  const isResting = pos.x === 0 && pos.y === 0;

  return (
    <motion.div
      ref={ref}
      animate={{ x: pos.x, y: pos.y, rotateX: pos.rotX, rotateY: pos.rotY, scale: isResting ? 1 : 1.05 }}
      transition={isResting ? elasticCfg : springCfg}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ display: 'inline-flex', transformStyle: 'preserve-3d' }}
    >
      <Tag className={className} {...props}>
        {children}
      </Tag>
    </motion.div>
  );
}

// ─── Marquee strip ────────────────────────────────────────────────────────────
const MARQUEE_ITEMS = [
  'Smart Gym Management', '✦',
  'Member Analytics',     '✦',
  'QR Attendance',        '✦',
  'Revenue Tracking',     '✦',
  'Class Scheduling',     '✦',
  'Role-Based Access',    '✦',
];

function MarqueeStrip() {
  const doubled = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div
      className="absolute top-12 left-0 w-full overflow-hidden py-3.5 z-10 -rotate-[1.8deg] scale-110 shadow-2xl"
      style={{
        borderTop: `1px solid var(--color-secondary-light)`,
        borderBottom: `1px solid var(--color-secondary-light)`,
        background: 'rgba(5,4,0,0.72)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        className="gf-marquee-track flex w-max gap-10 text-[11px] md:text-xs font-bold tracking-[0.3em] uppercase whitespace-nowrap"
        style={{ color: 'rgba(245,158,11,0.50)' }}
      >
        {doubled.map((item, i) => <span key={i}>{item}</span>)}
      </div>
    </div>
  );
}

// ─── Main CinematicFooter ─────────────────────────────────────────────────────
export function CinematicFooter() {
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const giantTextRef  = useRef<HTMLDivElement>(null);
  const headingRef    = useRef<HTMLHeadingElement>(null);
  const linksRef      = useRef<HTMLDivElement>(null);

  // ── Scroll progress of the wrapper entering the viewport ──────────────────
  // offset: ['start end', 'end end'] → 0 when top of wrapper hits bottom of viewport,
  //                                     1 when bottom of wrapper hits bottom of viewport
  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ['start end', 'end end'],
  });

  // ── Giant text: scrub-linked scale + y + opacity (mirrors GSAP fromTo) ────
  const rawGiantScale   = useTransform(scrollYProgress, [0, 0.6], [0.85, 1]);
  const rawGiantY       = useTransform(scrollYProgress, [0, 0.6], [40, 0]);   // moves up into place
  const rawGiantOpacity = useTransform(scrollYProgress, [0, 0.5], [0, 1]);

  const giantScale   = useSpring(rawGiantScale,   { stiffness: 60, damping: 20 });
  const giantY       = useSpring(rawGiantY,       { stiffness: 60, damping: 20 });
  const giantOpacity = useSpring(rawGiantOpacity, { stiffness: 60, damping: 20 });

  // ── Heading: scrub-linked y + opacity (stagger 0 — first element) ─────────
  const rawHeadingY       = useTransform(scrollYProgress, [0.2, 0.75], [50, 0]);
  const rawHeadingOpacity = useTransform(scrollYProgress, [0.2, 0.65], [0, 1]);

  const headingY       = useSpring(rawHeadingY,       { stiffness: 80, damping: 22 });
  const headingOpacity = useSpring(rawHeadingOpacity, { stiffness: 80, damping: 22 });

  // ── Links: scrub-linked y + opacity (stagger 0.15 — second element) ───────
  const rawLinksY       = useTransform(scrollYProgress, [0.3, 0.85], [50, 0]);
  const rawLinksOpacity = useTransform(scrollYProgress, [0.3, 0.75], [0, 1]);

  const linksY       = useSpring(rawLinksY,       { stiffness: 80, damping: 22 });
  const linksOpacity = useSpring(rawLinksOpacity, { stiffness: 80, damping: 22 });

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FOOTER_CSS }} />

      {/*
        Curtain-reveal wrapper (identical to original GSAP version):
        - Normal-flow div gives the page height (100vh)
        - clip-path clips everything to its bounding box
        - Inner <footer> is position:fixed so it stays at the bottom
          and gets "revealed" as the wrapper scrolls into view
      */}
      <div
        ref={wrapperRef}
        className="relative h-screen w-full gf-footer-wrapper"
        style={{ clipPath: 'polygon(0% 0, 100% 0%, 100% 100%, 0 100%)', position: 'relative' }}
      >
        <footer
          className="fixed bottom-0 left-0 flex h-screen w-full flex-col justify-between overflow-hidden"
          style={{ background: Y.bg, color: '#fff' }}
        >
          {/* ── Aurora glow ── */}
          <div
            className="gf-breathe-orb absolute left-1/2 top-1/2 h-[60vh] w-[80vw] rounded-[50%] blur-[80px] pointer-events-none z-0"
            style={{
              background: 'var(--color-secondary-light)',
            }}
          />

          {/* ── Grid texture ── */}
          <div className="gf-grid-bg absolute inset-0 z-0 pointer-events-none" />

          {/* ── Giant background text — scrub-animated ── */}
          <motion.div
            ref={giantTextRef}
            style={{ y: giantY, scale: giantScale, opacity: giantOpacity }}
            className="gf-giant-text absolute bottom-0 left-0 right-0 z-0 overflow-hidden"
          >
            G-FITNESS
          </motion.div>

          {/* ── Diagonal marquee ── */}
          <MarqueeStrip />

          {/* ── Main center content ── */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-32 w-full max-w-5xl mx-auto">

            {/* Heading — scrub-animated (stagger slot 0) */}
            <motion.h2
              ref={headingRef}
              style={{ y: headingY, opacity: headingOpacity }}
              className="gf-text-glow text-5xl md:text-8xl font-black tracking-tighter mb-12 text-center font-orbitron"
            >
              Ready to begin?
            </motion.h2>

            {/* Button — scrub-animated (stagger slot 1) */}
            <motion.div
              ref={linksRef}
              style={{ y: linksY, opacity: linksOpacity }}
              className="flex justify-center"
            >
              <MagneticButton
                as="button"
                onClick={scrollToTop}
                className="gf-pill px-10 py-5 rounded-full font-bold text-sm md:text-base flex items-center gap-3 text-white/80"
              >
                <Dumbbell size={20} style={{ color: Y.gold }} />
                Login to Admin Panel
              </MagneticButton>
            </motion.div>
          </div>

          {/* ── Spacer so content doesn't crowd the very bottom ── */}
          <div className="h-20" />
        </footer>
      </div>
    </>
  );
}
