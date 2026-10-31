import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tap a photo to see it big (guides G1, 2026-10-31): `openPhoto(url, label)`
 * shows it full screen over everything — pinch, the wheel or the slider to
 * zoom, drag when zoomed — and a tap on the dark, ✕, Escape or Back closes it.
 * Mounted once in App (`PhotoViewerHost`). The same file lives in both apps.
 */

interface Shown { url: string; label: string }
let shown: Shown | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => shown;

/** Show `url` full screen. `label` is what a screen reader hears ("Ana Reyes's photo"). */
export function openPhoto(url: string, label = 'Photo'): void {
  shown = { url, label };
  // Back closes the viewer rather than leaving the screen underneath.
  try { history.pushState({ ...(history.state ?? {}), photoViewer: true }, ''); } catch { /* no history here */ }
  emit();
}

function close(fromBack = false) {
  if (!shown) return;
  shown = null;
  emit();
  if (!fromBack && history.state?.photoViewer) history.back();
}

export function PhotoViewerHost() {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    const onPop = () => close(true);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  if (!current) return null;
  return createPortal(<Viewer key={current.url} shown={current} />, document.body);
}

function Viewer({ shown: s }: { shown: Shown }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const pts = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setZ = (z: number) => {
    const nz = Math.min(5, Math.max(1, z));
    setZoom(nz);
    if (nz === 1) setPos({ x: 0, y: 0 });
  };
  const down = (e: RPointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
    } else {
      drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, moved: false };
    }
  };
  const move = (e: RPointerEvent) => {
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2 && pinch.current) {
      const [a, b] = [...pts.current.values()];
      setZ(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d));
      if (drag.current) drag.current.moved = true;
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) d.moved = true;
    if (zoom > 1) setPos({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
  };
  const up = (e: RPointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    // A tap (no drag, no pinch) on the dark around a photo at normal size closes it.
    if (d && !d.moved && zoom === 1 && e.target === e.currentTarget) close();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={s.label} data-photo-viewer
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onWheel={(e) => setZ(zoom - e.deltaY * 0.002)}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)', touchAction: 'none',
        display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <img src={s.url} alt={s.label} draggable={false}
        style={{ maxWidth: '100vw', maxHeight: '86vh', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none',
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`, transition: drag.current ? 'none' : 'transform 0.12s ease-out' }} />
      <button type="button" aria-label="Close" onPointerDown={(e) => e.stopPropagation()} onClick={() => close()} data-photo-close
        style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', right: 14, width: 40, height: 40, borderRadius: 20,
          display: 'grid', placeItems: 'center', fontSize: 22, color: '#fff', background: 'rgba(255,255,255,0.12)' }}>
        ×
      </button>
      <label onPointerDown={(e) => e.stopPropagation()}
        style={{ position: 'absolute', bottom: 'max(18px, env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12.5 }}>
        Zoom
        <input type="range" min={1} max={5} step={0.01} value={zoom} aria-label="Zoom" onChange={(e) => setZ(Number(e.target.value))} style={{ width: 160 }} />
      </label>
    </div>
  );
}

/** An `<img>` that opens big on tap. Use for content photos; avatars do it themselves. */
export function ZoomImg({ src, alt, label, style, loading }: {
  src: string; alt: string; label?: string; style?: CSSProperties; loading?: 'lazy' | 'eager';
}) {
  return (
    <img src={src} alt={alt} loading={loading} role="button" tabIndex={0} data-zoom-img
      aria-label={`${label ?? (alt || 'Photo')} — tap to see it big`}
      onClick={(e) => { e.stopPropagation(); openPhoto(src, label ?? (alt || 'Photo')); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPhoto(src, label ?? (alt || 'Photo')); } }}
      style={{ cursor: 'zoom-in', ...style }} />
  );
}
