import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, Inbox, LifeBuoy, MessageSquareReply, Send } from 'lucide-react';
import Tiles from '../components/Tiles';
import {
  CHANGED, explain, listTickets, replyTicket, setTicketStatus, ticketThread, type PlatformTicket, type TicketMessage,
} from '../lib/platform';

const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
type Filter = 'waiting' | 'all' | 'closed';

/**
 * Support (0137): what gym owners and desks have asked Core Fitness, from their
 * admin app. Waiting-for-you first. Replying notifies whoever opened it; each
 * thread is between that gym and the platform only.
 */
export default function Support() {
  const [tickets, setTickets] = useState<PlatformTicket[] | null>(null);
  const [filter, setFilter] = useState<Filter>('waiting');
  const [open, setOpenState] = useState<PlatformTicket | null>(null);
  const openId = useRef<string | null>(null);
  const setOpen = (t: PlatformTicket | null) => { openId.current = t?.id ?? null; setOpenState(t); };
  const [msgs, setMsgs] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setTickets(await listTickets()); setError(null); }
    catch (e) { setError(explain(e, '0137')); setTickets([]); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const show = async (t: PlatformTicket) => {
    setOpen(t);
    try { setMsgs(await ticketThread(t.id)); await load(); window.dispatchEvent(new Event(CHANGED)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not open it'); }
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); if (openId.current) setMsgs(await ticketThread(openId.current)); window.dispatchEvent(new Event(CHANGED)); }
    catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(false); }
  };

  if (tickets === null) return <p className="empty">Loading support…</p>;
  const shown = tickets.filter((t) => filter === 'all' ? true : filter === 'closed' ? t.status === 'closed'
    : t.status !== 'closed' && t.last_from === 'gym');

  return (
    <>
      {error && <p className="err">{error}</p>}
      <Tiles items={[
        { icon: Inbox, value: String(tickets.filter((t) => t.status !== 'closed' && t.last_from === 'gym').length), label: 'Waiting for you',
          act: tickets.some((t) => t.status !== 'closed' && t.last_from === 'gym'), onClick: () => setFilter('waiting'), on: filter === 'waiting' },
        { icon: MessageSquareReply, value: String(tickets.filter((t) => t.status !== 'closed' && t.last_from === 'platform').length), label: 'Answered, still open' },
        { icon: CheckCircle2, value: String(tickets.filter((t) => t.status === 'closed').length), label: 'Closed', onClick: () => setFilter('closed'), on: filter === 'closed' },
        { icon: Building2, value: String(tickets.length), label: `All tickets · ${new Set(tickets.map((t) => t.gym_id)).size} gyms`, onClick: () => setFilter('all'), on: filter === 'all' },
      ]} />
      {/* The tiles are the filter; a second row of buttons saying the same was clutter. */}
      <div className="grid-2" style={{ marginTop: 0, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)' }}>
        <section className="card">
          <h2 className="section-title"><LifeBuoy size={14} /> Tickets</h2>
          {shown.length === 0 && <p className="empty"><CheckCircle2 size={22} className="empty-icon" />{filter === 'waiting' ? 'Nothing waiting for you.' : 'None.'}</p>}
          {shown.map((t) => (
            <button key={t.id} type="button" className="linky" onClick={() => void show(t)}
              style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 6, border: `1px solid ${open?.id === t.id ? 'var(--accent)' : 'var(--border-soft)'}`, background: 'var(--surface-raised)' }}>
              <span className="name" style={{ fontSize: 13.5, display: 'flex', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                {t.unread && <span className="pill warn">New</span>}
              </span>
              <span className="meta">{t.gym_name} · {t.opened_by_name} · {t.status === 'closed' ? 'closed' : t.last_from === 'gym' ? 'waiting for you' : 'answered'} · {when(t.updated_at)}</span>
            </button>
          ))}
        </section>

        <section className="card">
          {!open ? <p className="empty"><LifeBuoy size={22} className="empty-icon" />Open a ticket to read and reply.</p> : (
            <>
              <div className="row" style={{ marginBottom: 12 }}>
                <span className="grow">
                  <span className="name">{open.subject}</span>
                  <span className="meta"><Link to={`/gyms/${open.gym_id}`}>{open.gym_name}</Link> · opened by {open.opened_by_name} · {when(open.created_at)}</span>
                </span>
                <button className="btn ghost" disabled={busy}
                  onClick={() => void run(async () => { await setTicketStatus(open.id, open.status === 'closed' ? 'open' : 'closed');
                    setOpen({ ...open, status: open.status === 'closed' ? 'open' : 'closed' }); })}>
                  {open.status === 'closed' ? 'Reopen' : 'Close'}
                </button>
              </div>
              {msgs.map((m) => (
                <div key={m.id} style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 8,
                  background: m.from_platform ? 'var(--accent-tint)' : 'var(--surface-raised)',
                  border: `1px solid ${m.from_platform ? '#3B2566' : 'var(--border-soft)'}` }}>
                  <span className="meta" style={{ marginTop: 0, color: m.from_platform ? 'var(--accent-text)' : undefined }}>{m.author_name} · {when(m.created_at)}</span>
                  <span style={{ display: 'block', fontSize: 13.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{m.body}</span>
                </div>
              ))}
              <textarea rows={4} value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)}
                placeholder="Your reply — the person who opened it is notified" aria-label="Reply" style={{ marginTop: 8 }} />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" disabled={busy || !reply.trim()} onClick={() => void run(async () => { await replyTicket(open.id, reply); setReply(''); })}>
                  <Send size={14} /> Reply
                </button>
                <button className="btn ghost" disabled={busy || !reply.trim()}
                  onClick={() => void run(async () => { await replyTicket(open.id, reply, true); setReply(''); setOpen({ ...open, status: 'closed' }); })}>
                  Reply and close
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
