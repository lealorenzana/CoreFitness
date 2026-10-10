import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import Documents, { type AppDocument } from './Documents';

const ADMIN_APP = 'https://corefitness-admin.vercel.app';
const peso = (n: number) => '₱' + n.toLocaleString('en-PH');
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

interface Pay { kind: string; label: string; account_name: string | null; account_number: string | null; qr_image: string | null; instructions: string | null }
interface Status {
  gym_name: string; owner_name: string; email: string; status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  reason: string | null; created_at: string; decided_at: string | null;
  plan: { key: string; name: string; price_monthly: string | null; price_yearly: string | null; trial_days: number | null } | null;
  billing: 'monthly' | 'yearly' | null; gym_slug: string | null; paid_until: string | null;
  /** `pay` on a message (0158): a way to pay Core Fitness sent in the conversation, drawn as it is now;
   *  null with `sent_method` when that method has since been switched off. */
  messages: { from_platform: boolean; body: string; created_at: string; sent_method?: boolean; pay?: Pay | null }[];
  pay: Pay[] | null;
  contact: { name: string; email: string | null; phone: string | null } | null;
  /** Signed in (0187): my_applications() adds these. */
  id?: string;
  documents?: AppDocument[];
  missing?: string[];
}

const KIND: Record<string, string> = { gcash: 'GCash', maya: 'Maya', bank: 'Bank transfer', other: 'Payment' };

/** One way to pay: the number with a copy button, and the QR code, which opens large for scanning off a screen. */
function PayCard({ m }: { m: Pay }) {
  const [copied, setCopied] = useState(false);
  const [big, setBig] = useState(false);
  return (
    <div className={`pay-card kind-${m.kind}`}>
      <div className="pay-head">
        <span className="pay-kind">{KIND[m.kind] ?? 'Payment'}</span>
        <strong>{m.label}</strong>
      </div>
      {m.qr_image && (
        <button type="button" className="pay-qr" onClick={() => setBig(true)} aria-label={`Show the ${m.label} QR code larger`}>
          <img src={m.qr_image} alt={`${m.label} QR code`} />
          <span>Tap to enlarge</span>
        </button>
      )}
      {m.account_name && <p className="pay-name">{m.account_name}</p>}
      {m.account_number && (
        <div className="pay-number">
          <code>{m.account_number}</code>
          <button type="button" onClick={() => void navigator.clipboard.writeText(m.account_number ?? '').then(() => setCopied(true))}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {m.instructions && <p className="pay-note">{m.instructions}</p>}
      {big && m.qr_image && (
        <div className="qr-big" role="dialog" aria-modal="true" aria-label={`${m.label} QR code`} onClick={() => setBig(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <img src={m.qr_image} alt={`${m.label} QR code`} />
            <p>{m.label}{m.account_name ? ` · ${m.account_name}` : ''}</p>
            <div className="cta-row" style={{ marginTop: 12, justifyContent: 'center' }}>
              <a className="cta ghost" href={m.qr_image} download={`${m.label.replace(/[^a-z0-9]+/gi, '-')}-qr.png`}>Save image</a>
              <button type="button" className="cta" onClick={() => setBig(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * An applicant's own page (0148), opened from the private link the form gave
 * them — a page of its own, not a panel on top of the marketing site: where the
 * application stands, a conversation with Core Fitness, and how to pay. Ways to
 * pay arrive in the conversation whenever Core Fitness sends one (0158), so a
 * gym can pay before it is let in; once it is, every way is listed.
 *
 * The link is the only key, like a gym's invitation: nothing here is readable
 * without it, and it shows nothing about anybody else.
 */
export default function StatusPage({ token, accountId, onSignOut }: {
  /** The private link (0148) — or, signed in (0187), the application's id. */
  token?: string; accountId?: string; onSignOut?: () => void;
}) {
  const [s, setS] = useState<Status | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState<{ method: string; amount: string; reference: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!supabase) { setS(null); return; }
    if (accountId) {
      const { data, error: e } = await supabase.rpc('my_applications');
      if (e) { setError(e.message); setS(null); return; }
      setS(((data ?? []) as Status[]).find((a) => a.id === accountId) ?? null);
      return;
    }
    const { data, error: e } = await supabase.rpc('application_status', { p_token: token });
    if (e) { setError(e.message); setS(null); return; }
    setS((data as Status | null) ?? null);
  }, [token, accountId]);
  const [calling, setCalling] = useState(false);
  const callOff = async () => {
    if (!supabase || !accountId) return;
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc('withdraw_my_application', { p_application: accountId });
    setBusy(false); setCalling(false);
    if (e) { setError(e.message); return; }
    await load();
  };
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const post = async (text: string) => {
    if (!supabase || !text.trim()) return false;
    setBusy(true); setError(null);
    const { error: e2 } = accountId
      ? await supabase.rpc('my_application_reply', { p_application: accountId, p_body: text.trim() })
      : await supabase.rpc('application_reply', { p_token: token, p_body: text.trim() });
    setBusy(false);
    if (e2) { setError(e2.message); return false; }
    await load();
    window.setTimeout(() => end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    return true;
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await post(body)) setBody('');
  };
  const sendPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paid) return;
    const amount = paid.amount.trim() ? ` ${paid.amount.trim().startsWith('₱') ? '' : '₱'}${paid.amount.trim()}` : '';
    const text = `I paid${amount} by ${paid.method}. Reference number: ${paid.reference.trim()}.`;
    if (await post(text)) setPaid(null);
  };

  if (s === undefined) {
    return <div className="status-page"><p className="status-loading">Opening your application…</p></div>;
  }
  if (s === null) {
    return (
      <div className="status-page">
        <a className="status-back" href="#top">← Core Fitness</a>
        <span className="eyebrow">Your application</span>
        <h1 className="status-title">This link does not open an application</h1>
        <p className="status-lede">Check that the whole link was copied — it is long. If it still does not open, apply again or write to us.</p>
        {error && <p className="note bad">{error}</p>}
        <a className="cta" href="#apply">Register your gym</a>
      </div>
    );
  }

  const price = s.plan?.price_monthly != null ? Number(s.plan.price_monthly) : null;
  const yearly = s.plan?.price_yearly != null ? Number(s.plan.price_yearly) : null;
  const sentMethods = s.messages.flatMap((m) => (m.pay ? [m.pay] : []));
  const methodsToName = s.pay?.length ? s.pay : sentMethods;
  const step = s.status === 'approved' ? 3 : 2;
  const pill = s.status === 'approved' ? 'Let in' : s.status === 'rejected' ? 'Not this time' : s.status === 'withdrawn' ? 'Called off' : 'Being read';

  return (
    <div className="status-page">
      <div className="status-back-row">
        <a className="status-back" href="#top">← Core Fitness</a>
        {onSignOut && <button type="button" className="link-btn" onClick={onSignOut}>Sign out</button>}
      </div>
      <div className="status-hero">
        <span className="eyebrow">{accountId ? `Your application · signed in as ${s.email}` : 'Your application · keep this link'}</span>
        <h1 className="status-title">{s.gym_name}</h1>
        <p className="status-lede">
          <span className={`status-pill is-${s.status}`}>{pill}</span>
          Applied {day(s.created_at)} by {s.owner_name}
        </p>
        <ol className="status-track" aria-label="Where your application is">
          <li className="done"><b>Applied</b><span>{day(s.created_at)}</span></li>
          <li className={s.status === 'pending' ? 'now' : 'done'}>
            <b>{s.status === 'rejected' ? 'Not this time' : 'We read it'}</b>
            <span>{s.decided_at ? day(s.decided_at) : 'usually a day or two'}</span>
          </li>
          <li className={step === 3 ? 'now' : ''}><b>Set up and pay</b><span>{s.status === 'approved' ? 'your turn' : 'after we let you in'}</span></li>
        </ol>
      </div>

      <div className="status-grid">
        <div className="status-main">
          {s.status === 'pending' && (
            <div className="status-callout">
              <p>We read every application ourselves and usually answer within a day or two. Ask anything below — pricing, setup,
                moving your members over. We answer here{s.email ? `, and by ${s.email}` : ''} or your phone if you asked us to.</p>
              <p className="note">Want to start straight away? Ask us how to pay — we can send our GCash, Maya or bank details here and let you in once it arrives.</p>
            </div>
          )}
          {s.status === 'withdrawn' && (
            <div className="status-callout">
              <p>You called this application off. You can still write to us below, or apply again whenever you like.</p>
            </div>
          )}
          {s.status === 'rejected' && (
            <div className="status-callout">
              <p>We cannot take {s.gym_name} on right now{s.reason ? `: ${s.reason}` : '.'} You can still write to us below.</p>
            </div>
          )}
          {s.status === 'approved' && (
            <div className="status-callout is-good">
              <p><strong>{s.gym_name} is in.</strong> Sign in at <a href={ADMIN_APP}>the gym app</a> with {accountId
                ? 'this same email and password'
                : 'the account you made when you applied (or, if you applied before accounts, the temporary password Core Fitness gives you)'},
                then set your gym up.
                {s.plan?.trial_days ? ` Your ${s.plan.trial_days}-day free trial has started.` : ''}</p>
              <a className="cta" href={ADMIN_APP}>Open the gym app</a>
            </div>
          )}

          {s.status === 'approved' && s.pay && s.pay.length > 0 && (
            <>
              <h2 className="status-h">How to pay — from anywhere</h2>
              <p className="status-sub">Send the amount to one of these, then sign in and open <strong>Your plan → Pay Core Fitness</strong> to send the
                reference number and a screenshot. We check it and confirm.</p>
              <div className="pay-grid">{s.pay.map((m) => <PayCard key={m.label + (m.account_number ?? '')} m={m} />)}</div>
            </>
          )}

          {s.id && s.documents && (s.status === 'pending' || s.status === 'approved') && (
            <Documents applicationId={s.id} documents={s.documents} onChanged={load} locked={s.status !== 'pending'} />
          )}
          {!accountId && s.status === 'pending' && (
            <div className="status-callout">
              <p>Before we can let {s.gym_name} in, we check six business documents — your permit, DTI or SEC registration, BIR 2303,
                barangay clearance, your ID and a photo of the gym's front. <a href="#account">Sign in</a> with the account you made when
                you applied to send them.</p>
            </div>
          )}

          <h2 className="status-h">Messages with Core Fitness</h2>
          <div className="thread">
            {s.messages.length === 0 && <p className="status-sub">No messages yet. Ask us anything — pricing, setup, moving your members over.</p>}
            {s.messages.map((m, i) => (
              <div key={i} className={`bubble${m.from_platform ? '' : ' mine'}${m.sent_method ? ' has-pay' : ''}`}>
                <span className="who">{m.from_platform ? 'Core Fitness' : 'You'} · {when(m.created_at)}</span>
                {m.body}
                {m.pay && <PayCard m={m.pay} />}
                {m.sent_method && !m.pay && <span className="pay-gone">This way to pay is no longer offered — ask us for the current one.</span>}
              </div>
            ))}
            <div ref={end} />
          </div>

          {paid ? (
            <form className="paid-form" onSubmit={sendPaid}>
              <strong>Tell us you paid</strong>
              <div className="paid-fields">
                <div className="field">
                  <label htmlFor="paid-method">Paid by</label>
                  <select id="paid-method" value={paid.method} onChange={(e) => setPaid({ ...paid, method: e.target.value })}>
                    {methodsToName.map((m) => <option key={m.label}>{m.label}</option>)}
                    <option>Other</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="paid-amount">Amount <span className="opt">(optional)</span></label>
                  <input id="paid-amount" inputMode="decimal" placeholder={price ? String(price) : '999'} value={paid.amount}
                    onChange={(e) => setPaid({ ...paid, amount: e.target.value })} />
                </div>
                <div className="field full">
                  <label htmlFor="paid-ref">Reference number</label>
                  <input id="paid-ref" required minLength={4} maxLength={60} placeholder="From your GCash / bank receipt" value={paid.reference}
                    onChange={(e) => setPaid({ ...paid, reference: e.target.value })} />
                </div>
              </div>
              <p className="note">It goes to us as a message. We match it to the transfer and let you in — keep your receipt screenshot in case we ask.</p>
              <div className="cta-row" style={{ marginTop: 6 }}>
                <button className="cta" type="submit" disabled={busy || paid.reference.trim().length < 4}>{busy ? 'Sending…' : 'Send'}</button>
                <button className="cta ghost" type="button" onClick={() => setPaid(null)}>Cancel</button>
              </div>
            </form>
          ) : (
            <form className="compose" onSubmit={send}>
              <textarea value={body} maxLength={2000} rows={3} placeholder="Write to Core Fitness…" onChange={(e) => setBody(e.target.value)} />
              <div className="cta-row" style={{ marginTop: 10 }}>
                <button className="cta" type="submit" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button>
                {s.status !== 'approved' && methodsToName.length > 0 && (
                  <button className="cta ghost" type="button"
                    onClick={() => setPaid({ method: methodsToName[methodsToName.length - 1].label, amount: '', reference: '' })}>I've paid</button>
                )}
              </div>
            </form>
          )}
          {error && <p className="note bad" style={{ marginTop: 10 }}>{error}</p>}
          {accountId && s.status === 'pending' && (
            calling ? (
              <div className="status-callout" style={{ marginTop: 18 }}>
                <p>Call off {s.gym_name}'s application? We stop reviewing it. You can apply again later.</p>
                <div className="cta-row">
                  <button className="cta" type="button" disabled={busy} onClick={() => void callOff()}>Call it off</button>
                  <button className="cta ghost" type="button" onClick={() => setCalling(false)}>Keep it</button>
                </div>
              </div>
            ) : <button type="button" className="link-btn" style={{ marginTop: 18 }} onClick={() => setCalling(true)}>Call off this application</button>
          )}
        </div>

        <aside className="status-side">
          <div className="card">
            <span className="side-label">Plan</span>
            {s.plan ? (
              <>
                <strong className="side-big">{s.plan.name}</strong>
                <p>{price ? `${peso(price)} a month` : price === 0 ? 'Free' : 'We will tell you the price'}
                  {s.billing === 'yearly' && yearly ? `, or ${peso(yearly)} a year` : ''}
                  {s.plan.trial_days ? ` · ${s.plan.trial_days}-day free trial` : ''}</p>
              </>
            ) : <p>Not chosen yet — ask us which fits.</p>}
            {s.paid_until && <p className="note">Paid until {day(s.paid_until)}</p>}
          </div>
          {!accountId && <div className="card">
            <span className="side-label">This page</span>
            <p>Only someone with this link can open it. Bookmark it or keep it somewhere safe.</p>
            <button className="cta ghost" type="button" style={{ width: '100%' }}
              onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true))}>
              {copied ? 'Link copied' : 'Copy this page’s link'}
            </button>
          </div>}
          {s.contact && (s.contact.phone || s.contact.email) && (
            <div className="card">
              <span className="side-label">Reach us directly</span>
              {s.contact.phone && <p><a href={`tel:${s.contact.phone.replace(/\s+/g, '')}`}>{s.contact.phone}</a></p>}
              {s.contact.email && <p><a href={`mailto:${s.contact.email}`}>{s.contact.email}</a></p>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
