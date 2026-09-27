import { useCallback, useEffect, useRef, useState } from 'react';
import { LifeBuoy, Send } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import { closeTicket, myTickets, openTicket, replyTicket, thread, type ThreadMessage, type Ticket } from '../lib/api/support';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)' };
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Support (0137): questions and problems for Core Fitness, from the owner or
 * the desk. Each ticket is a thread between this gym and the platform; a reply
 * arrives as a notification and a "new" mark here.
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

  const load = useCallback(async () => { setTickets(await myTickets()); }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const show = async (t: Ticket) => {
    setOpen(t);
    try { setMsgs(await thread(t.id)); await load(); } catch (e) { showToast(e instanceof Error ? e.message : 'Could not open it', 'error'); }
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); showToast(ok, 'success'); await load(); if (openId.current) setMsgs(await thread(openId.current)); }
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
