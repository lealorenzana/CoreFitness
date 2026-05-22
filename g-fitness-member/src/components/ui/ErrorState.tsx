import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

/** Standard error UI for failed data fetches in the member app. */
export default function ErrorState({ message = 'Something went wrong while loading.', onRetry }: ErrorStateProps) {
  return (
    <div
      className="rounded-2xl p-6 text-center"
      style={{ background: 'var(--color-secondary-light)', border: '1px solid rgba(245,158,11,0.30)' }}
    >
      <div
        className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--color-secondary-light)' }}
      >
        <AlertTriangle size={22} style={{ color: 'var(--color-secondary)' }} />
      </div>
      <p className="text-sm font-semibold text-white">Couldn’t load data</p>
      <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-4 py-2 rounded-xl font-semibold text-sm text-black"
          style={{ background: 'var(--color-secondary)' }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}
