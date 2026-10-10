import { useCallback, useEffect, useRef, useState } from 'react';
import InfoDot from '../components/InfoDot';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, Inbox, LifeBuoy, MessageSquareReply, Send } from 'lucide-react';
import Tiles from '../components/Tiles';
import SupportGrants from '../components/SupportGrants';
import Pagination from '../components/Pagination';
import { usePaged } from '../lib/usePaged';
import { supportScreenshot, ticketExtras,
  CHANGED, explain, listTickets, replyTicket, requestTicketAccess, resolveTicket, setTicketStatus, ticketAccess, ticketThread,
  type PlatformTicket, type TicketAccess, type TicketMessage,
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
  const [access, setAccess] = useState<TicketAccess | null>(null);
  const [asking, setAsking] = useState<{ hours: number; why: string } | null>(null);
  const [fix, setFix] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setTickets(await listTickets()); setError(null); }
    catch (e) { setError(explain(e, '0137')); setTickets([]); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  /** Bug reports and their screenshots (0188). */
  const [extras, setExtras] = useState<Map<string, { kind: string; screenshot: string | null }>>(new Map());
  useEffect(() => { void (async () => { if (tickets) setExtras(await ticketExtras(tickets.map((t) => t.id))); })(); }, [tickets]);

  const show = async (t: PlatformTicket) => {
    setOpen(t);
    setAccess(null); setAsking(null); setFix(null);
    try { setMsgs(await ticketThread(t.id)); setAccess(await ticketAccess(t.id).catch(() => null)); await load(); window.dispatchEvent(new Event(CHANGED)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not open it'); }
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); if (openId.current) { setMsgs(await ticketThread(openId.current)); setAccess(await ticketAccess(openId.current).catch(() => null)); } window.dispatchEvent(new Event(CHANGED)); }
    catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(false); }
  };

  // Paged before the early return: a hook after it would run on some renders only.
  const shownAll = (tickets ?? []).filter((t) => filter === 'all' ? true : filter === 'closed' ? t.status === 'closed'
    : t.status !== 'closed' && t.last_from === 'gym');
  const paged = usePaged(shownAll);
  const shown = paged.rows;
  if (tickets === null) return <p className="empty">Loading support…</p>;

  return (
    <>
      {error && <p className="err">{error}</p>}
      <SupportGrants />
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
          <h2 className="section-title"><LifeBuoy size={14} /> Tickets <InfoDot tip="Opened by gym owners and front desks from their admin app's Support page. Replying notifies whoever opened it." /></h2>
          {shown.length === 0 && <p className="empty"><CheckCircle2 size={22} className="empty-icon" />{filter === 'waiting' ? 'Nothing waiting for you.' : 'None.'}</p>}
          {shown.map((t) => (
            <button key={t.id} type="button" className="linky" onClick={() => void show(t)}
              style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 6, border: `1px solid ${open?.id === t.id ? 'var(--accent)' : 'var(--border-soft)'}`, background: 'var(--surface-raised)' }}>
              <span className="name" style={{ fontSize: 13.5, display: 'flex', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                {extras.get(t.id)?.kind === 'bug' && <span className="pill" data-bug-badge>Bug</span>}
                {t.unread && <span className="pill warn">New</span>}
              </span>
              <span className="meta">{t.gym_name} · {t.opened_by_name} · {t.status === 'closed' ? 'closed' : t.last_from === 'gym' ? 'waiting for you' : 'answered'} · {when(t.updated_at)}</span>
            </button>
          ))}
          <Pagination page={paged.page} perPage={paged.perPage} total={paged.total} noun={paged.total === 1 ? 'ticket' : 'tickets'} onPage={paged.setPage} />
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
              {extras.get(open.id)?.screenshot && (
                <button type="button" className="btn ghost" style={{ marginBottom: 10 }}
                  onClick={() => void supportScreenshot(extras.get(open.id)!.screenshot!).then((u) => u && window.open(u, '_blank', 'noopener'))}>
                  Open their screenshot
                </button>
              )}
              {access?.context?.message && (
                <div className="card" style={{ padding: 12, marginBottom: 10 }}>
                  <span className="name" style={{ fontSize: 13 }}>Error report attached</span>
                  <span className="meta" style={{ display: 'block', fontFamily: 'ui-monospace, Consolas, monospace', whiteSpace: 'pre-wrap' }}>
                    {access.context.message}{access.context.route ? ` — on ${access.context.route}` : ''}{access.context.build ? ` · build ${access.context.build}` : ''}
                  </span>
                </div>
              )}
              <div className="card" style={{ padding: 12, marginBottom: 10 }}>
                <span className="name" style={{ fontSize: 13 }}>Support access</span>
                {access?.live ? (
                  <span className="meta" style={{ display: 'block' }}>Open until {when(access.expires_at!)} — read-only. <Link to={`/gyms/${open.gym_id}`}>Open the gym</Link> and use Support view.</span>
                ) : access?.requested_at && !access.answer ? (
                  <span className="meta" style={{ display: 'block' }}>Asked for {access.hours} h — waiting for the owner to approve it on the ticket.</span>
                ) : asking ? (
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <select value={asking.hours} onChange={(e) => setAsking({ ...asking, hours: Number(e.target.value) })} aria-label="Hours">
                      {[1, 2, 4, 8, 24].map((h) => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>)}
                    </select>
                    <input className="grow" value={asking.why} maxLength={300} onChange={(e) => setAsking({ ...asking, why: e.target.value })}
                      placeholder="What you need to look at — the owner reads this" aria-label="Why" />
                    <button className="btn" disabled={busy || !asking.why.trim()}
                      onClick={() => void run(async () => { await requestTicketAccess(open.id, asking.hours, asking.why.trim()); setAsking(null); })}>Ask the owner</button>
                    <button className="btn ghost" onClick={() => setAsking(null)}>Cancel</button>
                  </div>
                ) : (
                  <span className="meta" style={{ display: 'block' }}>
                    {access?.answer === 'declined' ? 'The owner declined the last request. ' : access?.answer === 'approved' ? 'The window from this ticket has ended. ' : 'Read-only, time-limited, approved by the owner on this ticket. '}
                    {open.status !== 'closed' && <button className="btn ghost" style={{ marginLeft: 4 }} onClick={() => setAsking({ hours: 4, why: '' })}>Ask for access</button>}
                  </span>
                )}
              </div>
              {access?.resolution && (
                <div className="card" style={{ padding: 12, marginBottom: 10 }}>
                  <span className="name" style={{ fontSize: 13 }}>Fixed</span>
                  <span className="meta" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{access.resolution}</span>
                </div>
              )}
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
                {open.status !== 'closed' && <button className="btn ghost" onClick={() => setFix(fix === null ? '' : null)}>Mark fixed…</button>}
              </div>
              {fix !== null && (
                <div style={{ marginTop: 10 }}>
                  <textarea rows={3} value={fix} maxLength={2000} onChange={(e) => setFix(e.target.value)} aria-label="What was fixed"
                    placeholder="What was wrong and what you changed — the gym reads this, and any access from this ticket ends" />
                  <button className="btn" style={{ marginTop: 8 }} disabled={busy || !fix.trim()}
                    onClick={() => void run(async () => { await resolveTicket(open.id, fix.trim()); setFix(null); setOpen({ ...open, status: 'closed' }); })}>
                    Close as fixed
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
