import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Send, Wallet, X } from 'lucide-react';
import {
  applicationThread, CHANGED, emailApplicant, explain, paymentMethods, replyApplication, sendApplicationPayment, statusLink,
  type Application, type ApplicationMessage, type PaymentMethod,
} from '../lib/platform';

const stamp = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Talking to a gym that has applied (0148). They have no account yet: they
 * read and answer on the status link the website gave them, and this screen
 * hands that link over so it can be sent by SMS, Viber or email as well.
 *
 * "Send how to pay" (0158) puts one of the saved methods into the conversation
 * as a card — before they are let in, so a gym can pay first. The card is drawn
 * from Settings each time, so a corrected number corrects every conversation.
 */
export default function ApplicationThread({ app }: { app: Application }) {
  const [msgs, setMsgs] = useState<ApplicationMessage[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mailNote, setMailNote] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try { setMethods((await paymentMethods()).filter((m) => m.active)); } catch { setMethods([]); }
    })();
  }, []);

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
    try {
      const text = body.trim();
      await replyApplication(app.id, text); setBody(''); await load();
      // Every answer reaches their inbox too (0187), when mail is set up.
      setMailNote(await emailApplicant(app, 'application_message', 'Core Fitness answered your application', text));
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send'); }
    finally { setBusy(false); }
  };
  const sendPay = async () => {
    if (!method) return;
    setBusy(true);
    try {
      await sendApplicationPayment(app.id, method, body.trim() || null);
      setBody(''); setPaying(false); setMethod(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send'); }
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
            {m.method_label && (
              <span className="bubble-pay"><Wallet size={13} /> Sent: {m.method_label}</span>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      {mailNote && <p className="meta" data-mail-note>{mailNote}</p>}
      {error && <p className="err">{error}</p>}
      {paying && (
        <div className="pay-pick">
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <strong className="grow" style={{ fontSize: 13 }}>Send a way to pay</strong>
            <button type="button" className="btn ghost" style={{ padding: "4px 8px" }} aria-label="Close" onClick={() => { setPaying(false); setMethod(null); }}><X size={14} /></button>
          </div>
          {methods === null ? <p className="meta">Loading…</p> : methods.length === 0 ? (
            <p className="meta">No ways to pay are switched on. Add GCash, Maya or a bank in Settings → How gyms pay you.</p>
          ) : (
            <div className="pay-opts" role="radiogroup" aria-label="Payment method">
              {methods.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={method === m.id}
                  className={`pay-opt${method === m.id ? ' on' : ''}`} onClick={() => setMethod(m.id)}>
                  {m.qr_image ? <img src={m.qr_image} alt="" /> : <Wallet size={18} />}
                  <span><b>{m.label}</b>{m.account_number && <small>{m.account_number}</small>}</span>
                </button>
              ))}
            </div>
          )}
          <p className="meta" style={{ margin: 0 }}>
            They see it as a card with the number and QR code, even before you let them in. Anything you type below goes with it as the note.
          </p>
        </div>
      )}
      <form onSubmit={send} className="row" style={{ gap: 8, marginTop: 10 }}>
        <textarea className="grow" rows={2} value={body} maxLength={2000} placeholder={`Write to ${app.owner_name}…`}
          onChange={(e) => setBody(e.target.value)} style={{ resize: 'vertical' }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {paying
            ? <button className="btn" type="button" disabled={busy || !method} onClick={() => void sendPay()}><Wallet size={14} /> {busy ? 'Sending…' : 'Send it'}</button>
            : <button className="btn" type="submit" disabled={busy || !body.trim()}><Send size={14} /> {busy ? 'Sending…' : 'Send'}</button>}
          {!paying && <button className="btn ghost" type="button" onClick={() => setPaying(true)}><Wallet size={14} /> How to pay</button>}
        </div>
      </form>
    </div>
  );
}
