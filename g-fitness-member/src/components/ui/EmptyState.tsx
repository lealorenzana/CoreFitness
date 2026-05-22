import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  cta?: { label: string; onClick: () => void };
  children?: ReactNode;
}

/** Standard empty-state card used across the member app. */
export default function EmptyState({ icon: Icon, title, message, cta, children }: EmptyStateProps) {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <div
        className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--color-primary-light)' }}
      >
        <Icon size={28} style={{ color: 'var(--color-primary)' }} />
      </div>
      <p className="font-semibold text-white">{title}</p>
      {message && (
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{message}</p>
      )}
      {children}
      {cta && (
        <button
          onClick={cta.onClick}
          className="mt-4 px-5 py-2 rounded-xl font-semibold text-sm text-black"
          style={{ background: 'var(--color-secondary)' }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
