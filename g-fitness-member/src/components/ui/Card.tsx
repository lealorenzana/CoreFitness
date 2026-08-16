import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * The standard raised panel.
 *
 * This object is the single source of truth for what a card looks like. It used
 * to be a `const panel = { ... }` re-declared at the top of thirteen different
 * pages, which is why the app's surfaces had quietly drifted apart — changing
 * one meant finding the other twelve.
 *
 * Exported as a plain style object as well as a component because roughly half
 * the call sites are `motion.div`s that need to keep their own animation props;
 * those spread `panelStyle` instead of wrapping in `<Card>`.
 */
export const panelStyle: CSSProperties = {
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-border)',
};

/** A panel one step back from `panelStyle` — for nesting inside a raised card. */
export const insetStyle: CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
};

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Merged over `panelStyle` — for one-offs like a coloured left border. */
  style?: CSSProperties;
  onClick?: () => void;
}

export default function Card({ children, className, style, onClick }: CardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn('rounded-2xl p-4', onClick && 'w-full text-left', className)}
      style={{ ...panelStyle, ...style }}
    >
      {children}
    </Tag>
  );
}
