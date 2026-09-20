import { useEffect, useState } from 'react';
import { listCrashes, listEvents, type CrashReport, type PlatformEvent } from '../lib/platform';

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The platform's own health: what the owner decided, and what has crashed
 * anywhere on the service.
 *
 * Crash reports are the one thing here that crosses gyms — they are the
 * platform's to fix (0095 files them, 0106 reads them). They carry a screen and
 * an error, never a member's data.
 */
export default function Platform() {
  const [events, setEvents] = useState<PlatformEvent[] | null>(null);
  const [crashes, setCrashes] = useState<CrashReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [e, c] = await Promise.all([listEvents(60), listCrashes(14)]);
        setEvents(e);
        setCrashes(c);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the platform log');
      }
    })();
  }, []);

  // One line per distinct message: fifty copies of one broken screen is one
  // problem, and a list of fifty hides the other two.
  const grouped = (crashes ?? []).reduce<Record<string, { n: number; last: CrashReport }>>((acc, c) => {
    const key = `${c.app}:${c.message}`;
    acc[key] = { n: (acc[key]?.n ?? 0) + 1, last: acc[key]?.last ?? c };
    return acc;
  }, {});

  return (
    <>
      {error && <p className="err">{error}</p>}

      <div className="card">
        <div className="name">Crashes, last 14 days</div>
        <div className="meta">Filed automatically by both apps when a screen breaks (0095).</div>
        <div style={{ marginTop: 10 }}>
          {crashes === null && <p className="empty">Loading…</p>}
          {crashes?.length === 0 && <p className="empty">Nothing has crashed. </p>}
          {Object.entries(grouped).map(([key, { n, last }]) => (
            <div className="log" key={key}>
              <strong style={{ color: 'var(--text)' }}>{last.message.slice(0, 140)}</strong>
              <br />
              {last.app} · {last.gym_name ?? 'before sign-in'} · {last.route ?? 'no route'} ·{' '}
              {n} time{n === 1 ? '' : 's'} · last {stamp(last.created_at)}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="name">What the platform did</div>
        <div className="meta">Every gym let in, suspended, reactivated or moved to another plan.</div>
        <div style={{ marginTop: 10 }}>
          {events === null && <p className="empty">Loading…</p>}
          {events?.length === 0 && <p className="empty">Nothing yet.</p>}
          {events?.map((e) => (
            <div className="log" key={e.id}>
              {e.summary}
              {typeof e.detail?.reason === 'string' && <> — “{e.detail.reason as string}”</>}
              <span className="muted"> · {stamp(e.created_at)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="name">Migrations</div>
        <div className="meta">
          Which are live is asked of the database, never assumed:
          <code style={{ marginLeft: 6 }}>python scripts/probe-migrations.py</code>. Paste waiting ones
          one at a time, in number order, in the Supabase SQL editor — and the matching
          <code style={{ margin: '0 4px' }}>scripts/sql/verify/verifyNNNN.sql</code> after each.
        </div>
      </div>
    </>
  );
}
