import { useCallback, useEffect, useState } from 'react';
import { Eye, Pencil, Smartphone, Sparkles, Trash2, Users } from 'lucide-react';
import InfoDot from '../components/InfoDot';
import Tiles from '../components/Tiles';
import { deleteRelease, explain, listReleases, saveRelease, type Release, type ReleaseApp } from '../lib/platform';

const APPS: { key: ReleaseApp; label: string; who: string }[] = [
  { key: 'admin', label: 'Admin app', who: 'gym owners and front desks, on their dashboard' },
  { key: 'member', label: 'Member app', who: 'members, on Today' },
  { key: 'trainer', label: 'Trainer app', who: 'coaches, on their hub' },
];
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * What's new (0212): after an update, write what changed — for the admin app,
 * the member app or the trainer app. Each person sees the newest note for their
 * app once, as a panel at the top of their home screen, and never one written
 * before their account existed. The count is how many have seen it.
 */
export default function WhatsNew() {
  const [items, setItems] = useState<Release[] | null>(null);
  const [form, setForm] = useState<{ id: string | null; app: ReleaseApp; title: string; items: string }>({ id: null, app: 'member', title: '', items: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await listReleases()); setError(null); }
    catch (e) { setError(explain(e, '0212')); setItems([]); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const lines = form.items.split('\n').map((l) => l.trim()).filter(Boolean);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveRelease({ id: form.id, app: form.app, title: form.title.trim(), items: lines });
      setForm({ id: null, app: form.app, title: '', items: '' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save it'); }
    finally { setBusy(false); }
  };
  const latest = (app: ReleaseApp) => items?.find((r) => r.app === app);

  if (items === null) return <p className="empty">Loading…</p>;
  return (
    <>
      {error && <p className="err">{error}</p>}
      <Tiles items={APPS.map((a) => ({ icon: a.key === 'admin' ? Users : Smartphone, value: latest(a.key) ? String(latest(a.key)!.seen) : '—',
        label: `${a.label}: seen the newest` }))} />
      <div className="grid-2" style={{ marginTop: 0 }}>
        <section className="card">
          <h2 className="section-title"><Sparkles size={14} /> Written <InfoDot tip="The newest note for each app is the one people see, once. Editing a note others have seen does not show it to them again." /></h2>
          {items.length === 0 && <p className="empty"><Sparkles size={22} className="empty-icon" />Nothing written yet.</p>}
          {items.map((r) => (
            <div key={r.id} className="log" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }} data-release={r.app}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: 'var(--text)', fontWeight: 650 }}>{r.title}</span>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{r.items.map((it) => <li key={it}>{it}</li>)}</ul>
                <span className="chips">
                  <span className="chip">{APPS.find((a) => a.key === r.app)?.label}</span>
                  <span className="chip">{day(r.published_at)}</span>
                  <span className="chip"><Eye size={11} /> {r.seen} seen</span>
                  {latest(r.app)?.id === r.id && <span className="chip" style={{ color: "var(--violet, #C4B5FD)" }}>Showing now</span>}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn ghost" aria-label={`Edit ${r.title}`} onClick={() => setForm({ id: r.id, app: r.app, title: r.title, items: r.items.join('\n') })}><Pencil size={13} /></button>
                <button type="button" className="btn ghost" aria-label={`Delete ${r.title}`} onClick={() => void deleteRelease(r.id).then(load).catch((err) => setError(err instanceof Error ? err.message : 'Could not delete it'))}><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
        </section>

        <form className="card" onSubmit={send}>
          <h2 className="section-title"><Sparkles size={14} /> {form.id ? 'Edit the note' : 'New note'} <InfoDot tip="Short lines a person reads in ten seconds: what changed and where to find it." /></h2>
          <p className="meta" style={{ marginTop: -6 }}>Shown once to {APPS.find((a) => a.key === form.app)?.who}. People who joined after it is written never see it.</p>
          <div className="fields">
            <div><label htmlFor="rn-app">For</label>
              <select id="rn-app" value={form.app} onChange={(e) => setForm({ ...form, app: e.target.value as ReleaseApp })}>
                {APPS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select></div>
            <div><label htmlFor="rn-title">Title</label>
              <input id="rn-title" value={form.title} maxLength={80} required placeholder="What's new in the app"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label htmlFor="rn-items">What changed — one line each, up to 8</label>
            <textarea id="rn-items" rows={7} value={form.items} placeholder={'Alerts now reach your phone straight away.\nBadges can earn you points.'}
              onChange={(e) => setForm({ ...form, items: e.target.value })} />
            <p className="meta">{lines.length} of 8 lines{lines.some((l) => l.length > 200) ? ' — a line is over 200 characters' : ''}</p>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn" type="submit" disabled={busy || form.title.trim().length < 3 || lines.length === 0 || lines.length > 8}>{form.id ? 'Save' : 'Publish'}</button>
            {form.id && <button type="button" className="btn ghost" onClick={() => setForm({ id: null, app: form.app, title: '', items: '' })}>Cancel</button>}
          </div>
        </form>
      </div>
    </>
  );
}
