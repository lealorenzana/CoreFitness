import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * A screen that throws should say so, not go white.
 *
 * Both other apps have had one of these for a while; this app did not, which
 * meant a bad row or a renamed column turned the whole thing into a blank page
 * with the reason only in a console nobody had open.
 *
 * It deliberately does *not* file a crash report the way the member and admin
 * apps do (0095). Those reports are read on this app's own Platform screen —
 * a tool reporting its own failure into the list it is failing to draw is a
 * loop, and the message is right here on screen anyway.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="card notice">
        <div className="name">This screen stopped</div>
        <div className="meta">
          Nothing was changed by it. The other tabs still work — and if this happened just after a
          migration, the probe is the first thing to check:
          <code style={{ marginLeft: 6 }}>python scripts/probe-migrations.py</code>
        </div>
        <pre className="handover-box">{error.message}</pre>
        <div style={{ height: 12 }} />
        <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
