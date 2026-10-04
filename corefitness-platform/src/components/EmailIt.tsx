import { useState } from 'react';
import { sendEmail } from '../lib/platform';

interface Props {
  to: string | null;
  toName?: string | null;
  subject: string;
  body: string;
  kind: 'owner_credentials' | 'password_reset';
  gymId: string;
}

/**
 * "Email it to them" under a handover box (2026-10-04).
 *
 * `send-email` (0113) records the message first and always, then tries the
 * provider. This button says exactly what happened — sent, not set up, or
 * failed with the provider's reason — and the copy box above it stays, so a
 * handover never depends on mail working.
 */
export default function EmailIt({ to, toName, subject, body, kind, gymId }: Props) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'off' | 'failed'>('idle');
  const [why, setWhy] = useState<string | null>(null);

  if (!to) return <p className="meta">No email address on file — pass it on yourself.</p>;

  const send = async () => {
    setState('busy');
    setWhy(null);
    try {
      const r = await sendEmail({ to, toName, subject, body, kind, gymId });
      if (r.status === 'sent') setState('sent');
      else if (r.status === 'not_configured') setState('off');
      else { setState('failed'); setWhy(r.error ?? null); }
    } catch (e) {
      setState('failed');
      setWhy(e instanceof Error ? e.message : null);
    }
  };

  return (
    <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button className="btn ghost" type="button" disabled={state === 'busy' || state === 'sent'} onClick={() => void send()}>
        {state === 'busy' ? 'Sending…' : state === 'sent' ? `Emailed to ${to}` : `Email it to ${to}`}
      </button>
      {state === 'off' && (
        <span className="meta">Email is not set up yet (Supabase secrets BREVO_API_KEY and MAIL_FROM), so nothing was sent. Pass it on yourself.</span>
      )}
      {state === 'failed' && (
        <span className="err">It did not go through{why ? `: ${why.slice(0, 200)}` : ''}. Pass it on yourself.</span>
      )}
    </div>
  );
}
