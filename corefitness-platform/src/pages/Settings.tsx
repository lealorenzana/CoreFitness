import { useCallback, useEffect, useState } from 'react';
import { BellRing, Building, Keyboard, Monitor, Receipt, ShieldCheck, Timer, UserMinus, UserPlus } from 'lucide-react';
import {
  addAdmin, billingSettings, explain, listAdmins, removeAdmin, saveBillingSettings,
  type BillingSettings, type PlatformAdmin,
} from '../lib/platform';
import InfoDot from '../components/InfoDot';
import PaymentMethods from '../components/PaymentMethods';

const long = (d: Date) => d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The platform's own settings, in one place (2026-09-28): the business printed
 * on every receipt, the billing rules every gym's lock and reminders follow
 * (0138), and who can run the platform (0109). Money and Platform point here
 * rather than each carrying a second copy of a form.
 */
export default function Settings() {
  const [b, setB] = useState<(BillingSettings & { reminders: string }) | null | undefined>(undefined);
  const [admins, setAdmins] = useState<PlatformAdmin[] | null>(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ part: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
  const said = (part: string) => msg?.part === part && <span className="meta" style={{ margin: 0 }}>{msg.text}</span>;

  // A worked example of the rules, so the numbers mean something.
  const due = new Date(); due.setDate(1); due.setMonth(due.getMonth() + 1);
  const locks = new Date(due); locks.setDate(due.getDate() + Number(b?.grace_days ?? 7) + 1);
  const reminders = (b?.reminders ?? '').split(/[ ,]+/).map(Number).filter((n) => n > 0).sort((x, y) => y - x);
  const ref = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/^https?:\/\//, '').split('.')[0] ?? 'not set';

  return (
    <div className="set">
      <form className="card set-6" onSubmit={(e) => { e.preventDefault(); void save('business'); }}>
        <h2 className="section-title"><Building size={14} /> Business and receipts <InfoDot tip="Printed on every receipt a gym gets for paying Core Fitness — never typed into a screen." /></h2>
        {b === undefined ? <p className="empty">Loading…</p> : b === null ? <p className="empty">Paste migration 0138 to set these.</p> : (
          <>
            <div className="fields" style={{ marginTop: 0 }}>
              <div><label htmlFor="s-name">Business name</label><input id="s-name" required value={b.business_name} onChange={(e) => setB({ ...b, business_name: e.target.value })} /></div>
              <div><label htmlFor="s-phone">Phone</label><input id="s-phone" value={b.business_phone ?? ''} placeholder="+63 9…" onChange={(e) => setB({ ...b, business_phone: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label htmlFor="s-addr">Address</label><input id="s-addr" value={b.business_address ?? ''} onChange={(e) => setB({ ...b, business_address: e.target.value })} /></div>
              <div><label htmlFor="s-email">Email</label><input id="s-email" type="email" value={b.business_email ?? ''} onChange={(e) => setB({ ...b, business_email: e.target.value })} /></div>
              <div><label htmlFor="s-note">Line at the bottom</label><input id="s-note" value={b.receipt_note ?? ''} placeholder="Thank you." onChange={(e) => setB({ ...b, receipt_note: e.target.value })} /></div>
            </div>
            <div className="set-preview" aria-label="How a receipt's header reads">
              <b>{b.business_name || 'Business name'}</b>
              <span>{[b.business_address, b.business_email, b.business_phone].filter(Boolean).join(' · ') || 'Address · email · phone'}</span>
            </div>
            <div className="row set-actions"><button className="btn" type="submit" disabled={busy}><Receipt size={14} /> Save receipt details</button>{said('business')}</div>
          </>
        )}
      </form>

      <form className="card set-6" onSubmit={(e) => { e.preventDefault(); void save('billing'); }}>
        <h2 className="section-title"><Timer size={14} /> Billing rules <InfoDot tip="Every gym's lock, the admin app's banner, the reminders and Money all read these two numbers (0138)." /></h2>
        {b ? (
          <>
            <div className="fields" style={{ marginTop: 0 }}>
              <div><label htmlFor="s-grace">Days before read-only</label>
                <input id="s-grace" type="number" min={0} max={60} required value={b.grace_days} onChange={(e) => setB({ ...b, grace_days: Number(e.target.value) })} /></div>
              <div><label htmlFor="s-rem">Remind owners, days before</label>
                <input id="s-rem" value={b.reminders} placeholder="7, 3, 1" onChange={(e) => setB({ ...b, reminders: e.target.value })} /></div>
            </div>
            <ol className="set-timeline" aria-label="What happens to a gym due on the first of next month">
              {reminders.map((d) => { const x = new Date(due); x.setDate(due.getDate() - d); return <li key={d}><BellRing size={13} /><b>{long(x)}</b> reminder — {d} day{d === 1 ? '' : 's'} before</li>; })}
              <li><BellRing size={13} /><b>{long(due)}</b> due — told on the day</li>
              <li className="warn"><Timer size={13} /><b>{long(locks)}</b> read-only if still unpaid — nothing is deleted</li>
            </ol>
            <div className="row set-actions"><button className="btn" type="submit" disabled={busy}>Save billing rules</button>{said('billing')}</div>
          </>
        ) : <p className="empty">Paste migration 0138 to set these.</p>}
      </form>

      <section className="card set-6">
        <h2 className="section-title"><ShieldCheck size={14} /> Who can run the platform <InfoDot tip="Anyone here can let a gym in, suspend one and change what the service sells. The last one cannot be removed." /></h2>
        <div className="set-admins">
          {admins === null ? <p className="empty">Loading…</p> : admins.map((a) => (
            <div key={a.user_id} className="set-admin">
              <span className="avatar">{((a.first_name ?? a.email ?? '?')[0] + (a.last_name?.[0] ?? '')).toUpperCase()}</span>
              <span className="grow" style={{ flexBasis: 120 }}>
                <span className="name" style={{ fontSize: 13.5 }}>{[a.first_name, a.last_name].filter(Boolean).join(' ') || a.email}{a.is_me && <span className="pill ok" style={{ marginLeft: 8 }}>you</span>}</span>
                <span className="meta" style={{ marginTop: 1 }}>{a.email}</span>
              </span>
              {!a.is_me && admins.length > 1 && (
                <button className="btn ghost" data-tip="Takes away their platform access. Their own account stays." onClick={() => void (async () => {
                  try { await removeAdmin(a.user_id); await load(); } catch (e) { setMsg({ part: 'admins', text: e instanceof Error ? e.message : 'Could not remove them' }); }
                })()}><UserMinus size={14} /> Remove</button>
              )}
            </div>
          ))}
        </div>
        <form className="row set-actions" onSubmit={(e) => { e.preventDefault(); void (async () => {
          try { await addAdmin(email.trim()); setEmail(''); await load(); setMsg({ part: 'admins', text: 'Added.' }); }
          catch (err) { setMsg({ part: 'admins', text: err instanceof Error ? err.message : 'Could not add them' }); }
        })(); }}>
          <input className="grow" type="email" required value={email} aria-label="Their email" placeholder="their email — they need a Core Fitness account already" onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" type="submit"><UserPlus size={14} /> Add</button>
        </form>
        {said('admins')}
      </section>

      <PaymentMethods />

      <section className="card set-6">
        <h2 className="section-title"><Monitor size={14} /> This installation</h2>
        <dl className="qv-rows set-facts">
          <div><dt>Runs on</dt><dd>This computer only (localhost:5175) — never deployed</dd></div>
          <div><dt>Database</dt><dd><code>{ref}</code> on Supabase</dd></div>
          <div><dt>Migrations</dt><dd>Checked with <code>python scripts/probe-migrations.py</code>, pasted one at a time</dd></div>
          <div><dt>Backups</dt><dd>Weekly, on GitHub Actions — status on Platform</dd></div>
        </dl>
        <h2 className="section-title" style={{ marginTop: 18 }}><Keyboard size={14} /> Shortcuts</h2>
        <ul className="set-keys">
          <li><kbd>Ctrl</kbd><kbd>K</kbd><span>Find a gym, an applicant, a payment reference, a ticket, a log entry or a screen</span></li>
          <li><kbd>/</kbd><span>The same search, from anywhere outside a text box</span></li>
          <li><kbd>Esc</kbd><span>Close a popup, the search or a tooltip</span></li>
          <li><kbd>↑</kbd><kbd>↓</kbd><kbd>Enter</kbd><span>Move through search results and open one</span></li>
        </ul>
      </section>
    </div>
  );
}
