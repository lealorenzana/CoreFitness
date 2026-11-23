import { useEffect, useRef } from 'react';
import './mockup-backdrop.css';

const OBJECTS = [
  { x: 3, y: 300, speed: .08, depth: 'far', kind: 'weights', angle: -24 },
  { x: 94, y: 820, speed: .16, depth: 'mid', kind: 'plate', angle: 18 },
];

export default function MockupBackdrop() {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const paint = () => {
      frame = 0;
      const height = window.innerHeight;
      const scroll = preference.matches ? 0 : window.scrollY;
      const footer = document.querySelector('.v2-footer');
      if(layer.current) layer.current.style.opacity = footer ? String(Math.max(0,Math.min(1,(footer.getBoundingClientRect().top-height)/300))) : '1';
      layer.current?.querySelectorAll<HTMLElement>('.v2-depth-object').forEach((object, i) => {
        const spec = OBJECTS[i];
        const wantedY = spec.y / 1100 * height - 100 + (preference.matches ? 0 : Math.sin(scroll * spec.speed / 250 + i) * 150);
        const drift = preference.matches ? 0 : Math.sin(scroll / 1300 + i) * 24;
        const width = object.offsetWidth, objectHeight = object.offsetHeight;
        const radius = Math.hypot(width, objectHeight) / 2;
        const marginX = radius - width / 2 + 20;
        const marginY = radius - objectHeight / 2 + 20;
        const x = Math.max(marginX, Math.min(window.innerWidth - width - marginX, window.innerWidth * spec.x / 100 + drift - width / 2));
        const y = Math.max(marginY, Math.min(height - objectHeight - marginY, wantedY));
        object.style.transform = `translate3d(${x}px,${y}px,0) rotate(${spec.angle + (preference.matches ? 0 : Math.sin(scroll / 1700 + i) * 12)}deg)`;
      });
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const element = layer.current;
    paint(); element?.addEventListener('load', queue, true); window.addEventListener('scroll', queue, { passive: true }); window.addEventListener('resize', queue); preference.addEventListener('change', queue);
    return () => { element?.removeEventListener('load', queue, true); window.removeEventListener('scroll', queue); window.removeEventListener('resize', queue); preference.removeEventListener('change', queue); cancelAnimationFrame(frame); };
  }, []);
  return <div className="v2-depth-backdrop" ref={layer} aria-hidden="true">{OBJECTS.map((object, i) =>
    <div key={i} className={`v2-depth-object depth-${object.depth} object-${object.kind}`} style={{ left: `${object.x}%` }}>
      <img src={`/mockup-art/${object.kind === 'plate' ? 'gym-foreground.webp' : 'floating-dumbbells.webp'}`} alt="" />
    </div>)}<div className="v2-depth-stars" /></div>;
}
