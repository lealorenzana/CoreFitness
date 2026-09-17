import type { ReactNode } from 'react';

/**
 * The heading that opens a section of a screen (Nocturne redesign).
 *
 * A 17px title at weight 500 and an optional muted line under it — the one
 * place on a phone screen there is room to say *why* a number matters. It was a
 * heavy uppercase title in Anton; hierarchy now comes from size and space.
 *
 * An empty `title` renders the hint alone, which a few screens use as a closing
 * note under a list.
 *
 * `action` sits on the right. Keep it to one or two words ("See all", "Edit") —
 * anything longer wraps the title.
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
    <div className="flex items-start justify-between" style={{ gap: 12, marginBottom: 12 }}>
      <div className="min-w-0">
        {title && (
          <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h2>
        )}
        {hint && (
          <p style={{ fontSize: 12.5, marginTop: title ? 3 : 0, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
            {hint}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0" style={{ fontSize: 13 }}>{action}</div>}
    </div>
  );
}
