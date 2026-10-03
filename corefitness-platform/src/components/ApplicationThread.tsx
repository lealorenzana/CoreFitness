import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Send } from 'lucide-react';
import { applicationThread, CHANGED, explain, replyApplication, statusLink, type Application, type ApplicationMessage } from '../lib/platform';

const stamp = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Talking to a gym that has applied (0148). They have no account yet: they
 * read and answer on the status link the website gave them, and this screen
 * hands that link over so it can be sent by SMS, Viber or email as well.
 */
export default function ApplicationThread({ app }: { app: Application }) {
  const [msgs, setMsgs] = useState<ApplicationMessage[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { setMsgs(await applicationThread(app.id)); setError(null); window.dispatchEvent(new Event(CHANGED)); }
    catch (e) { setMsgs([]); setError(explain(e, '0148')); }
  }, [app.id]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try { await replyApplication(app.id, body.trim()); setBody(''); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send'); }
    finally { setBusy(false); }
  };
  const link = app.status_token ? statusLink(app.status_token) : null;

  return (
    <div>
      {link && (
        <div className="row" style={{ gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <span className="meta grow" style={{ margin: 0, wordBreak: 'break-all' }}>
            They read your answers at their status link. Send it to them if they lost it:
          </span>
          <button className="btn ghost" type="button" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}>
            <Copy size={14} /> {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
      <div className="thread">
        {msgs === null ? <p className="empty">Loading…</p> : msgs.length === 0 ? (
          <p className="empty">No messages yet. Write first — they see it on their status link.</p>
        ) : msgs.map((m) => (
          <div key={m.id} className={`bubble${m.from_platform ? ' mine' : ''}`}>
            <span className="bubble-who">{m.from_platform ? (m.author_name ?? 'Core Fitness') : app.owner_name} · {stamp(m.created_at)}</span>
            <span className="bubble-body">{m.body}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
      {error && <p className="err">{error}</p>}
      <form onSubmit={send} className="row" style={{ gap: 8, marginTop: 10 }}>
        <textarea className="grow" rows={2} value={body} maxLength={2000} placeholder={`Write to ${app.owner_name}…`}
          onChange={(e) => setBody(e.target.value)} style={{ resize: 'vertical' }} />
        <button className="btn" type="submit" disabled={busy || !body.trim()}><Send size={14} /> {busy ? 'Sending…' : 'Send'}</button>
      </form>
    </div>
  );
}
