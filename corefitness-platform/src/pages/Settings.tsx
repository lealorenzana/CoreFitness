import { useCallback, useEffect, useState } from 'react';
import { BellRing, Building, ChevronRight, FileText, KeyRound, Keyboard, Mail, Monitor, Receipt, ShieldCheck, Timer, UserMinus, UserPlus, Wallet } from 'lucide-react';
import {
  billingSettings, explain, listAdmins, platformOwner, removeAdmin, saveBillingSettings, sendEmail,
  type BillingSettings, type PlatformAdmin,
} from '../lib/platform';
import InfoDot from '../components/InfoDot';
import PaymentMethods from '../components/PaymentMethods';
import GymDocuments from '../components/GymDocuments';
import GymDocsEditor from '../components/GymDocsEditor';
import MailStatus from '../components/MailStatus';
import SkelRows from '../components/ui/SkelRows';

const long = (d: Date) => d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The platform's own settings, in one place (2026-09-28): the business printed
 * on every receipt, the billing rules every gym's lock and reminders follow
 * (0138), and who can run the platform (0109). Money and Platform point here
 * rather than each carrying a second copy of a form.
 *
 * Since 2026-11-02 one section at a time: the list on the left, the chosen one
 * in full on the right — six cramped boxes with their own scrollbars read badly.
 */
type Part = 'business' | 'billing' | 'pay' | 'admins' | 'docs' | 'mail' | 'install';
const PARTS: [Part, string, string, typeof Building][] = [
  ['business', 'Business and receipts', 'What every receipt says', Building],
  ['billing', 'Billing rules', 'Read-only and reminders', Timer],
  ['pay', 'How gyms pay you', 'GCash, Maya, bank, online', Wallet],
  ['admins', 'Who can run the platform', 'Platform owners', ShieldCheck],
  ['docs', 'Gym documents', 'Terms, DPA and privacy', FileText],
  ['mail', 'Email', 'Whether mail goes out, a test', Mail],
  ['install', 'This installation', 'Where it runs, shortcuts', Monitor],
];
export default function Settings() {
  const [b, setB] = useState<(BillingSettings & { reminders: string }) | null | undefined>(undefined);
  const [admins, setAdmins] = useState<PlatformAdmin[] | null>(null);
  const [email, setEmail] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  /** A one-time password just made: shown once, here, and emailed. */
  const [slip, setSlip] = useState<{ email: string; password: string; mailed: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ part: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // `?part=billing` opens a section directly (Money's "Change in Settings" does).
  const [part, setPart] = useState<Part>(() => {
    const q = new URLSearchParams(window.location.search).get('part');
    return PARTS.some(([k]) => k === q) ? (q as Part) : 'business';
  });

  const load = useCallback(async () => {
    try { const s = await billingSettings(); setB(s ? { ...s, reminders: s.reminder_days.join(', ') } : null); }
    catch (e) { setB(null); setMsg({ part: 'billing', text: explain(e, '0138') }); }
    try { setAdmins(await listAdmins()); } catch { setAdmins([]); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const save = async (part: string) => {
    if (!b) return;
    setBusy(true); setMsg(null);
    try {
      await saveBillingSettings({ grace_days: Number(b.grace_days), business_name: b.business_name,
        reminder_days: b.reminders.split(/[ ,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0),
        business_address: b.business_address || null, business_email: b.business_email || null,
        business_phone: b.business_phone || null, receipt_note: b.receipt_note || null });
      setMsg({ part, text: 'Saved.' });
    } catch (e) { setMsg({ part, text: e instanceof Error ? e.message : 'Could not save' }); }
    finally { setBusy(false); }
  };
  /** Email a one-time password; the slip on screen says whether it went, so nobody is told a mail arrived that did not. */
  const mailSlip = async (to: string, name: string | null, password: string, isNew: boolean) => {
    let mailed = 'Not emailed. Give it to them yourself.';
    try {
      const r = await sendEmail({
        to, toName: name, kind: isNew ? 'owner_credentials' : 'password_reset',
        subject: isNew ? 'You can now run Core Fitness' : 'A new password for Core Fitness',
        body: `${isNew ? 'You were added as a Core Fitness platform owner.' : 'Your Core Fitness platform password was reset.'}\n\nEmail: ${to}\nOne-time password: ${password}\n\nSign in on the platform computer. You will choose your own password straight away.`,
      });
      if (r.configured && r.status !== 'failed') mailed = `Emailed to ${to}.`;
    } catch { /* the slip still shows the password */ }
    setSlip({ email: to, password, mailed });
  };
  const said = (part: string) => msg?.part === part && <span className="meta" style={{ margin: 0 }}>{msg.text}</span>;

  // A worked example of the rules, so the numbers mean something.
  const due = new Date(); due.setDate(1); due.setMonth(due.getMonth() + 1);
  const locks = new Date(due); locks.setDate(due.getDate() + Number(b?.grace_days ?? 7) + 1);
  const reminders = (b?.reminders ?? '').split(/[ ,]+/).map(Number).filter((n) => n > 0).sort((x, y) => y - x);
  const ref = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/^https?:\/\//, '').split('.')[0] ?? 'not set';

  return (
    <div className="set2">
      <nav className="set-nav" aria-label="Settings sections">
        {PARTS.map(([k, label, sub, Icon]) => (
          <button key={k} type="button" className={part === k ? 'on' : ''} aria-current={part === k ? 'page' : undefined} onClick={() => setPart(k)} data-set-part={k}>
            <span className="set-ic"><Icon size={15} /></span>
            <span className="grow"><b>{label}</b><small>{sub}</small></span>
            <ChevronRight size={14} className="set-chev" />
          </button>
        ))}
      </nav>
      <div className="set-pane">
      {part === 'business' && (
      <form className="card set-6" onSubmit={(e) => { e.preventDefault(); void save('business'); }}>
        <h2 className="section-title"><Building size={14} /> Business and receipts <InfoDot tip="Printed on every receipt a gym gets for paying Core Fitness, never typed into a screen." /></h2>
        {b === undefined ? <SkelRows label="Loading…" /> : b === null ? <p className="empty">Paste migration 0138 to set these.</p> : (
          <>
            <div className="fields" style={{ marginTop: 0 }}>
              <div><label htmlFor="s-name">Business name</label><input id="s-name" required value={b.business_name} onChange={(e) => setB({ ...b, business_name: e.target.value })} /></div>
              <div><label htmlFor="s-phone">Phone</label><input id="s-phone" value={b.business_phone ?? ''} placeholder="+63 9…" onChange={(e) => setB({ ...b, business_phone: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label htmlFor="s-addr">Address</label><input id="s-addr" value={b.business_address ?? ''} onChange={(e) => setB({ ...b, business_address: e.target.value })} /></div>
              <div><label htmlFor="s-email">Email</label><input id="s-email" type="email" value={b.business_email ?? ''} onChange={(e) => setB({ ...b, business_email: e.target.value })} /></div>
              <div><label htmlFor="s-note">Line at the bottom</label><input id="s-note" value={b.receipt_note ?? ''} placeholder="Thank you." onChange={(e) => setB({ ...b, receipt_note: e.target.value })} /></div>
            </div>
            {/* A preview of the receipt itself (2026-11-08: a bare white bar read as a stray box): labelled, a paper slip
                with a sample payment, the business at the top and its line at the bottom. */}
            <div className="set-receipt" aria-label="Receipt preview">
              <span className="set-receipt__tag">Preview · how your receipts read</span>
              <div className="set-receipt__paper">
                <b>{b.business_name || 'Business name'}</b>
                <small>{[b.business_address, b.business_email, b.business_phone].filter(Boolean).join(' · ') || 'Address · email · phone'}</small>
                <hr />
                <div className="set-receipt__row"><span>Receipt</span><span>CF-2026-000123</span></div>
                <div className="set-receipt__row"><span>Growth plan · 1 month</span><span>₱2,999.00</span></div>
                <div className="set-receipt__row set-receipt__total"><span>Paid</span><span>₱2,999.00</span></div>
                <hr />
                <em>{b.receipt_note || 'Thank you.'}</em>
              </div>
            </div>
            <div className="row set-actions"><button className="btn" type="submit" disabled={busy}><Receipt size={14} /> Save receipt details</button>{said('business')}</div>
          </>
        )}
      </form>
      )}

      {part === 'billing' && (
      <form className="card set-6" onSubmit={(e) => { e.preventDefault(); void save('billing'); }}>
        <h2 className="section-title"><Timer size={14} /> Billing rules <InfoDot tip="Every gym's lock, the admin app's banner, the reminders and Money all read these two numbers (0138)." /></h2>
        {b ? (
          <>
            {/* Two numbers, each with what it does, then the month they make (2026-11-08: "enhance the UI/UX"). */}
            <div className="set-rules">
              <div className="set-rule">
                <label htmlFor="s-grace">Days of grace before read-only</label>
                <div className="set-rule__in"><input id="s-grace" type="number" min={0} max={60} required value={b.grace_days}
                  onChange={(e) => setB({ ...b, grace_days: Number(e.target.value) })} /><span>days</span></div>
                <small>After the due date an unpaid gym keeps working this long. Then its dashboard turns read-only, nothing is deleted.</small>
              </div>
              <div className="set-rule">
                <label htmlFor="s-rem">Remind the owner, days before</label>
                <div className="set-rule__in"><input id="s-rem" value={b.reminders} placeholder="7, 3, 1" onChange={(e) => setB({ ...b, reminders: e.target.value })} /><span>days</span></div>
                <small>Comma-separated. Each is an email and a notice in their dashboard before the due date.</small>
              </div>
            </div>
            <p className="set-ex">For a gym due on {long(due)}:</p>
            <ol className="set-track" aria-label="What happens to a gym due on the first of next month">
              {reminders.map((d) => { const x = new Date(due); x.setDate(due.getDate() - d); return (
                <li key={d} className="is-remind"><span className="set-track__dot"><BellRing size={13} /></span><b>{long(x)}</b><small>Reminder · {d} day{d === 1 ? '' : 's'} before</small></li>); })}
              <li className="is-due"><span className="set-track__dot"><Receipt size={13} /></span><b>{long(due)}</b><small>Due · told on the day</small></li>
              <li className="is-lock"><span className="set-track__dot"><Timer size={13} /></span><b>{long(locks)}</b><small>Read-only if still unpaid</small></li>
            </ol>
            <div className="row set-actions"><button className="btn" type="submit" disabled={busy}>Save billing rules</button>{said('billing')}</div>
          </>
        ) : <p className="empty">Paste migration 0138 to set these.</p>}
      </form>
      )}

      {part === 'admins' && (
      <section className="card set-6">
        <h2 className="section-title"><ShieldCheck size={14} /> Who can run the platform <InfoDot tip="Anyone here can let a gym in, suspend one and change what the service sells. The last one cannot be removed." /></h2>
        <div className="set-admins">
          {admins === null ? <SkelRows label="Loading…" /> : admins.map((a) => (
            <div key={a.user_id} className="set-admin">
              <span className="avatar">{((a.first_name ?? a.email ?? '?')[0] + (a.last_name?.[0] ?? '')).toUpperCase()}</span>
              <span className="grow" style={{ flexBasis: 120 }}>
                <span className="name" style={{ fontSize: 13.5 }}>{[a.first_name, a.last_name].filter(Boolean).join(' ') || a.email}{a.is_me && <span className="pill ok" style={{ marginLeft: 8 }}>you</span>}</span>
                <span className="meta" style={{ marginTop: 1 }}>{a.email}</span>
              </span>
              {!a.is_me && (
                <button className="btn ghost" disabled={busy} data-tip="A one-time password, shown once here and emailed. They choose their own at sign in."
                  onClick={() => {
                    if (resetting !== a.user_id) { setResetting(a.user_id); return; }
                    setResetting(null); setBusy(true); setMsg(null);
                    void (async () => {
                      try { const r = await platformOwner({ action: 'reset', userId: a.user_id }); await mailSlip(r.email ?? a.email ?? '', [a.first_name, a.last_name].filter(Boolean).join(' ') || null, r.password!, false); }
                      catch (e) { setMsg({ part: 'admins', text: e instanceof Error ? e.message : 'Could not reset' }); }
                      finally { setBusy(false); }
                    })();
                  }}><KeyRound size={14} /> {resetting === a.user_id ? 'Confirm reset' : 'Reset password'}</button>
              )}
              {!a.is_me && admins.length > 1 && (
                <button className="btn ghost" data-tip="Takes away their platform access. Their own account stays." onClick={() => void (async () => {
                  try { await removeAdmin(a.user_id); await load(); } catch (e) { setMsg({ part: 'admins', text: e instanceof Error ? e.message : 'Could not remove them' }); }
                })()}><UserMinus size={14} /> Remove</button>
              )}
            </div>
          ))}
        </div>
        {slip && (
          <div className="card" style={{ marginTop: 12, padding: 14 }} role="status" data-owner-slip>
            <b style={{ fontSize: 13.5 }}>One-time password for {slip.email}</b>
            <div className="row" style={{ marginTop: 8, gap: 10, alignItems: 'center' }}>
              <code style={{ fontSize: 16, letterSpacing: '.04em' }}>{slip.password}</code>
              <button type="button" className="btn ghost" onClick={() => void navigator.clipboard.writeText(slip.password)}>Copy</button>
              <button type="button" className="btn ghost" onClick={() => setSlip(null)}>Done</button>
            </div>
            <p className="meta" style={{ marginTop: 8 }}>{slip.mailed} Shown only now. They choose their own password when they sign in.</p>
          </div>
        )}
        {/* Add a profile (owner, 2026-11-23): a new account with a one-time password, or an existing one granted as it is. */}
        <form className="row set-actions" style={{ flexWrap: 'wrap', gap: 8 }} onSubmit={(e) => { e.preventDefault(); setBusy(true); setMsg(null); void (async () => {
          try {
            const r = await platformOwner({ action: 'create', email: email.trim(), firstName: first.trim(), lastName: last.trim() });
            setEmail(''); setFirst(''); setLast(''); await load();
            if (r.password) await mailSlip(r.email ?? email.trim(), [first.trim(), last.trim()].filter(Boolean).join(' ') || null, r.password, true);
            else setMsg({ part: 'admins', text: 'They already had a Core Fitness account, so they sign in with its own password. Use Reset password if they do not know it.' });
          }
          catch (err) { setMsg({ part: 'admins', text: err instanceof Error ? err.message : 'Could not add them' }); }
          finally { setBusy(false); }
        })(); }}>
          <input style={{ flex: '1 1 140px' }} required value={first} aria-label="First name" placeholder="First name" onChange={(e) => setFirst(e.target.value)} />
          <input style={{ flex: '1 1 140px' }} value={last} aria-label="Last name" placeholder="Last name" onChange={(e) => setLast(e.target.value)} />
          <input style={{ flex: '2 1 220px' }} type="email" required value={email} aria-label="Their email" placeholder="Their email" onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" type="submit" disabled={busy}><UserPlus size={14} /> Add</button>
        </form>
        {said('admins')}
      </section>
      )}

      {part === 'pay' && <PaymentMethods />}

      {part === 'install' && (
      <section className="card set-6">
        <h2 className="section-title"><Monitor size={14} /> This installation</h2>
        <dl className="qv-rows set-facts">
          <div><dt>Runs on</dt><dd>This computer only (localhost:5175), never deployed</dd></div>
          <div><dt>Database</dt><dd><code>{ref}</code> on Supabase</dd></div>
          <div><dt>Migrations</dt><dd>Checked with <code>python scripts/probe-migrations.py</code>, pasted one at a time</dd></div>
          <div><dt>Backups</dt><dd>Weekly, on GitHub Actions, status on Platform</dd></div>
        </dl>
        <h2 className="section-title" style={{ marginTop: 18 }}><Keyboard size={14} /> Shortcuts</h2>
        <ul className="set-keys">
          <li><kbd>Ctrl</kbd><kbd>K</kbd><span>Find a gym, an applicant, a payment reference, a ticket, a log entry or a screen</span></li>
          <li><kbd>/</kbd><span>The same search, from anywhere outside a text box</span></li>
          <li><kbd>Esc</kbd><span>Close a popup, the search or a tooltip</span></li>
          <li><kbd>↑</kbd><kbd>↓</kbd><kbd>Enter</kbd><span>Move through search results and open one</span></li>
        </ul>
      </section>
      )}

      {part === 'docs' && <div className="gd-stack" data-va-keep><GymDocsEditor /><GymDocuments /></div>}
      {part === 'mail' && <MailStatus />}
      </div>
    </div>
  );
}
