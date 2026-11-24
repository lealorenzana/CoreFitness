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
          <img src="/images/admin-art/bottle-mascot.webp" alt="" width={150} height={150}
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
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid rgb(255 255 255 / .12)', textAlign: 'left' }}>
            {sent === 'sent' ? (
              <p style={{ fontSize: 13, color: '#C4B5FD' }}>Sent. It is under Help, and Core Fitness replies there.</p>
            ) : (
              <>
                <label htmlFor="crash-note" style={{ fontSize: 13, fontWeight: 700 }}>Tell us what you were doing (optional)</label>
                <textarea id="crash-note" value={note} rows={3} maxLength={2000}
                  onChange={(e) => this.setState({ note: e.target.value })}
                  placeholder="I pressed Save on a payment and the page went blank"
                  style={{ width: '100%', marginTop: 6, padding: 12, borderRadius: 14, fontSize: 13, background: 'rgb(14 13 18 / .7)', color: '#FFFFFF', border: '1px solid rgb(255 255 255 / .14)', resize: 'vertical' }} />
                <button onClick={() => void this.send()} disabled={sent === 'sending'} style={{
                  marginTop: 8, width: '100%', height: 44, padding: '0 16px', borderRadius: 14, fontSize: 13.5, fontWeight: 700,
                  background: 'transparent', color: '#FFFFFF', border: '1px solid rgb(255 255 255 / .22)', cursor: 'pointer',
                }}>
                  {sent === 'sending' ? 'Sending…' : 'Send to Core Fitness support'}
                </button>
                {sent === 'failed' && <p style={{ fontSize: 12.5, color: '#f5c46b', marginTop: 6 }}>It could not be sent. Reload and try Help from the menu.</p>}
                <p style={{ fontSize: 12, color: '#a99fb3', marginTop: 8 }}>The error and this screen&rsquo;s address go with it, nothing about your members.</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}
