import { useCallback, useEffect, useRef, useState } from 'react';
import InfoDot from '../components/InfoDot';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, Inbox, LifeBuoy, MessageSquareReply, Send } from 'lucide-react';
import Tiles from '../components/Tiles';
import './talk.css';
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
  /** The first ticket in the list opens by itself once, so the reader is never an empty box on arrival. */
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || open || !shown[0]) return;
    autoOpened.current = true;
    void (async () => { await show(shown[0]); })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, open]);
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
      {/* 2026-11-22: an inbox. The queue, then the open ticket as a conversation with its reply box pinned under it. */}
      <div className="sp" data-va-keep>
        <section className="card sp-queue" data-support-list>
          <h2 className="section-title"><LifeBuoy size={14} /> Tickets <InfoDot tip="Opened by gym owners and front desks from their admin app's Support page. Replying notifies whoever opened it." /></h2>
          {shown.length === 0 && <p className="sp-none">{filter === 'waiting' ? 'Nothing waiting for you.' : 'None.'}</p>}
          <ul className="sp-list">
            {shown.map((t) => (
              <li key={t.id}>
                <button type="button" className={`sp-row${open?.id === t.id ? ' on' : ''}`} aria-current={open?.id === t.id} onClick={() => void show(t)}>
                  <span className="sp-row-top">
                    <b>{t.subject}</b>
                    {extras.get(t.id)?.kind === 'bug' && <span className="sp-tag" data-bug-badge>Bug</span>}
                    {t.unread && <i className="sp-dot" aria-label="New" />}
                  </span>
                  <span className="sp-row-sub">{t.gym_name} · {t.opened_by_name}</span>
                  <span className="sp-row-sub">{t.status === 'closed' ? 'closed' : t.last_from === 'gym' ? 'waiting for you' : 'answered'} · {when(t.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={paged.page} perPage={paged.perPage} total={paged.total} noun={paged.total === 1 ? 'ticket' : 'tickets'} onPage={paged.setPage} />
        </section>

        <section className="card sp-read">
          {!open ? <p className="sp-none">Choose a ticket on the left to read and reply.</p> : (
            <>
              <header className="sp-head">
                <span className="sp-title">
                  <b>{open.subject}</b>
                  <span><Link to={`/gyms/${open.gym_id}`}>{open.gym_name}</Link> · opened by {open.opened_by_name} · {when(open.created_at)}</span>
                </span>
                <span className={`sp-state${open.status === 'closed' ? '' : ' open'}`}><i />{open.status === 'closed' ? 'Closed' : open.last_from === 'gym' ? 'Waiting for you' : 'Answered'}</span>
                <button className="btn ghost" disabled={busy}
                  onClick={() => void run(async () => { await setTicketStatus(open.id, open.status === 'closed' ? 'open' : 'closed');
                    setOpen({ ...open, status: open.status === 'closed' ? 'open' : 'closed' }); })}>
                  {open.status === 'closed' ? 'Reopen' : 'Close'}
                </button>
              </header>

              <div className="sp-ctx">
                {extras.get(open.id)?.screenshot && (
                  <div className="sp-ctx-row"><span>Screenshot</span>
                    <button type="button" className="btn ghost sm"
                      onClick={() => void supportScreenshot(extras.get(open.id)!.screenshot!).then((u) => u && window.open(u, '_blank', 'noopener'))}>
                      Open their screenshot
                    </button>
                  </div>
                )}
                {access?.context?.message && (
                  <div className="sp-ctx-row"><span>Error report</span>
                    <code>{access.context.message}{access.context.route ? `, on ${access.context.route}` : ''}{access.context.build ? ` · build ${access.context.build}` : ''}</code>
                  </div>
                )}
                <div className="sp-ctx-row"><span>Support access</span>
                  {access?.live ? (
                    <em>Open until {when(access.expires_at!)}, read-only. <Link to={`/gyms/${open.gym_id}`}>Open the gym</Link> and use Support view.</em>
                  ) : access?.requested_at && !access.answer ? (
                    <em>Asked for {access.hours} h, waiting for the owner to approve it on the ticket.</em>
                  ) : asking ? (
                    <span className="sp-ask">
                      <select value={asking.hours} onChange={(e) => setAsking({ ...asking, hours: Number(e.target.value) })} aria-label="Hours">
                        {[1, 2, 4, 8, 24].map((h) => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>)}
                      </select>
                      <input value={asking.why} maxLength={300} onChange={(e) => setAsking({ ...asking, why: e.target.value })}
                        placeholder="What you need to look at, the owner reads this" aria-label="Why" />
                      <button className="btn sm" disabled={busy || !asking.why.trim()}
                        onClick={() => void run(async () => { await requestTicketAccess(open.id, asking.hours, asking.why.trim()); setAsking(null); })}>Ask the owner</button>
                      <button className="btn ghost sm" onClick={() => setAsking(null)}>Cancel</button>
                    </span>
                  ) : (
                    <em>
                      {access?.answer === 'declined' ? 'The owner declined the last request. ' : access?.answer === 'approved' ? 'The window from this ticket has ended. ' : 'Read-only, time-limited, approved by the owner on this ticket. '}
                      {open.status !== 'closed' && <button className="btn ghost sm" onClick={() => setAsking({ hours: 4, why: '' })}>Ask for access</button>}
                    </em>
                  )}
                </div>
                {access?.resolution && (
                  <div className="sp-ctx-row"><span>Fixed</span><em style={{ whiteSpace: 'pre-wrap' }}>{access.resolution}</em></div>
                )}
              </div>

              <div className="sp-thread">
                {msgs.map((m) => (
                  <div key={m.id} className={`sp-msg${m.from_platform ? ' mine' : ''}`}>
                    <span className="sp-msg-who">{m.author_name} · {when(m.created_at)}</span>
                    <span className="sp-msg-body">{m.body}</span>
                  </div>
                ))}
              </div>

              <div className="sp-compose">
                {fix !== null ? (
                  <>
                    <textarea rows={3} value={fix} maxLength={2000} onChange={(e) => setFix(e.target.value)} aria-label="What was fixed"
                      placeholder="What was wrong and what you changed, the gym reads this, and any access from this ticket ends" />
                    <div className="sp-compose-row">
                      <button className="btn" disabled={busy || !fix.trim()}
                        onClick={() => void run(async () => { await resolveTicket(open.id, fix.trim()); setFix(null); setOpen({ ...open, status: 'closed' }); })}>
                        Close as fixed
                      </button>
                      <button className="btn ghost" onClick={() => setFix(null)}>Back to the reply</button>
                    </div>
                  </>
                ) : (
                  <>
                    <textarea rows={3} value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)}
                      placeholder="Your reply, the person who opened it is notified" aria-label="Reply" />
                    <div className="sp-compose-row">
                      <button className="btn" disabled={busy || !reply.trim()} onClick={() => void run(async () => { await replyTicket(open.id, reply); setReply(''); })}>
                        <Send size={14} /> Reply
                      </button>
                      <button className="btn ghost" disabled={busy || !reply.trim()}
                        onClick={() => void run(async () => { await replyTicket(open.id, reply, true); setReply(''); setOpen({ ...open, status: 'closed' }); })}>
                        Reply and close
                      </button>
                      <span className="spacer" />
                      {open.status !== 'closed' && <button className="btn ghost" onClick={() => setFix('')}>Mark fixed…</button>}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
