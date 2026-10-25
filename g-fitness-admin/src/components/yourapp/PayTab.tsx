import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Check, CreditCard, ExternalLink, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { showToast } from '../../utils/toast';
import { connectGymPayMongo, disconnectGymPayMongo, gymOnlinePayments, gymPaymentAccount, type GymAccount, type GymOnlinePayment } from '../../lib/api/paymongo';
import { localDateKey, todayKey } from '../../utils/dates';

const peso = (n: string | number) => '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const monthKey = (iso: string) => localDateKey(iso).slice(0, 7);

/**
 * Your app → Payments (0192), in the approved mock-up's layout (2026-10-25):
 * the gym connects its OWN PayMongo account, so members renew and pay for
 * coaching in the app — straight to the gym, recorded the moment it is paid.
 * The key goes to PayMongo and the Vault and is never shown again.
 *
 * The mock-up's "who pays the fee" switch and "fees taken by PayMongo" tile are
 * not drawn: nothing in the system stores either, and a control writing a flag
 * nothing reads is a lie (CLAUDE.md). Turning in-app paying off is disconnecting.
 */
/** The six steps from nothing to members paying in the app, each ticked from the real connection (2026-10-25). */
function Steps({ acc }: { acc: GymAccount | null }) {
  const link = (href: string, text: string) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--a-p300)' }}>{text} <ExternalLink size={11} className="inline" /></a>
  );
  const steps: { title: string; body: ReactNode; done: boolean }[] = [
    { title: 'Make a PayMongo account', done: !!acc,
      body: <>At {link('https://www.paymongo.com', 'paymongo.com')}, with your gym&rsquo;s email. It is free to open; PayMongo takes a fee from each payment.</> },
    { title: 'Activate it with your business details', done: !!acc?.live,
      body: <>PayMongo asks for your business registration (DTI or SEC), a valid ID and the bank account it pays you out to, and reviews them. Until it activates you, only test mode works — that is fine for step 5.</> },
    { title: 'Copy your secret key', done: !!acc,
      body: <>In {link('https://dashboard.paymongo.com/developers', 'dashboard.paymongo.com → Developers → API keys')}. It starts with <b>sk_test_</b> (test) or, once activated, <b>sk_live_</b>. Never share it with anyone else.</> },
    { title: 'Paste it below and press Connect', done: !!acc,
      body: <>Core Fitness checks it with PayMongo and stores it encrypted; it is never shown again, here or anywhere.</> },
    { title: 'Try it in test mode', done: !!acc?.live,
      body: <>With the test key, open the member app, renew a plan and choose Pay in the app. Use one of {link('https://developers.paymongo.com', 'PayMongo’s test cards (in its developer docs)')} — no real money moves — and see it arrive in Payments with a receipt number.</> },
    { title: 'Go live', done: !!acc?.live,
      body: <>When PayMongo activates your account, connect your <b>sk_live_</b> key here instead. Members&rsquo; payments land in your PayMongo balance and PayMongo pays them out to your bank; Core Fitness never holds your money.</> },
  ];
  const next = steps.findIndex((x) => !x.done);
  return (
    <div style={{ marginTop: 14 }} data-paymongo-steps>
      <div className="a-lbl" style={{ marginBottom: 8 }}>How to set it up {acc ? `· ${steps.filter((x) => x.done).length} of 6 done` : ''}</div>
      {steps.map((x, i) => (
        <div key={x.title} className="flex gap-2.5" style={{ padding: '8px 0', borderTop: i ? '1px solid var(--a-border)' : 0, opacity: x.done ? 0.65 : 1 }}>
          <span className="a-ic" style={{ width: 24, height: 24, borderRadius: 99, fontSize: 11, fontWeight: 800,
            background: x.done ? 'var(--a-plight)' : i === next ? 'var(--a-alight)' : undefined, color: x.done ? 'var(--a-p300)' : i === next ? 'var(--a-a300)' : undefined }}>
            {x.done ? <Check size={12} /> : i + 1}
          </span>
          <div className="min-w-0">
            <b style={{ fontSize: 13 }}>{x.title}</b>
            <div className="a-sub" style={{ lineHeight: 1.5, marginTop: 1 }}>{x.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PayTab() {
  const [acc, setAcc] = useState<GymAccount | null | undefined>(undefined);
  const [paid, setPaid] = useState<GymOnlinePayment[]>([]);
  const [secret, setSecret] = useState('');
  const [pub, setPub] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [a, p] = await Promise.all([gymPaymentAccount(), gymOnlinePayments()]);
    setAcc(a); setPaid(p);
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); showToast(ok, 'success'); setSecret(''); setPub(''); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
    finally { setBusy(false); }
  };

  const thisMonth = todayKey().slice(0, 7);
  // gym_online_payments() returns paid rows only (0192).
  const monthPaid = paid.filter((p) => p.paid_at && monthKey(p.paid_at) === thisMonth);
  const monthName = new Date().toLocaleDateString('en-PH', { month: 'long' });

  return (
    <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', flex: 1 }}>
      <div className="a-card a-scroll" data-gym-paymongo>
        {acc === undefined ? <p className="a-sub">Loading…</p> : (
          <>
            <div className="a-ct">
              <h3><CreditCard size={16} />Members pay you in the app</h3>
              {acc ? <span className="a-pill v">{acc.live ? 'connected' : 'connected · test mode'}</span> : <span className="a-pill">not connected</span>}
            </div>
            {acc ? (
              <>
                <div className="a-step"><span><Check size={12} /></span>Your PayMongo account is connected — money goes straight to you.</div>
                <p className="a-sub" style={{ margin: '-4px 0 10px 31px', color: '#fff' }} data-paymongo-connected>
                  PayMongo is connected ({acc.live ? 'live — real money' : 'test mode — no real money'}, key ending {acc.key_last4}).
                  Members can renew and pay for coaching in the app; it lands in your PayMongo account and shows in Payments with a receipt number.
                </p>
                <div className="a-step"><span><Check size={12} /></span>GCash, Maya, cards and online banking — whatever your PayMongo account takes.</div>
                <div className="a-step"><span>3</span>Members see “Pay in the app” on Renew; the desk still takes cash.</div>
                {!acc.live && <div className="a-hint"><CreditCard size={15} /><span>To take real money, verify your business with PayMongo, then connect your sk_live_ key here.</span></div>}
                <div className="a-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
                  <div className="a-card" style={{ padding: 12 }}><div className="a-lbl">Paid in the app · {monthName}</div>
                    <div className="a-num" style={{ fontSize: 22 }}>{peso(monthPaid.reduce((n, p) => n + Number(p.amount), 0))}</div>
                    <div className="a-sub">{monthPaid.length} payment{monthPaid.length === 1 ? '' : 's'}</div></div>
                  <div className="a-card" style={{ padding: 12 }}><div className="a-lbl">Fees</div>
                    <div className="a-num" style={{ fontSize: 22 }}>PayMongo's</div>
                    <div className="a-sub">taken by PayMongo at its own rates</div></div>
                  <div className="a-card" style={{ padding: 12 }}><div className="a-lbl">Paid in the app · so far</div>
                    <div className="a-num" style={{ fontSize: 22 }}>{peso(paid.reduce((n, p) => n + Number(p.amount), 0))}</div>
                    <div className="a-sub">{paid.length} payment{paid.length === 1 ? '' : 's'} · <Link to="/payments" style={{ color: 'var(--a-p300)' }}>on Payments</Link></div></div>
                </div>
                <div className="a-setting" style={{ marginTop: 8 }}>
                  <div className="t"><b>Turn off paying in the app</b><small>disconnects PayMongo — members only see “pay at the desk”</small></div>
                  <button type="button" className="a-btn sm" disabled={busy} onClick={() => void run(() => disconnectGymPayMongo(), 'Disconnected — members pay at the desk again')}>
                    {busy ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
                {!acc.live && <Steps acc={acc} />}
              </>
            ) : (
              <>
                <p className="a-sub" style={{ lineHeight: 1.5 }}>
                  Connect your gym's own PayMongo account and members pay you in the app by GCash, Maya, card or online banking —
                  straight to you; Core Fitness never holds your money. Use the test keys to try it first; your secret key is stored encrypted and never shown again.
                </p>
                <Steps acc={null} />
                <div className="a-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                  <div className="a-fld"><label htmlFor="pm-secret">Secret key</label>
                    <input id="pm-secret" className="a-in" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)}
                      placeholder="sk_test_… or sk_live_…" aria-label="PayMongo secret key" /></div>
                  <div className="a-fld"><label htmlFor="pm-public">Public key <span style={{ fontWeight: 500 }}>· optional</span></label>
                    <input id="pm-public" className="a-in" autoComplete="off" value={pub} onChange={(e) => setPub(e.target.value)} placeholder="pk_…" aria-label="PayMongo public key" /></div>
                </div>
                <button type="button" className="a-btn amber" style={{ alignSelf: 'flex-start', marginTop: 12 }} disabled={busy || !/^sk_(test|live)_/.test(secret.trim())}
                  onClick={() => void run(() => connectGymPayMongo(secret.trim(), pub.trim()), 'Connected — members can pay in the app')}>
                  {busy ? 'Checking with PayMongo…' : 'Connect PayMongo'}
                </button>
              </>
            )}
            {paid.length > 0 && (
              <>
                <div className="a-ct" style={{ marginTop: 16 }}><h3>Paid in the app</h3></div>
                {paid.slice(0, 15).map((p) => (
                  <div key={p.id} className="a-row">
                    <div className="t"><b>{p.member_name}</b><small>{p.description} · {p.method ?? ''}{p.paid_at ? ` · ${when(p.paid_at)}` : ''}</small></div>
                    <b>{peso(p.amount)}</b>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <div className="a-stage">
        <div className="cap"><Smartphone size={13} />Live preview · Renew</div>
        <div className="a-phone"><div className="scr">
          <b style={{ fontSize: 15 }}>Renew your plan</b><div className="a-sub">a member renewing</div>
          {acc ? <div className="a-phcard" style={{ borderColor: '#f59e0b' }}><b>Pay in the app</b><div className="a-sub">GCash · Maya · card</div></div> : null}
          <div className="a-phcard" style={acc ? undefined : { borderColor: '#f59e0b' }}><b>Pay at the desk</b><div className="a-sub">cash, next time you come in</div></div>
          {!acc && <div className="a-sub">Paying in the app appears here once PayMongo is connected.</div>}
          <div className="a-phbtn" style={{ background: '#f59e0b', color: '#1f1a0a', marginTop: 'auto' }}>{acc ? 'Pay now' : 'I’ll pay at the desk'}</div>
        </div></div>
      </div>
    </div>
  );
}
