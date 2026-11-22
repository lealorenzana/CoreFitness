import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Mail, Send } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { listEmails, sendEmail, type SentEmail } from '../lib/platform';
import './gymdocs.css';

/**
 * Whether mail goes out (2026-11-22). The verdict is read from what actually happened to the platform's mail in the
 * last 30 days (email_outbox, 0113), never assumed; "Send me a test" goes through the same send-email function as
 * every real message and says exactly what came back. The provider's key is a Supabase secret: this page names the
 * secrets, it never shows or takes one.
 */
type Verdict = 'works' | 'none' | 'failing' | 'unknown';

export default function MailStatus() {
  const [rows, setRows] = useState<SentEmail[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; good: boolean } | null>(null);

  const load = useCallback(async () => {
    try { setRows(await listEmails(30)); } catch { setRows([]); }
  }, []);
  useEffect(() => {
    void (async () => {
      await load();
      const { data } = await supabase.auth.getUser();
      setMe(data.user?.email ?? null);
    })();
  }, [load]);

  const count = (s: SentEmail['status']) => (rows ?? []).filter((r) => r.status === s).length;
  const last = rows?.[0] ?? null;
  const verdict: Verdict = !rows || rows.length === 0 ? 'unknown'
    : last?.status === 'not_configured' ? 'none'
    : last?.status === 'failed' ? 'failing' : 'works';

  const test = async () => {
    if (!me) return;
    setBusy(true); setResult(null);
    try {
      const r = await sendEmail({ to: me, subject: 'Core Fitness test email', kind: 'test',
        body: 'This is a test from the platform app\'s Settings → Email. If you are reading it, mail from Core Fitness reaches people.' });
      setResult(r.status === 'sent' ? { good: true, text: `Sent to ${me}. Check that inbox (and its spam folder).` }
        : r.status === 'not_configured' ? { good: false, text: 'Nothing was sent: no mail provider is set up. Add the secrets below, then test again.' }
        : { good: false, text: `The provider refused it: ${r.error ?? r.status}.` });
    } catch (e) {
      setResult({ good: false, text: e instanceof Error ? e.message : 'The test could not be sent.' });
    }
    setBusy(false);
    await load();
  };

  return (
    <section className="card mail" data-mail-status>
      <h2 className="section-title"><Mail size={14} /> Email</h2>
      <div className={`mail-verdict ${verdict}`}>
        {verdict === 'works' ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}
        <span>
          <b>{verdict === 'works' ? 'Mail goes out' : verdict === 'none' ? 'No mail provider is set up'
            : verdict === 'failing' ? 'The last message failed' : 'Nothing sent in 30 days to judge by'}</b>
          <em>{rows === null ? 'Reading…' : `Last 30 days: ${count('sent')} sent, ${count('failed')} failed, ${count('not_configured')} not sent for want of a provider.`}</em>
        </span>
      </div>

      <div className="mail-test">
        <span>Send a test to <b>{me ?? 'your address'}</b>, through the same path as every real message.</span>
        <button type="button" className="btn sm" disabled={busy || !me} onClick={() => void test()}><Send size={13} /> {busy ? 'Sending…' : 'Send me a test'}</button>
      </div>
      {result && <p className={`mail-result${result.good ? '' : ' bad'}`} role="status">{result.text}</p>}

      {verdict !== 'works' && (
        <div className="mail-how">
          <b>Setting up a provider</b>
          <ol>
            <li>Make a free account with Brevo (or Resend) and verify the address mail comes from.</li>
            <li>In Supabase, Edge Functions → Secrets, add <code>BREVO_API_KEY</code> (or <code>RESEND_API_KEY</code>) and <code>MAIL_FROM</code>, the verified address.</li>
            <li>Come back and send a test. Keys are never typed here or shown anywhere in the apps.</li>
          </ol>
        </div>
      )}

      {last && (
        <p className="mail-last">Last message: {last.subject}, to {last.to_email}, {last.status === 'sent' ? 'sent' : last.status.replace('_', ' ')}
          {' '}on {new Date(last.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Every message is listed on Platform → Activity &amp; access.</p>
      )}
    </section>
  );
}
