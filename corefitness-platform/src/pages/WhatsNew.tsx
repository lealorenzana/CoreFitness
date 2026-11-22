import { useCallback, useEffect, useState } from 'react';
import { Pencil, Smartphone, Sparkles, Trash2, Users } from 'lucide-react';
import InfoDot from '../components/InfoDot';
import Tiles from '../components/Tiles';
import './talk.css';
import { deleteRelease, explain, listReleases, saveRelease, type Release, type ReleaseApp } from '../lib/platform';
import SkelRows from '../components/ui/SkelRows';

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

  if (items === null) return <SkelRows label="Loading…" />;
  const forApp = APPS.find((a) => a.key === form.app)!;
  return (
    <>
      {error && <p className="err">{error}</p>}
      <Tiles items={APPS.map((a) => ({ icon: a.key === 'admin' ? Users : Smartphone, value: latest(a.key) ? String(latest(a.key)!.seen) : '—',
        label: `${a.label}: seen the newest` }))} />
      {/* 2026-11-22: write on the left; on the right, the note as the person will see it, then every note written. */}
      <div className="cw" data-va-keep>
        <form className="card cw-form" onSubmit={send}>
          <h2 className="section-title"><Sparkles size={14} /> {form.id ? 'Edit the note' : 'New note'}</h2>
          <p className="cw-sub">Shown once to {forApp.who}. People who joined after it is written never see it. Short lines a person reads in ten seconds.</p>
          <div className="cw-field"><label htmlFor="rn-app">For</label>
            <select id="rn-app" value={form.app} onChange={(e) => setForm({ ...form, app: e.target.value as ReleaseApp })}>
              {APPS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select></div>
          <div className="cw-field"><label htmlFor="rn-title">Title</label>
            <input id="rn-title" value={form.title} maxLength={80} required placeholder="What's new in the app"
              onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="cw-field"><label htmlFor="rn-items">What changed, one line each, up to 8</label>
            <textarea id="rn-items" rows={7} value={form.items} placeholder={'Alerts now reach your phone straight away.\nBadges can earn you points.'}
              onChange={(e) => setForm({ ...form, items: e.target.value })} />
            <span className={`cw-count${lines.length > 8 || lines.some((l) => l.length > 200) ? ' warn' : ''}`}>{lines.length} of 8 lines{lines.some((l) => l.length > 200) ? ', a line is over 200 characters' : ''}</span>
          </div>
          <div className="cw-actions">
            <button className="btn" type="submit" disabled={busy || form.title.trim().length < 3 || lines.length === 0 || lines.length > 8}>{form.id ? 'Save' : 'Publish'}</button>
            {form.id && <button type="button" className="btn ghost" onClick={() => setForm({ id: null, app: form.app, title: '', items: '' })}>Cancel</button>}
          </div>
        </form>

        <div className="cw-right">
          <section className="card cw-preview" aria-hidden="true">
            <span className="cw-preview-lbl">How it looks in the {forApp.label.toLowerCase()}, once, for {forApp.who}</span>
            <div className="cw-note">
              <span className="cw-note-kicker"><Sparkles size={13} /> What's new</span>
              <b>{form.title.trim() || 'Your title'}</b>
              <ul>{(lines.length ? lines.slice(0, 8) : ['One line for each change.']).map((l, i) => <li key={i}>{l}</li>)}</ul>
              <span className="cw-note-btn">Got it</span>
            </div>
          </section>

          <section className="card cw-list">
            <h2 className="section-title"><Sparkles size={14} /> Written <InfoDot tip="The newest note for each app is the one people see, once. Editing a note others have seen does not show it to them again." /></h2>
            {items.length === 0 && <p className="cw-none">Nothing written yet.</p>}
            <ul>
              {items.map((r) => (
                <li key={r.id} data-release={r.app}>
                  <span className={`cw-mark${latest(r.app)?.id === r.id ? ' now' : ''}`} aria-hidden="true" />
                  <span className="cw-item">
                    <b>{r.title}</b>
                    <ul className="cw-lines">{r.items.map((it) => <li key={it}>{it}</li>)}</ul>
                    <span className="cw-meta">{APPS.find((a) => a.key === r.app)?.label} · {day(r.published_at)} · {r.seen} seen{latest(r.app)?.id === r.id ? <> · <span className="cw-now">Showing now</span></> : ''}</span>
                  </span>
                  <span className="cw-side">
                    <button type="button" className="btn ghost sm" aria-label={`Edit ${r.title}`} onClick={() => setForm({ id: r.id, app: r.app, title: r.title, items: r.items.join('\n') })}><Pencil size={13} /></button>
                    <button type="button" className="btn ghost sm" aria-label={`Delete ${r.title}`} onClick={() => void deleteRelease(r.id).then(load).catch((err) => setError(err instanceof Error ? err.message : 'Could not delete it'))}><Trash2 size={13} /></button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
