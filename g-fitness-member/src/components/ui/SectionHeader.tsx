import type { ReactNode } from 'react';

/**
 * The heading that opens every section of a screen.
 *
 * Two lines: a heavy uppercase title in the display face, and an optional muted
 * line under it. The muted line is where a screen explains itself — the
 * reference design leans on it heavily, and it is the only place on a phone
 * screen there is room to say *why* a number matters.
 *
 * `action` sits on the right, baseline-aligned with the title. Keep it to one
 * or two words ("See all", "Edit") — anything longer wraps the title.
 */
export default function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="display text-lg text-white">{title}</h2>
        {hint && (
          <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
            {hint}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
