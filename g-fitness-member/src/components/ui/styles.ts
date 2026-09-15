import type { CSSProperties } from 'react';

/**
 * Style constants shared between screens, in a file that exports no component.
 *
 * That is the whole reason this file exists rather than these living in
 * `page.tsx` next to the primitives that use them: `react-refresh/
 * only-export-components` fires on any module that exports both a component and
 * a constant, and lint is kept at a fixed baseline here. `Card.tsx` already
 * carries two of those errors for `panelStyle` and `insetStyle`; moving those
 * would mean editing every page that imports them, so they stay where they are
 * and anything new lands here instead.
 */

/**
 * Two lines, then an ellipsis.
 *
 * Inline properties rather than a `line-clamp-2` class. The member app is
 * Tailwind v4 with **no config file**, and this codebase has already shipped
 * class names that emitted no CSS at all — an inline property cannot fail to
 * exist. Spread it into a style object:
 *
 *   style={{ color: 'var(--color-text-muted)', ...CLAMP_2 }}
 */
export const CLAMP_2: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};
