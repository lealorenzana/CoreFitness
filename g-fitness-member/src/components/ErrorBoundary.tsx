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
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        fontFamily: 'Inter, system-ui, sans-serif', color: '#FFFFFF',
        background: 'radial-gradient(1px 1px at 14% 20%, #b6a3c9 50%, transparent 51%), radial-gradient(1.5px 1.5px at 80% 14%, #b6a3c9aa 50%, transparent 51%), '
          + 'radial-gradient(1px 1px at 40% 70%, #b6a3c9aa 50%, transparent 51%), radial-gradient(1px 1px at 88% 80%, #b6a3c988 50%, transparent 51%), '
          + 'radial-gradient(ellipse 70% 50% at 50% 0%, rgb(124 58 237 / .18), transparent 70%), #0e0d12',
      }}>
        <div style={{
          position: 'relative', width: '100%', maxWidth: 440, padding: '108px 26px 28px', marginTop: 70, textAlign: 'center', borderRadius: 36,
          border: '1px solid rgb(166 129 226 / .23)', background: 'radial-gradient(ellipse at 50% 0%, rgb(245 165 36 / .16), transparent 60%), linear-gradient(160deg, #332143, #20162d 72%)',
        }}>
          {/* Plain styles on purpose (whatever broke may be the design system); the picture is a plain <img> from public/. */}
          <img src="/mockup-art/bottle-mascot.webp" alt="" width={150} height={150}
            style={{ position: 'absolute', left: '50%', top: -72, width: 150, height: 'auto', transform: 'translateX(-50%)', filter: 'drop-shadow(0 14px 18px rgb(0 0 0 / .45))' }} />
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#f5a524' }}>Hang on</p>
          <p style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-.02em', margin: '6px 0 10px' }}>Something went wrong</p>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#d7cfe0' }}>
            This screen hit a problem and could not be shown. Core Fitness has been sent the error.
            Nothing you saved has been lost.
          </p>
          <button onClick={() => window.location.reload()} style={{
            marginTop: 18, height: 48, padding: '0 28px', borderRadius: 16, fontSize: 15, fontWeight: 700,
            background: '#f5a524', color: '#1a1205', border: 'none', cursor: 'pointer',
          }}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
