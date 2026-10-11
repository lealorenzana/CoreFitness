import { useRef } from 'react';

/**
 * Press and hold (450 ms) — the way an Android app opens an item's options.
 * Returns handlers for the element plus `consumed()`, which a click handler
 * asks so the tap that ends a long press does not also open the item. A finger
 * that moves more than a few pixels is scrolling, not holding. Right-click on
 * a computer does the same.
 */
export function useLongPress(onLong: () => void, ms = 450) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  return {
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = window.setTimeout(() => { fired.current = true; navigator.vibrate?.(12); onLong(); }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear();
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); if (!fired.current) { fired.current = true; onLong(); } },
    },
    /** True once if the last press was a long one — call from the click handler. */
    consumed: () => { const f = fired.current; fired.current = false; return f; },
  };
}
