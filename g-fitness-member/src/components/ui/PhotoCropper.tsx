import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';

/**
 * Crop and zoom before a photo is uploaded (guides G1, 2026-10-31). Every
 * upload path calls `cropPhoto(file, { aspect, shape })` first; this host,
 * mounted once in App, shows the photo in a frame of that shape — drag to
 * position, the slider (or pinch / the wheel) to zoom — and resolves with a new
 * file holding exactly the framed area, or null when the person cancels.
 *
 * The same file lives in both apps (member and admin); keep them identical.
 */

export interface CropOptions {
  /** Width ÷ height of the frame: 1 for an avatar or logo, 4/3 for a content photo, 3/4 for a progress photo. */
  aspect: number;
  /** A round mask for avatars; the file is still square. */
  shape?: 'round' | 'square';
  /** What the window says it is for. */
  title?: string;
  /** The longest side of the file produced, in px. */
  maxSide?: number;
}

interface Job { file: File; opts: CropOptions; url: string; resolve: (f: File | null) => void }
let job: Job | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Ask the person to frame `file`. Resolves with the cropped file, or null if they cancel. */
export function cropPhoto(file: File, opts: CropOptions): Promise<File | null> {
  // Not an image we can draw (a PDF, a GIF that should stay animated): hand it back untouched.
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.resolve(file);
  if (job) { job.resolve(null); URL.revokeObjectURL(job.url); }
  return new Promise((resolve) => {
    job = { file, opts, url: URL.createObjectURL(file), resolve };
    emit();
  });
}

function finish(result: File | null) {
  if (!job) return;
  job.resolve(result);
  URL.revokeObjectURL(job.url);
  job = null;
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => job;

const FRAME = 300; // the frame's longer side on screen, px

/** Mount once near the root of the app. */
export function PhotoCropperHost() {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!current) return null;
  return createPortal(<Cropper key={current.url} job={current} />, document.body);
}

function Cropper({ job: j }: { job: Job }) {
  const { aspect, shape = 'square', title = 'Frame your photo', maxSide = 1600 } = j.opts;
  const fw = aspect >= 1 ? FRAME : Math.round(FRAME * aspect);
  const fh = aspect >= 1 ? Math.round(FRAME / aspect) : FRAME;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ d: number; z: number } | null>(null);

  useEffect(() => {
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = j.url;
  }, [j.url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // At zoom 1 the photo just covers the frame; the drawn size grows with zoom.
  const base = img ? Math.max(fw / img.naturalWidth, fh / img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : 0;
  const h = img ? img.naturalHeight * base * zoom : 0;
  // Keep the frame covered: the photo's edge never comes inside it.
  const clamp = (p: { x: number; y: number }, ww = w, hh = h) => ({
    x: Math.min(Math.max(p.x, (fw - ww) / 2), (ww - fw) / 2),
    y: Math.min(Math.max(p.y, (fh - hh) / 2), (hh - fh) / 2),
  });
  const setZoomClamped = (z: number) => {
    const nz = Math.min(4, Math.max(1, z));
    setZoom(nz);
    if (img) setPos((p) => clamp(p, img.naturalWidth * base * nz, img.naturalHeight * base * nz));
  };

  const down = (e: RPointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchStart.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
      drag.current = null;
    } else {
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    }
  };
  const move = (e: RPointerEvent) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pinch.current.values()];
      setZoomClamped(pinchStart.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.current.d));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPos(clamp({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) }));
  };
  const up = (e: RPointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      // The frame, in the photo's own pixels.
      const scale = base * zoom;
      const sx = (w / 2 - fw / 2 - pos.x) / scale;
      const sy = (h / 2 - fh / 2 - pos.y) / scale;
      const sw = fw / scale;
      const sh = fh / scale;
      const k = Math.min(1, maxSide / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw * k));
      canvas.height = Math.max(1, Math.round(sh * k));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot crop photos.');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      // A PNG keeps its transparency (a logo); anything else becomes a JPEG.
      const type = j.file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.9));
      if (!blob) throw new Error('The photo could not be cropped.');
      const name = j.file.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
      finish(new File([blob], name, { type }));
    } catch {
      finish(j.file);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={title} data-photo-cropper
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16,
        background: 'rgba(5,5,10,0.82)', backdropFilter: 'blur(6px)' }}>
      <div style={{ width: 'min(100%, 380px)', borderRadius: 20, padding: 18, background: 'var(--color-surface, #14141F)',
        border: '1px solid var(--color-border, rgba(255,255,255,0.1))', color: 'var(--color-text-primary, #fff)' }}>
        <p style={{ fontSize: 16, fontWeight: 700 }}>{title}</p>
        <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-muted, #8b8ba0)' }}>Drag to move it · zoom with the slider</p>
        <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onWheel={(e) => setZoomClamped(zoom - e.deltaY * 0.0015)}
          data-crop-frame
          style={{ position: 'relative', width: fw, height: fh, margin: '14px auto 0', overflow: 'hidden', touchAction: 'none', cursor: 'grab',
            borderRadius: shape === 'round' ? '50%' : 14, background: '#000',
            boxShadow: '0 0 0 2px var(--color-primary, #7C3AED)' }}>
          {img && (
            <img src={j.url} alt="" draggable={false}
              style={{ position: 'absolute', left: '50%', top: '50%', width: w, height: h, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none',
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 12.5, color: 'var(--color-text-secondary, #a1a1b5)' }}>
          Zoom
          <input type="range" min={1} max={4} step={0.01} value={zoom} aria-label="Zoom"
            onChange={(e) => setZoomClamped(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--color-primary, #7C3AED)' }} />
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={() => finish(null)} disabled={busy}
            style={{ flex: 1, height: 42, borderRadius: 12, fontWeight: 600, fontSize: 14, border: '1px solid var(--color-border, rgba(255,255,255,0.14))', color: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={busy || !img} data-crop-use
            style={{ flex: 1, height: 42, borderRadius: 12, fontWeight: 700, fontSize: 14, background: 'var(--color-secondary, #F59E0B)', color: '#1a1206' }}>
            {busy ? 'Saving…' : 'Use this photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
