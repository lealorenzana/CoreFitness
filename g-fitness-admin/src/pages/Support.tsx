import { useCallback, useEffect, useRef, useState } from 'react';
import { Bug, CheckCircle2, LifeBuoy, Send, ShieldCheck } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import {
  approveTicketAccess, closeTicket, declineTicketAccess, myTickets, openTicket, replyTicket, thread, ticketAccess,
  type ThreadMessage, type Ticket, type TicketAccess,
} from '../lib/api/support';
import { revokeSupportAccess } from '../lib/api/gymApp';
import { getGymContext } from '../lib/gymContext';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Support (0137): questions and problems for Core Fitness, from the owner or
 * the desk. Each ticket is a thread between this gym and the platform; a reply
 * arrives as a notification and a "new" mark here.
 *
 * Support access lives here (0162), not on Your app: Core Fitness asks for a
 * few hours of read-only access *on the ticket it is for*, the owner answers
 * with one tap, the window shows while it is open, and the fix is written on
 * the ticket when it is closed. A ticket opened from a crash screen carries
 * the error with it.
 */
export default function Support() {
  const [tickets, setTickets] = useState<Ticket[] | null | undefined>(null);
  const [open, setOpenState] = useState<Ticket | null>(null);
  const openId = useRef<string | null>(null);
  const setOpen = (t: Ticket | null) => { openId.current = t?.id ?? null; setOpenState(t); };
  const [msgs, setMsgs] = useState<ThreadMessage[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useState<TicketAccess | null>(null);
  const [owner, setOwner] = useState(false);
  useEffect(() => { void getGymContext().then((c) => setOwner(c?.role === 'admin')); }, []);

  const load = useCallback(async () => { setTickets(await myTickets()); }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const show = async (t: Ticket) => {
    setOpen(t);
    setAccess(null);
    try { setMsgs(await thread(t.id)); setAccess(await ticketAccess(t.id)); await load(); } catch (e) { showToast(e instanceof Error ? e.message : 'Could not open it', 'error'); }
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn(); showToast(ok, 'success'); await load();
      if (openId.current) { setMsgs(await thread(openId.current)); setAccess(await ticketAccess(openId.current)); }
    }
    catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
    finally { setBusy(false); }
  };

  if (tickets === null) return <div className="text-sm" style={{ color: MUTED }}>Loading…</div>;
  if (tickets === undefined) return <Card className="!p-4"><p className="text-xs text-white">Support is not switched on yet — paste migration 0137.</p></Card>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><LifeBuoy size={22} /> Support</h1>
        <p className="text-xs mt-1" style={{ color: MUTED }}>Ask Core Fitness anything — a problem, a question, an idea. We reply here and you get a notification.</p>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)' }}>
        <div className="space-y-4">
          <Card className="!p-4">
            <p className="text-xs font-semibold text-white mb-2">New message</p>
            <input value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="Subject, e.g. Receipts will not print"
              aria-label="Subject" className="w-full h-9 px-3 rounded-lg text-xs text-white" style={FIELD} />
            <textarea value={body} rows={4} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder="What happened, and what you expected"
              aria-label="Message" className="w-full px-3 py-2 rounded-lg text-xs text-white mt-2" style={FIELD} />
            <Button variant="secondary" className="mt-2" disabled={busy || !subject.trim() || !body.trim()}
              onClick={() => void run(async () => { const id = await openTicket(subject, body); setSubject(''); setBody('');
                const list = await myTickets(); const t = list?.find((x) => x.id === id); if (t) await show(t); }, 'Sent to Core Fitness')}>
              <Send size={14} /> Send
            </Button>
          </Card>
          <Card className="!p-4">
            <p className="text-xs font-semibold text-white mb-2">Your messages</p>
            {tickets.length === 0 && <p className="text-xs" style={{ color: MUTED }}>None yet.</p>}
            <div className="space-y-1.5">
              {tickets.map((t) => (
                <button key={t.id} onClick={() => void show(t)} className="w-full text-left rounded-lg px-3 py-2"
                  style={{ ...FIELD, borderColor: open?.id === t.id ? 'var(--color-primary)' : 'var(--color-border)' }}>
                  <p className="text-xs font-semibold text-white flex items-center gap-2">
                    <span className="flex-1 truncate">{t.subject}</span>
                    {t.unread && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-secondary)', color: '#111' }}>NEW</span>}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                    {t.status === 'answered' ? 'Answered' : t.status === 'closed' ? 'Closed' : 'Waiting for Core Fitness'} · {when(t.updatedAt)}
                  </p>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Card className="!p-4">
          {!open ? <p className="text-xs py-10 text-center" style={{ color: MUTED }}>Open a message to read the thread.</p> : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-white">{open.subject}</p>
                {open.status !== 'closed' && <Button size="sm" variant="ghost" disabled={busy}
                  onClick={() => void run(async () => { await closeTicket(open.id); setOpen({ ...open, status: 'closed' }); }, 'Closed')}>Mark solved</Button>}
              </div>
              {access?.context?.message && (
                <div className="rounded-lg px-3 py-2 mb-3 text-[11px] flex gap-2" style={{ ...FIELD, color: 'var(--color-text-secondary)' }}>
                  <Bug size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-secondary)' }} />
                  <span>Sent with the error report: <b className="text-white">{access.context.message}</b>{access.context.route ? ` on ${access.context.route}` : ''}. No member details go with it.</span>
                </div>
              )}
              {access?.requested_at && !access.answer && (
                <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--color-secondary-light)', border: '1px solid var(--color-secondary)' }}>
                  <p className="text-xs font-semibold text-white flex items-center gap-1.5"><ShieldCheck size={14} /> Core Fitness asks to look at your gym for {access.hours} hour{access.hours === 1 ? '' : 's'}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Why: {access.why}. They can only look — the database refuses them every change — it ends by itself, and every visit is in your activity log.
                  </p>
                  {owner ? (
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => approveTicketAccess(open.id), 'Access open — it ends by itself')}>Approve</Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => declineTicketAccess(open.id), 'Declined')}>Decline</Button>
                    </div>
                  ) : <p className="text-[11px] mt-2" style={{ color: MUTED }}>Only the gym owner can answer this.</p>}
                </div>
              )}
              {access?.live && (
                <div className="rounded-xl p-3 mb-3 flex items-center gap-3 flex-wrap" style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)' }}>
                  <ShieldCheck size={15} style={{ color: 'var(--color-primary)' }} />
                  <p className="text-[11px] flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Core Fitness can look until {when(access.expires_at!)}. {access.first_used_at ? 'They have looked.' : 'Nobody has looked yet.'}
                  </p>
                  {owner && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => revokeSupportAccess(), 'Access withdrawn')}>Withdraw now</Button>}
                </div>
              )}
              {access?.resolution && (
                <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)' }}>
                  <p className="text-xs font-semibold text-white flex items-center gap-1.5"><CheckCircle2 size={14} /> What was fixed</p>
                  <p className="text-[11px] mt-1 whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>{access.resolution}</p>
                </div>
              )}
              <div className="space-y-2">
                {msgs.map((m) => (
                  <div key={m.id} className="rounded-lg px-3 py-2" style={{ background: m.fromPlatform ? 'var(--color-primary-light)' : 'var(--color-surface-high)',
                    border: `1px solid ${m.fromPlatform ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
                    <p className="text-[10px] font-semibold" style={{ color: m.fromPlatform ? 'var(--color-primary)' : MUTED }}>{m.authorName} · {when(m.createdAt)}</p>
                    <p className="text-xs text-white mt-1 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
              <textarea value={reply} rows={3} maxLength={4000} onChange={(e) => setReply(e.target.value)} placeholder="Reply"
                aria-label="Reply" className="w-full px-3 py-2 rounded-lg text-xs text-white mt-3" style={FIELD} />
              <Button variant="secondary" className="mt-2" disabled={busy || !reply.trim()}
                onClick={() => void run(async () => { await replyTicket(open.id, reply); setReply(''); }, 'Reply sent')}>
                <Send size={14} /> Reply
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
