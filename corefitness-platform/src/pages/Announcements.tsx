import { useCallback, useEffect, useState } from 'react';
import InfoDot from '../components/InfoDot';
import { Building2, EyeOff, History, Megaphone, Radio } from 'lucide-react';
import Tiles from '../components/Tiles';
import './talk.css';
import DatePicker from '../components/DatePicker';
import {
  endAnnouncement, explain, listAnnouncements, listPlatformPlans, saveAnnouncement,
  type PlatformAnnouncement, type PlatformPlan,
} from '../lib/platform';
import SkelRows from '../components/ui/SkelRows';

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

  if (items === null) return <SkelRows label="Loading…" />;
  const whoLabel = form.plan ? `Gyms on ${plans.find((p) => p.key === form.plan)?.name ?? form.plan}` : 'Every gym';
  return (
    <>
      {error && <p className="err">{error}</p>}
      <Tiles items={[
        { icon: Radio, value: String(items.filter((a) => a.live).length), label: 'Live now' },
        { icon: Building2, value: String(items.filter((a) => a.live).reduce((n, a) => n + a.gyms_reached, 0)), label: 'Gyms reached, live' },
        { icon: EyeOff, value: String(items.reduce((n, a) => n + a.dismissed, 0)), label: 'Dismissed' },
        { icon: History, value: String(items.filter((a) => !a.live).length), label: 'Ended' },
      ]} />
      {/* 2026-11-22: write on the left; on the right, the banner exactly as owners and desks will see it, then everything sent. */}
      <div className="cw" data-va-keep>
        <form className="card cw-form" onSubmit={send}>
          <h2 className="section-title"><Megaphone size={14} /> New announcement</h2>
          <p className="cw-sub">A banner on every screen of the gyms' admin app, until it ends or each person dismisses it. Owners and front desks see it; members never do.</p>
          <div className="cw-field"><label htmlFor="an-title">Title</label>
            <input id="an-title" value={form.title} maxLength={100} required placeholder="Maintenance tonight, 10–11pm"
              onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="cw-field"><label htmlFor="an-body">Message</label>
            <textarea id="an-body" rows={4} value={form.body} maxLength={600} required placeholder="What they should know or do"
              onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          <div className="cw-two">
            <div className="cw-field"><label htmlFor="an-level">Kind</label>
              <select id="an-level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as 'info' | 'warning' })}>
                <option value="info">Info (violet)</option><option value="warning">Warning (amber)</option>
              </select></div>
            <div className="cw-field"><label htmlFor="an-plan">Who</label>
              <select id="an-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                <option value="">Every gym</option>
                {plans.filter((p) => p.is_active).map((p) => <option key={p.key} value={p.key}>Gyms on {p.name}</option>)}
              </select></div>
          </div>
          <div className="cw-field"><label htmlFor="an-ends">Ends (optional)</label>
            <DatePicker id="an-ends" mode="future" placeholder="No end date" value={form.ends} onChange={(v) => setForm({ ...form, ends: v })} /></div>
          <div className="cw-actions">
            <button className="btn" type="submit" disabled={busy || !form.title.trim() || !form.body.trim()}>Announce</button>
          </div>
        </form>

        <div className="cw-right">
          <section className="card cw-preview" aria-hidden="true">
            <span className="cw-preview-lbl">How owners and desks will see it · {whoLabel}{form.ends ? ` · until ${day(form.ends)}` : ''}</span>
            <div className={`cw-banner ${form.level}`}>
              <Megaphone size={16} />
              <span><b>{form.title.trim() || 'Your title'}</b>{form.body.trim() || 'Your message, as they will read it.'}</span>
              <span className="cw-banner-x">Dismiss</span>
            </div>
          </section>

          <section className="card cw-list">
            <h2 className="section-title"><History size={14} /> Sent <InfoDot tip="A live announcement is a banner on every screen of the gyms' admin app, until its end date or until each person dismisses it." /></h2>
            {items.length === 0 && <p className="cw-none">Nothing announced yet.</p>}
            <ul>
              {items.map((a) => (
                <li key={a.id}>
                  <span className={`cw-mark ${a.level}`} aria-hidden="true" />
                  <span className="cw-item">
                    <b>{a.title}</b>
                    <span className="cw-body">{a.body}</span>
                    <span className="cw-meta">{a.level === 'warning' ? 'Warning' : 'Info'} · {a.plan_key ? `Gyms on ${plans.find((p) => p.key === a.plan_key)?.name ?? a.plan_key}` : 'Every gym'} · {a.gyms_reached} reached · {day(a.starts_at)} to {day(a.ends_at)} · {a.dismissed} dismissed</span>
                  </span>
                  {a.live ? (
                    <span className="cw-side">
                      <span className="cw-live"><i />Live</span>
                      <button type="button" className="btn ghost sm" onClick={() => void endAnnouncement(a.id).then(load)}>End now</button>
                    </span>
                  ) : <span className="cw-side"><span className="cw-ended">Ended</span></span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
