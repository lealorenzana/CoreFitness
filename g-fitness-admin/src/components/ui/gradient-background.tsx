import type { ReactNode } from 'react';

interface GradientBackgroundProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Flat dark background — keeps the original component name so existing imports keep working,
 * but uses a solid color (no gradients) per the design system.
 */
export function GradientBackground({ children, className = '' }: GradientBackgroundProps) {
  return (
    <div
      className={`relative min-h-screen w-full overflow-hidden ${className}`}
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
