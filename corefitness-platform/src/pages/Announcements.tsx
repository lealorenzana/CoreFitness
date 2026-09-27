import { useCallback, useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import {
  endAnnouncement, explain, listAnnouncements, listPlatformPlans, saveAnnouncement,
  type PlatformAnnouncement, type PlatformPlan,
} from '../lib/platform';

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no end date');

/**
 * Announcements (0137): write once, and it shows as a banner in the admin app
 * of every gym it is for — all gyms, or one plan — until its end date or until
 * each person dismisses it. Owners and desks only; members never see these.
 */
export default function Announcements() {
  const [items, setItems] = useState<PlatformAnnouncement[] | null>(null);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [form, setForm] = useState({ title: '', body: '', level: 'info' as 'info' | 'warning', plan: '', ends: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const [a, p] = await Promise.all([listAnnouncements(), listPlatformPlans()]); setItems(a); setPlans(p); setError(null); }
    catch (e) { setError(explain(e, '0137')); setItems([]); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveAnnouncement({ title: form.title.trim(), body: form.body.trim(), level: form.level, plan: form.plan || null,
        ends: form.ends ? new Date(`${form.ends}T23:59:59+08:00`).toISOString() : null });
      setForm({ title: '', body: '', level: 'info', plan: '', ends: '' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not announce it'); }
    finally { setBusy(false); }
  };

  if (items === null) return <p className="empty">Loading…</p>;
  return (
    <>
      {error && <p className="err">{error}</p>}
      <div className="grid-2" style={{ marginTop: 0 }}>
        <section className="card">
          <h2 className="section-title"><Megaphone size={14} /> Sent and live</h2>
          {items.length === 0 && <p className="empty">Nothing announced yet.</p>}
          {items.map((a) => (
            <div key={a.id} className="log" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: 'var(--text)', fontWeight: 650 }}>{a.title}</span>
                <span style={{ display: 'block', marginTop: 2 }}>{a.body}</span>
                <span className="chips">
                  <span className={`chip${a.level === 'warning' ? ' warn' : ''}`}>{a.level === 'warning' ? 'Warning' : 'Info'}</span>
                  <span className="chip">{a.plan_key ? `Gyms on ${plans.find((p) => p.key === a.plan_key)?.name ?? a.plan_key}` : 'Every gym'} · {a.gyms_reached} reached</span>
                  <span className="chip">{day(a.starts_at)} → {day(a.ends_at)}</span>
                  <span className="chip">{a.dismissed} dismissed</span>
                </span>
              </span>
              {a.live ? (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="pill ok"><span className="dot" />Live</span>
                  <button className="btn ghost" onClick={() => void endAnnouncement(a.id).then(load)}>End now</button>
                </span>
              ) : <span className="pill">Ended</span>}
            </div>
          ))}
        </section>

        <form className="card" onSubmit={send}>
          <h2 className="section-title"><Megaphone size={14} /> New announcement</h2>
          <p className="meta" style={{ marginTop: -6 }}>Shown as a banner on every screen of the gyms' admin app. Owners and front desks see it; members never do.</p>
          <div className="fields">
            <div><label htmlFor="an-title">Title</label>
              <input id="an-title" value={form.title} maxLength={100} required placeholder="Maintenance tonight, 10–11pm"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label htmlFor="an-body">Message</label>
            <textarea id="an-body" rows={4} value={form.body} maxLength={600} required placeholder="What they should know or do"
              onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <div className="fields">
            <div><label htmlFor="an-level">Kind</label>
              <select id="an-level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as 'info' | 'warning' })}>
                <option value="info">Info (violet)</option><option value="warning">Warning (amber)</option>
              </select></div>
            <div><label htmlFor="an-plan">Who</label>
              <select id="an-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                <option value="">Every gym</option>
                {plans.filter((p) => p.is_active).map((p) => <option key={p.key} value={p.key}>Gyms on {p.name}</option>)}
              </select></div>
            <div><label htmlFor="an-ends">Ends (optional)</label>
              <input id="an-ends" type="date" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn" type="submit" disabled={busy || !form.title.trim() || !form.body.trim()}>Announce</button>
          </div>
        </form>
      </div>
    </>
  );
}
