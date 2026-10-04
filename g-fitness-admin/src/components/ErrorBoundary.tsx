import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/errorReporter';
import { openTicketWithContext } from '../lib/api/support';

type State = { failed: boolean; message: string; note: string; sent: 'idle' | 'sending' | 'sent' | 'failed' };

/**
 * The last line of defence: a render crash shows this instead of a blank
 * screen, and is reported to `client_errors` (0095). Plain styles on purpose —
 * whatever broke may have been the design system.
 *
 * The member app has the same boundary without the last part: here the owner
 * or desk can also tell Core Fitness what they were doing, which opens a
 * support ticket with the error, the screen and nothing about members attached
 * (0162) — a crash reaches the people who can fix it, as a conversation.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, message: '', note: '', sent: 'idle' };

  static getDerivedStateFromError(error: Error) {
    return { failed: true, message: String(error?.message ?? error).slice(0, 500) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { where: `render ${info.componentStack?.split('\n').find((l) => l.trim())?.trim() ?? ''}`.slice(0, 120) });
  }

  private send = async () => {
    this.setState({ sent: 'sending' });
    try {
      await openTicketWithContext(`Something broke on ${window.location.pathname}`,
        this.state.note.trim() || 'The screen showed "Something went wrong".',
        { message: this.state.message, route: window.location.pathname });
      this.setState({ sent: 'sent' });
    } catch {
      this.setState({ sent: 'failed' });
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;
    const { sent, note } = this.state;
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 14, padding: 24, textAlign: 'center', background: '#08080E', color: '#E9E9ED', fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <p style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</p>
        <p style={{ fontSize: 14, lineHeight: 1.5, maxWidth: 380, color: '#A5A8BA' }}>
          This screen hit a problem and could not be shown. Core Fitness has been sent the error.
          Nothing you saved has been lost.
        </p>
        <button onClick={() => window.location.reload()} style={{
          height: 46, padding: '0 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
          background: '#F59E0B', color: '#08080E', border: 'none', cursor: 'pointer',
        }}>
          Reload
        </button>
        <div style={{ width: '100%', maxWidth: 380, marginTop: 12, textAlign: 'left' }}>
          {sent === 'sent' ? (
            <p style={{ fontSize: 13, color: '#C4B5FD' }}>Sent — it is under Support, and Core Fitness replies there.</p>
          ) : (
            <>
              <label htmlFor="crash-note" style={{ fontSize: 13, fontWeight: 600 }}>Tell us what you were doing (optional)</label>
              <textarea id="crash-note" value={note} rows={3} maxLength={2000}
                onChange={(e) => this.setState({ note: e.target.value })}
                placeholder="I pressed Save on a payment and the page went blank"
                style={{ width: '100%', marginTop: 6, padding: 10, borderRadius: 8, fontSize: 13, background: '#14141D', color: '#E9E9ED', border: '1px solid #26263A' }} />
              <button onClick={() => void this.send()} disabled={sent === 'sending'} style={{
                marginTop: 8, height: 40, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: 'transparent', color: '#E9E9ED', border: '1px solid #36354F', cursor: 'pointer',
              }}>
                {sent === 'sending' ? 'Sending…' : 'Send to Core Fitness support'}
              </button>
              {sent === 'failed' && <p style={{ fontSize: 12.5, color: '#F59E0B', marginTop: 6 }}>It could not be sent — reload and try Support from the menu.</p>}
              <p style={{ fontSize: 12, color: '#8A8AA0', marginTop: 6 }}>The error and this screen&rsquo;s address go with it — nothing about your members.</p>
            </>
          )}
        </div>
      </div>
    );
  }
}
