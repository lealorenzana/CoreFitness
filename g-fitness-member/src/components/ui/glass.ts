import type { CSSProperties } from 'react';

/**
 * Glass surfaces for everything that opens over the app — sheets, the
 * notifications panel, the More sheet, dialogs (member's request, 2026-09-17).
 *
 * A translucent violet-black tint over a strong backdrop blur, a hairline edge
 * and a one-pixel top highlight, so a panel reads as a pane lifted off the
 * screen rather than a slab pasted over it. The scrim behind is lighter than
 * the old 78% black for the same reason: glass needs something to blur.
 *
 * Text contrast is held by the tint, not by the blur: at 0.72 alpha over the
 * app's #08080E ground the body text still clears 4.5:1 even where a bright
 * element sits behind the panel.
 *
 * `-webkit-backdrop-filter` is spelled out because Android WebView and Safari
 * still need the prefix.
 */
export const GLASS: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(34, 30, 54, 0.72) 0%, rgba(18, 17, 30, 0.78) 100%)',
  backdropFilter: 'blur(24px) saturate(160%)',
  WebkitBackdropFilter: 'blur(24px) saturate(160%)',
  border: '1px solid rgba(255, 255, 255, 0.10)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 60px -24px rgba(0, 0, 0, 0.75)',
};

/** The dimmer behind a glass panel: enough to separate, light enough to show through. */
export const SCRIM: CSSProperties = {
  background: 'rgba(8, 8, 14, 0.42)',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
};
