import { useMemo, useState } from 'react';
import { Check, Plus, Sparkles } from 'lucide-react';
import {
  ACTIVITIES, ACTIVITY_BY_ID, STARTER_IDS, suggestionsFor, activitiesByGroup,
} from '../../data/activities';

/**
 * The interests step, as a cascade rather than a wall.
 *
 * Sixty-odd activities shown at once is a scrolling chore on a phone and reads
 * as a form. Shown a dozen at a time, where each pick pulls in the things next
 * to it in the graph, it reads as a conversation: pick Yoga and Pilates,
 * Stretching, Mobility and Breathwork arrive under "Because you picked Yoga";
 * pick Mobility and Foam Rolling arrives.
 *
 * **Nothing is ever removed.** Deselecting keeps the chips that a pick
 * surfaced, and keeps the heading — a group of chips vanishing from under the
 * thumb that just tapped one is disorienting, and the member may well want the
 * neighbour rather than the thing they tried first. "Browse all" is always
 * there for anyone who would rather just see the list.
 */
interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

interface Wave {
  /** The pick that surfaced these, or null for the opening set. */
  fromId: string | null;
  ids: string[];
}

export default function InterestPicker({ selected, onChange }: Props) {
  const [waves, setWaves] = useState<Wave[]>([{ fromId: null, ids: STARTER_IDS }]);
  const [browseAll, setBrowseAll] = useState(false);

  const shown = useMemo(() => new Set(waves.flatMap((w) => w.ids)), [waves]);

  const toggle = (id: string) => {
    const isSelected = selected.includes(id);
    onChange(isSelected ? selected.filter((v) => v !== id) : [...selected, id]);

    // Only a *new* pick cascades. Re-selecting something already explored
    // should not stack a second identical block of suggestions.
    if (isSelected) return;
    const next = suggestionsFor(id, shown);
    if (next.length > 0) setWaves((prev) => [...prev, { fromId: id, ids: next }]);
  };

  const remaining = useMemo(
    () => activitiesByGroup()
      .map(([group, list]) => [group, list.filter((a) => !shown.has(a.id))] as const)
      .filter(([, list]) => list.length > 0),
    [shown]
  );

  return (
    <div className="space-y-5">
      {waves.map((wave, i) => (
        <section key={`${wave.fromId ?? 'start'}-${i}`} className="space-y-2">
          {wave.fromId && (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--color-secondary)' }}>
              <Sparkles size={12} />
              Because you picked {ACTIVITY_BY_ID.get(wave.fromId)?.label}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {wave.ids.map((id, n) => (
              <Chip
                key={id}
                id={id}
                selected={selected.includes(id)}
                onToggle={toggle}
                // Only the cascaded waves stagger; the opening set is already
                // on screen when the step mounts.
                delayMs={wave.fromId ? n * 40 : 0}
                animate={Boolean(wave.fromId)}
              />
            ))}
          </div>
        </section>
      ))}

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
          <p className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-text-muted)' }}>{group}</p>
          <div className="flex flex-wrap gap-2">
            {list.map((a) => (
              <Chip key={a.id} id={a.id} selected={selected.includes(a.id)} onToggle={toggle} delayMs={0} animate={false} />
            ))}
          </div>
        </section>
      ))}

      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
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
