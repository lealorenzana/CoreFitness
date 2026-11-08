import { useEffect, useRef } from 'react';

/**
 * The platform's background (the owner, 2026-11-08): 21st.dev's "BLERRY.APP" Ribbon Field gradient, rebuilt on a
 * canvas from its parameters — a stripe field along `angle` (179°), stops Ink 0–79%, Vermilion 79.5–88.5%,
 * Indigo 88.5–100%, edges feathered by `softness` (7), bands bent by a cross-axis sine
 * (wave/100)·0.35·sin(cross·2.4·2π + clock), the whole field swaying, never spinning:
 * angle + sin(spin·0.6)·28·amt. ph = t·0.81, amt = 0.16, the wave clock 20.75 + ph·1.2. Every modulation is 0 at
 * ph = 0 (sin(x + p) − sin(p)), so the first frame matches a still one; nothing is rounded per frame. Grain,
 * vignette and the soften blur are CSS on top (aurora.css). Reduced motion: one still frame.
 */
// Core Fitness's own colours (the owner, 2026-11-08): its violet and amber on the app's violet-black ground.
const INK = [8, 6, 16];
const VERMILION = [245, 158, 11];   // Core Fitness amber #F59E0B
const INDIGO = [124, 58, 237];      // Core Fitness violet #7C3AED
const STOPS: [number, number[], number][] = [
  // position (0–1 along the field), colour, its opacity over the ink ground
  [0.0, INK, 1], [0.7891, INK, 1], [0.7953, VERMILION, 0.88], [0.8847, VERMILION, 0.88], [0.8853, INDIGO, 0.89], [1.0, INDIGO, 0.89],
];
const SOFT = 0.07 * 0.5;   // softness 7 → each hard edge feathered over ±3.5% of the field
const WAVE = 15;
const ANGLE = 179;
const AMT = 0.16;
const COLS = 72;           // the cross axis in slices; each slice its own wave offset

const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export default function RibbonField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();
    // Drawn small and stretched by CSS (with its soften blur): cheap, and the blur hides the slices.
    const SCALE = 0.25;

    const resize = () => {
      canvas.width = Math.max(64, Math.floor(window.innerWidth * SCALE));
      canvas.height = Math.max(64, Math.floor(window.innerHeight * SCALE));
    };

    const draw = (t: number) => {
      const W = canvas.width, H = canvas.height;
      const ph = t * 0.81;
      const spin = ph * 1;
      // Sway, zero at ph = 0: sin(x + p) − sin(p) with p = 0.
      const angle = ANGLE + Math.sin(spin * 0.6) * 28 * AMT;
      const clock = 20.75 + ph * 1.2;
      const clock0 = 20.75;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgb(8, 6, 16)';
      ctx.fillRect(0, 0, W, H);

      // Rotate the field: 180° would be straight down; the field is drawn oversized so no corner shows.
      const diag = Math.hypot(W, H);
      ctx.translate(W / 2, H / 2);
      ctx.rotate(((angle - 180) * Math.PI) / 180);
      // The stops run over the visible height (0 = top edge, 1 = bottom edge), as the CSS gradient does; the
      // slices are drawn wider and taller than the screen so the sway never shows a corner.
      const fieldW = diag * 1.2;
      const fieldH = H;
      const x0 = -fieldW / 2;
      const y0 = -H / 2;
      const sliceW = fieldW / COLS;

      for (let i = 0; i < COLS; i++) {
        const cross = i / (COLS - 1);
        // The wave, written to be 0 at ph = 0: (sin(c + clock) − sin(c + clock0)) keeps the start frame still,
        // plus the resting bend sin(c + clock0) itself — so the bands are curved at rest and move from there.
        const base = cross * 2.4 * Math.PI * 2;
        const bend = (WAVE / 100) * 0.35 * (Math.sin(base + clock0) + (Math.sin(base + clock) - Math.sin(base + clock0)));
        const off = bend * H * 0.35;
        const g = ctx.createLinearGradient(0, y0 + off, 0, y0 + fieldH + off);
        for (let s = 0; s < STOPS.length; s++) {
          const [pos, col, a] = STOPS[s];
          // Feather hard edges: pull each inner stop toward its neighbour by the softness.
          const prev = STOPS[s - 1], next = STOPS[s + 1];
          let p = pos;
          if (next && next[0] - pos < 0.01) p = Math.max(0, pos - SOFT);
          if (prev && pos - prev[0] < 0.01) p = Math.min(1, pos + SOFT);
          g.addColorStop(Math.min(1, Math.max(0, p)), rgba(col, a));
        }
        ctx.fillStyle = g;
        ctx.fillRect(x0 + i * sliceW - 0.5, -diag, sliceW + 1, diag * 2);
      }
    };

    const loop = (now: number) => {
      draw((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    resize();
    window.addEventListener('resize', resize);
    if (still) draw(0); else raf = requestAnimationFrame(loop);
    // A hidden tab stops the loop on its own (rAF); nothing to do there.
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <div className="ribbon" aria-hidden data-ribbon-field>
      <canvas ref={ref} className="ribbon__canvas" />
      <span className="ribbon__grain" />
      <span className="ribbon__vignette" />
    </div>
  );
}
