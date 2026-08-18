import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Check, CornerDownRight, Plus } from 'lucide-react';
import {
  ACTIVITIES, ACTIVITY_BY_ID, STARTER_IDS, suggestionsFor, activitiesByGroup,
} from '../../data/activities';

/**
 * The interests step, as a cascade rather than a wall.
 *
 * Sixty-odd activities shown at once is a scrolling chore on a phone and reads
 * as a form. Shown a dozen at a time, where each pick pulls in the things next
 * to it in the graph, it reads as a conversation.
 *
 * ## Suggestions open *beside* the chip, not at the bottom
 *
 * The first version pushed each new wave onto the end of a flat list under a
 * "Because you picked X" heading. Two or three picks and the step was a column
 * of stacked sections: the member tapped something near the top and the result
 * appeared a screen and a half below, so every choice cost a scroll, and the
 * connection between the tap and the new options was lost entirely.
 *
 * Suggestions now render **inline, immediately after the chip that produced
 * them**, in the same wrapping flow and marked with a bracket. The relationship
 * is spatial instead of textual — no heading needed to explain where the chips
 * came from, because they are attached to the thing you touched.
 *
 * **Nothing is ever removed.** Deselecting keeps the chips that a pick
 * surfaced: a group vanishing from under the thumb that just tapped one is
 * disorienting, and the member may well want the neighbour rather than the
 * thing they tried first.
 */
interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

/** How deep the bracket keeps indenting before it flattens out. Past two the
 *  indent eats the row on a 375px screen and the chips start to wrap one per
 *  line, which is the scrolling problem again in a different shape. */
const MAX_INDENT_DEPTH = 2;

export default function InterestPicker({ selected, onChange }: Props) {
  /** parent id → the ids that pick surfaced. Insertion order is irrelevant;
   *  position on screen comes from the parent, not from when it was added. */
  const [expansions, setExpansions] = useState<Record<string, string[]>>({});
  const [browseAll, setBrowseAll] = useState(false);

  const shown = useMemo(() => {
    const s = new Set<string>(STARTER_IDS);
    for (const ids of Object.values(expansions)) ids.forEach((id) => s.add(id));
    return s;
  }, [expansions]);

  const toggle = (id: string) => {
    const isSelected = selected.includes(id);
    onChange(isSelected ? selected.filter((v) => v !== id) : [...selected, id]);

    // Only a *new* pick cascades, and only once. Re-selecting something already
    // explored must not surface a second identical branch under it.
    if (isSelected || expansions[id]) return;
    const next = suggestionsFor(id, shown);
    if (next.length > 0) setExpansions((prev) => ({ ...prev, [id]: next }));
  };

  /**
   * A plain function, not a nested component: declaring a component inside
   * render remounts its whole subtree every keystroke and trips
   * react-hooks/static-components.
   */
  const renderBranch = (ids: string[], depth: number): ReactNode =>
    ids.map((id, n) => {
      const children = expansions[id];
      return (
        <Fragment key={id}>
          <Chip
            id={id}
            selected={selected.includes(id)}
            onToggle={toggle}
            delayMs={depth === 0 ? 0 : n * 40}
            animate={depth > 0}
          />
          {children && children.length > 0 && (
            <span
              className="inline-flex flex-wrap items-center gap-2 py-0.5"
              style={{
                paddingLeft: 8,
                marginLeft: depth < MAX_INDENT_DEPTH ? 2 : 0,
                borderLeft: '2px solid var(--color-primary)',
              }}
            >
              <CornerDownRight
                size={13}
                className="flex-shrink-0"
                style={{ color: 'var(--color-primary)' }}
                aria-label={`Suggested from ${ACTIVITY_BY_ID.get(id)?.label ?? 'your pick'}`}
              />
              {renderBranch(children, depth + 1)}
            </span>
          )}
        </Fragment>
      );
    });

  const remaining = useMemo(
    () => activitiesByGroup()
      .map(([group, list]) => [group, list.filter((a) => !shown.has(a.id))] as const)
      .filter(([, list]) => list.length > 0),
    [shown]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {renderBranch(STARTER_IDS, 0)}
      </div>

      {remaining.length > 0 && !browseAll && (
        <button
          onClick={() => setBrowseAll(true)}
          className="w-full py-2.5 rounded-xl text-xs font-semibold"
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Browse all {ACTIVITIES.length} activities
        </button>
      )}

      {browseAll && remaining.map(([group, list]) => (
        <section key={group} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-text-muted)' }}>{group}</p>
          <div className="flex flex-wrap gap-2">
            {list.map((a) => (
              <Chip key={a.id} id={a.id} selected={selected.includes(a.id)}
                onToggle={toggle} delayMs={0} animate={false} />
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {selected.length === 0
          ? 'Pick at least one so we can point you at the right classes.'
          : `${selected.length} selected`}
      </p>
    </div>
  );
}

function Chip({
  id, selected, onToggle, delayMs, animate,
}: {
  id: string;
  selected: boolean;
  onToggle: (id: string) => void;
  delayMs: number;
  animate: boolean;
}) {
  const activity = ACTIVITY_BY_ID.get(id);
  if (!activity) return null;

  return (
    <button
      onClick={() => onToggle(id)}
      aria-pressed={selected}
      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-xs font-semibold transition-colors active:scale-95"
      style={{
        background: selected ? 'var(--color-primary)' : 'var(--color-surface-raised)',
        border: `1.5px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        color: selected ? '#fff' : 'var(--color-text-secondary)',
        // Fades in from transparent; the resting state is already visible, so a
        // page that never composites still shows a usable chip. See index.css.
        animation: animate ? `chip-in 220ms ease-out ${delayMs}ms both` : undefined,
      }}
    >
      {selected ? <Check size={12} /> : <Plus size={12} style={{ opacity: 0.5 }} />}
      {activity.label}
    </button>
  );
}
