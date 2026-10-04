import { Trash2, X } from 'lucide-react';
import Button from './Button';

/**
 * Select-many for a list of cards (2026-10-04): how many are picked, quick
 * picks (all, or a named group such as "past"), and the one destructive action,
 * which always goes through the page's own confirmation with real counts.
 */
export default function BulkBar({
  count, total, onAll, groups = [], onClear, onDone, action, actionLabel,
}: {
  count: number;
  total: number;
  onAll: () => void;
  /** Extra quick picks, e.g. [['Past events', fn]]. */
  groups?: [string, () => void][];
  onClear: () => void;
  onDone: () => void;
  action: () => void;
  actionLabel: string;
}) {
  const chip = 'h-8 px-3 rounded-lg text-[11px] font-semibold';
  const chipStyle = { background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' };
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-xl px-3 py-2 mb-3" role="toolbar" aria-label="Selection"
      style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)' }}>
      <span className="text-xs font-semibold text-white mr-1">{count} selected</span>
      <button type="button" className={chip} style={chipStyle} onClick={onAll}>Select all {total}</button>
      {groups.map(([label, fn]) => <button key={label} type="button" className={chip} style={chipStyle} onClick={fn}>{label}</button>)}
      {count > 0 && <button type="button" className={chip} style={chipStyle} onClick={onClear}>Clear</button>}
      <span className="flex-1" />
      <Button size="sm" variant="secondary" disabled={count === 0} onClick={action}><Trash2 size={12} /> {actionLabel}</Button>
      <Button size="sm" variant="ghost" onClick={onDone} aria-label="Stop selecting"><X size={12} /> Done</Button>
    </div>
  );
}
