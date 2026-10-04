import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { billingFor, priceLine } from './pricing';

const ADMIN_APP = 'https://corefitness-admin.vercel.app';
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

interface Status {
  gym_name: string; owner_name: string; email: string; status: 'pending' | 'approved' | 'rejected';
  reason: string | null; created_at: string; decided_at: string | null;
  plan: { key: string; name: string; price_monthly: string | null; price_yearly: string | null; trial_days: number | null } | null;
  billing: 'monthly' | 'yearly' | null; gym_slug: string | null; paid_until: string | null;
  messages: { from_platform: boolean; body: string; created_at: string }[];
  pay: { kind: string; label: string; account_name: string | null; account_number: string | null; qr_image: string | null; instructions: string | null }[] | null;
  contact: { name: string; email: string | null; phone: string | null } | null;
}

/**
 * An applicant's own page (0148), opened from the private link the form gave
 * them: where the application stands, a conversation with Core Fitness, and —
 * once the gym is let in — how to pay from wherever they are.
 *
 * The link is the only key, like a gym's invitation: nothing here is readable
 * without it, and it shows nothing about anybody else.
 */
export default function StatusPage({ token }: { token: string }) {
  const [s, setS] = useState<Status | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) { setS(null); return; }
    const { data, error: e } = await supabase.rpc('application_status', { p_token: token });
    if (e) { setError(e.message); setS(null); return; }
    setS((data as Status | null) ?? null);
  }, [token]);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !body.trim()) return;
    setBusy(true); setError(null);
    const { error: e2 } = await supabase.rpc('application_reply', { p_token: token, p_body: body.trim() });
    setBusy(false);
    if (e2) { setError(e2.message); return; }
    setBody('');
    await load();
  };

  if (s === undefined) return <section><p>Opening your application…</p></section>;
  if (s === null) {
    return (
      <section>
        <span className="eyebrow">Your application</span>
        <h2>This link does not open an application</h2>
        <p>Check that the whole link was copied. If it still does not work, apply again below or write to us.</p>
        <a className="cta" href="#apply">Register your gym</a>
      </section>
    );
  }

  // The price of the billing they chose — a yearly applicant is told the yearly amount.
  const tier = s.plan ? {
    monthly: s.plan.price_monthly != null ? Number(s.plan.price_monthly) : null,
    yearly: s.plan.price_yearly != null ? Number(s.plan.price_yearly) : null,
    trialDays: s.plan.trial_days,
  } : null;
  const billing = tier ? billingFor(tier, s.billing ?? 'monthly') : 'monthly';
  const price = tier ? priceLine(tier, billing) : null;

  return (
    <section>
      <span className="eyebrow">Your application · keep this link</span>
      <h2>{s.gym_name}</h2>
      <div className="status-steps">
        <span className="on">Applied {new Date(s.created_at).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}</span>
        <span className={s.status !== 'pending' ? 'on' : ''}>{s.status === 'rejected' ? 'Not this time' : s.status === 'approved' ? 'Let in' : 'Being read'}</span>
        <span className={s.status === 'approved' ? 'on' : ''}>Set up and pay</span>
      </div>

      {s.status === 'pending' && (
        <p>We read every application ourselves and usually answer within a day or two. Questions? Write below — we answer here, and by
          {' '}{s.email} or your phone if you asked us to.</p>
      )}
      {s.status === 'rejected' && <p>We cannot take {s.gym_name} on right now{s.reason ? `: ${s.reason}` : '.'} You can still write to us below.</p>}
      {s.status === 'approved' && (
        <div className="sent">
          <p style={{ marginTop: 0 }}><strong style={{ color: 'var(--text)' }}>{s.gym_name} is in.</strong> Sign in at{' '}
            <a href={ADMIN_APP} style={{ color: 'var(--violet-text)' }}>the gym app</a> with your email and the temporary password Core Fitness gives you (by message here, text or a call),
            then set your gym up. {s.plan?.trial_days ? `Your ${s.plan.trial_days}-day free trial has started.` : ''}</p>
        </div>
      )}

      {s.plan && (
        <p>Plan: <strong style={{ color: 'var(--text)' }}>{s.plan.name}</strong>
          {price === 'Talk to us' ? ' — we will tell you the price' : ` — ${price}`}
          {billing === 'yearly' ? ', billed yearly' : ''}</p>
      )}

      {s.status === 'approved' && s.pay && s.pay.length > 0 && (
        <>
          <h3 style={{ marginTop: 28 }}>How to pay — from anywhere</h3>
          <p>Send the amount to one of these, then sign in to the gym app and open <strong>Your plan → Pay Core Fitness</strong> to
            send us the reference number and a screenshot. We check it and confirm.</p>
          <div className="grid">
            {s.pay.map((m) => (
              <div className="card" key={m.label + (m.account_number ?? '')}>
                <h3>{m.label}</h3>
                {m.qr_image && <img src={m.qr_image} alt={`${m.label} QR code`} className="qr" />}
                {m.account_name && <p>{m.account_name}</p>}
                {m.account_number && <p style={{ color: 'var(--text)', fontWeight: 600 }}>{m.account_number}</p>}
                {m.instructions && <p>{m.instructions}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <h3 style={{ marginTop: 28 }}>Messages with Core Fitness</h3>
      <div className="thread">
        {s.messages.length === 0 && <p>No messages yet. Ask us anything — pricing, setup, moving your members over.</p>}
        {s.messages.map((m, i) => (
          <div key={i} className={`bubble${m.from_platform ? '' : ' mine'}`}>
            <span className="who">{m.from_platform ? 'Core Fitness' : 'You'} · {when(m.created_at)}</span>
            {m.body}
          </div>
        ))}
      </div>
      <form onSubmit={send} style={{ marginTop: 12 }}>
        <textarea value={body} maxLength={2000} placeholder="Write to Core Fitness…" onChange={(e) => setBody(e.target.value)} />
        {error && <p className="note bad">{error}</p>}
        <button className="cta" type="submit" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        <button className="cta ghost" type="button" onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true))}>
          {copied ? 'Link copied' : 'Copy this page’s link'}
        </button>
      </form>
      {s.contact && (s.contact.phone || s.contact.email) && (
        <p className="note">Or reach us directly: {[s.contact.phone, s.contact.email].filter(Boolean).join(' · ')}</p>
      )}
    </section>
  );
}
