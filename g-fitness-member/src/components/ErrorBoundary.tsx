import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/errorReporter';

/**
 * The last line of defence: a render crash shows this instead of a blank
 * screen, and is reported to `client_errors` (0095). Plain styles on purpose —
 * whatever broke may have been the design system.
 *
 * Identical in both apps.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { where: `render ${info.componentStack?.split('\n').find((l) => l.trim())?.trim() ?? ''}`.slice(0, 120) });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 14, padding: 24, textAlign: 'center', background: '#08080E', color: '#E9E9ED', fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <p style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</p>
        <p style={{ fontSize: 14, lineHeight: 1.5, maxWidth: 340, color: '#A5A8BA' }}>
          This screen hit a problem and could not be shown. It has been reported to the gym.
          Nothing you saved has been lost.
        </p>
        <button onClick={() => window.location.reload()} style={{
          height: 46, padding: '0 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
          background: '#F59E0B', color: '#08080E', border: 'none', cursor: 'pointer',
        }}>
          Reload
        </button>
      </div>
    );
  }
}
