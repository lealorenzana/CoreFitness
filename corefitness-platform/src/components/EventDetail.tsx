import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Clock, Hash, UserRound } from 'lucide-react';
import { searchEvents, type LoggedEvent } from '../lib/insight';

const stamp = (iso: string) => new Date(iso).toLocaleString('en-PH', {
  weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
});
const say = (a: string) => a.replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase());
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};
/** A detail value as words: dates read as dates, money as pesos, lists and objects as text. */
const show = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return /amount|price|total/i.test(k) ? `₱${v.toLocaleString('en-PH')}` : v.toLocaleString('en-PH');
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) return new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleString('en-PH', { dateStyle: 'medium', ...(v.length > 10 ? { timeStyle: 'short' } : {}) });
    return v;
  }
  return JSON.stringify(v);
};

/** Where an event leads, from the ids its detail carries. */
function links(e: LoggedEvent): { to: string; label: string }[] {
  const d = e.detail ?? {};
  const out: { to: string; label: string }[] = [];
  if (e.gym_id) out.push({ to: `/gyms/${e.gym_id}`, label: `Open ${e.gym_name ?? 'the gym'}` });
  if ('application' in d) out.push({ to: '/applications', label: 'Applications' });
  if ('payment' in d || 'claim' in d || e.action.startsWith('gym.paid') || e.action.startsWith('payment.')) out.push({ to: '/money', label: 'Money' });
  if (e.action.startsWith('support.') && e.gym_id) out.push({ to: `/support-access/${e.gym_id}`, label: 'Support access' });
  if ('ticket' in d || e.action.startsWith('ticket.')) out.push({ to: '/support', label: 'Support tickets' });
  if (e.action.startsWith('plan.') || e.action === 'gym.plan') out.push({ to: '/plans', label: 'Plans' });
  return out;
}

/**
 * One event from the platform's log, in full (2026-10-03): the exact time,
 * who did it, the gym, every detail the database recorded with it, where it
 * leads, and what else happened at that gym around it.
 */
export default function EventDetail({ event }: { event: LoggedEvent }) {
  const [around, setAround] = useState<LoggedEvent[] | null>(null);

  useEffect(() => {
    let alive = true;
    if (!event.gym_id) { setAround([]); return; }
    void searchEvents({ gym: event.gym_id, limit: 8 })
      .then((r) => { if (alive) setAround(r.filter((x) => x.id !== event.id).slice(0, 6)); }, () => { if (alive) setAround([]); });
    return () => { alive = false; };
  }, [event]);

  const detail = Object.entries(event.detail ?? {}).filter(([k]) => k !== 'reason');
  const reason = typeof event.detail?.reason === 'string' ? (event.detail.reason as string) : null;

  return (
    <div>
      <p style={{ fontSize: 15, color: 'var(--text)', margin: '0 0 6px' }}>{event.summary}</p>
      {reason && <p className="meta" style={{ marginTop: 0 }}>Reason given: “{reason}”</p>}
      <dl className="kv" style={{ marginTop: 14 }}>
        <dt><Clock size={12} /> When</dt><dd>{stamp(event.created_at)} · {ago(event.created_at)}</dd>
        <dt><Hash size={12} /> Action</dt><dd><code>{event.action}</code> — {say(event.action)}</dd>
        <dt><Building2 size={12} /> Gym</dt><dd>{event.gym_id ? (event.gym_name ?? 'A gym no longer listed') : 'The platform itself'}</dd>
        <dt><UserRound size={12} /> By</dt><dd>{event.actor_name ?? 'Not recorded with this event'}</dd>
        <dt>Event no.</dt><dd>{event.id}</dd>
      </dl>

      {detail.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 18 }}>Recorded with it</h3>
          <dl className="kv">
            {detail.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{say(k)}</dt><dd>{show(k, v)}</dd></div>)}
          </dl>
        </>
      )}

      {links(event).length > 0 && (
        <div className="reach" style={{ marginTop: 16 }}>
          {links(event).map((l) => <Link key={l.to + l.label} to={l.to}>{l.label} <ArrowRight size={12} /></Link>)}
        </div>
      )}

      {event.gym_id && (
        <>
          <h3 className="section-title" style={{ marginTop: 18 }}>Also at {event.gym_name ?? 'this gym'}</h3>
          {around === null ? <p className="empty">Loading…</p> : around.length === 0 ? <p className="meta">Nothing else logged.</p> : (
            <div className="act-list">
              {around.map((x) => (
                <div key={x.id} className="row" style={{ gap: 10, padding: '6px 0', fontSize: 13 }}>
                  <span className="grow" style={{ color: 'var(--text-2)' }}>{x.summary}</span>
                  <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{ago(x.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
