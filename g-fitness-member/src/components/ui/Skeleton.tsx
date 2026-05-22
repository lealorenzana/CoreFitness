import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

/** Standard skeleton block — pulses gently in violet/dark tones. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-xl', className)}
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    />
  );
}

/** A row of skeleton lines (text-loading state). */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}

/** Card-shaped skeleton — matches the standard 12px-radius card. */
export function SkeletonCard({ className }: SkeletonProps) {
  return <Skeleton className={cn('h-24 w-full', className)} />;
}
