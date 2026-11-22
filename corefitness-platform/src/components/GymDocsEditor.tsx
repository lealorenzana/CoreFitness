import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, FilePlus2, PenLine, Plus, Save, Send, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import template from '../data/legalTemplate.json';
import InfoDot from './InfoDot';
import DatePicker from './DatePicker';
import './gymdocs.css';

/**
 * Editing the gym documents (0262). One draft at a time: all three documents as sections, with four placeholders
 * the website fills from Settings ({business}, {contact}, {grace}, {reminders}). Publishing freezes the draft under
 * its date and puts it in effect (0156's own step: owners are asked to agree, new applicants agree to it). A
 * published version can never change, so a new wording is always a new date.
 *
 * A new draft starts from the version in effect when it was written here, otherwise from the website's own text
 * (data/legalTemplate.json, made by scripts/legal-template.mts and proved word for word against the site's code).
 */
type DocKey = 'terms' | 'dpa' | 'privacy';
interface Section { id: string; title: string; body: string[] }
interface Doc { short: string; title: string; lede: string; law: string; sections: Section[] }
type Docs = Record<DocKey, Doc>;
interface Row { version: string; status: 'draft' | 'published'; docs: Docs; note: string | null; updated_at: string; published_at: string | null; updated_by: string | null; in_effect: boolean }
interface Facts { business: string; email: string | null; phone: string | null; address: string | null; grace: number | null; reminders: number[] | null }

const DOCS: [DocKey, string][] = [['terms', 'Terms for gyms'], ['dpa', 'Data Processing Agreement'], ['privacy', 'Privacy Policy']];
/** Today in Manila (UTC+8), as YYYY-MM-DD: a version cannot take effect before its date (0156). */
const manilaToday = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const day = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' }); };
const slug = (s: string) => s.toLowerCase().replace(/^\d+\.\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'section';

/** The same words the website uses for the four placeholders (corefitness-site/src/legalText.ts). */
function filler(f: Facts) {
  const list = (n: number[]) => (n.length === 1 ? `${n[0]}` : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
  const ways = [f.email, f.phone].filter(Boolean).join(' or ');
  const contact = ways ? `Write to ${f.business} at ${ways}${f.address ? `, or by post to ${f.address}` : ''}.`
    : `Write to ${f.business} through the support page in your gym app, or reply on your application's status link.`;
  const grace = f.grace === null ? 'the grace period shown in your gym app' : `${f.grace} days`;
  const reminders = f.reminders && f.reminders.length ? `${list([...f.reminders].sort((a, b) => b - a))} days before` : 'before';
  return (s: string) => s.split('{contact}').join(contact).split('{grace}').join(grace).split('{reminders}').join(reminders).split('{business}').join(f.business);
}

export default function GymDocsEditor({ onPublished }: { onPublished?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState<{ version: string; docs: Docs; note: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [doc, setDoc] = useState<DocKey>('terms');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'discard' | null>(null);
  const [facts, setFacts] = useState<Facts>({ business: 'Core Fitness', email: null, phone: null, address: null, grace: null, reminders: null });

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('platform_gym_documents');
    if (error) { setMissing(true); setRows([]); return; }
    const r = (data ?? []) as Row[];
    setRows(r);
    const d = r.find((x) => x.status === 'draft');
    setDraft(d ? { version: d.version, docs: d.docs, note: d.note ?? '' } : null);
    setDirty(false);
  }, []);
  useEffect(() => {
    void (async () => {
      await load();
      const { data } = await supabase.rpc('platform_public_terms');
      const t = (data ?? {}) as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      setFacts({ business: s(t.business_name) ?? 'Core Fitness', email: s(t.business_email), phone: s(t.business_phone), address: s(t.business_address),
        grace: typeof t.grace_days === 'number' ? t.grace_days : null, reminders: Array.isArray(t.reminder_days) ? (t.reminder_days as number[]) : null });
    })();
  }, [load]);

  const inEffect = rows?.find((r) => r.in_effect && r.status === 'published') ?? null;
  const published = rows?.filter((r) => r.status === 'published') ?? [];
  const fill = useMemo(() => filler(facts), [facts]);

  const start = () => {
    const from = inEffect?.docs ?? (template.docs as unknown as Docs);
    setDraft({ version: manilaToday(), docs: JSON.parse(JSON.stringify(from)), note: '' });
    setDirty(true); setMsg(null); setView('edit');
  };
  const change = (fn: (d: Docs) => void) => {
    setDraft((cur) => { if (!cur) return cur; const docs = JSON.parse(JSON.stringify(cur.docs)) as Docs; fn(docs); return { ...cur, docs }; });
    setDirty(true);
  };
  const save = async () => {
    if (!draft) return false;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('save_gym_documents_draft', { p_version: draft.version, p_docs: draft.docs, p_note: draft.note || null });
    setBusy(false);
    if (error) { setMsg({ text: error.message, bad: true }); return false; }
    setMsg({ text: 'Draft saved. Nothing on the website changes until you publish it.' });
    await load();
    return true;
  };
  const publish = async () => {
    if (!draft) return;
    if (dirty && !(await save())) return;
    setBusy(true);
    const { error } = await supabase.rpc('publish_gym_documents', { p_version: draft.version });
    setBusy(false); setConfirm(null);
    if (error) { setMsg({ text: error.message, bad: true }); return; }
    setMsg({ text: `The version of ${day(draft.version)} is in effect. Owners are asked to agree to it, and new applicants agree to it.` });
    await load();
    onPublished?.();
  };
  const discard = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('discard_gym_documents_draft');
    setBusy(false); setConfirm(null);
    if (error) { setMsg({ text: error.message, bad: true }); return; }
    setMsg({ text: 'Draft discarded.' });
    await load();
  };

  if (rows === null) return <section className="card gde"><p className="gde-none">Reading the documents…</p></section>;
  if (missing) {
    return (
      <section className="card gde">
        <h2 className="section-title"><PenLine size={14} /> Edit the documents</h2>
        <p className="gde-warn">Editing the wording here needs migration 0262. Until it is pasted, the documents' words are the website's own (corefitness-site/src/legalText.ts), and the section below still puts a version in effect.</p>
      </section>
    );
  }

  const d = draft?.docs[doc];
  return (
    <section className="card gde" data-docs-editor>
      <header className="gde-head">
        <h2 className="section-title"><PenLine size={14} /> Edit the documents
          <InfoDot tip="One draft at a time. {business}, {contact}, {grace} and {reminders} are filled on the website from Settings, so a change of phone number or grace days never needs a new version." /></h2>
        <span className="gde-state">
          {inEffect ? <>In effect: <b>{day(inEffect.version)}</b>, written here</> : <>In effect: the website&rsquo;s own text</>}
          {published.length > 0 && <> · {published.length} version{published.length === 1 ? '' : 's'} published here</>}
        </span>
      </header>

      {!draft ? (
        <div className="gde-empty">
          <p>No draft. Start one to change the wording; it begins as a copy of {inEffect ? `the version of ${day(inEffect.version)}` : 'the text on the website now'}.</p>
          <button type="button" className="btn" onClick={start}><FilePlus2 size={14} /> Start a new version</button>
        </div>
      ) : (
        <>
          <div className="gde-bar">
            <div className="gde-seg" role="tablist" aria-label="Document">
              {DOCS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={doc === k} className={doc === k ? 'on' : ''} onClick={() => setDoc(k)}>{label}</button>)}
            </div>
            <div className="gde-seg" role="group" aria-label="View">
              <button type="button" className={view === 'edit' ? 'on' : ''} onClick={() => setView('edit')}><PenLine size={13} /> Edit</button>
              <button type="button" className={view === 'preview' ? 'on' : ''} onClick={() => setView('preview')}><Eye size={13} /> Preview</button>
            </div>
            <span className="gde-version"><label htmlFor="gde-version">Version</label>
              {/* history: today or earlier. A version cannot take effect before its date (0156). */}
              <span style={{ width: 170 }}><DatePicker id="gde-version" mode="history" value={draft.version}
                onChange={(v) => { if (v) { setDraft({ ...draft, version: v }); setDirty(true); } }} /></span>
            </span>
          </div>

          {d && view === 'edit' ? (
            <div className="gde-body">
              <div className="gde-two">
                <label className="gde-field">Title<input value={d.title} onChange={(e) => change((x) => { x[doc].title = e.target.value; })} /></label>
                <label className="gde-field">Short name<input value={d.short} onChange={(e) => change((x) => { x[doc].short = e.target.value; })} /></label>
              </div>
              <label className="gde-field">The line under the title<textarea rows={2} value={d.lede} onChange={(e) => change((x) => { x[doc].lede = e.target.value; })} /></label>
              <p className="gde-hint">Paragraphs are separated by an empty line. {'{business}'}, {'{contact}'}, {'{grace}'} and {'{reminders}'} are filled from Settings.</p>
              <ol className="gde-secs">
                {d.sections.map((s, i) => (
                  <li key={`${s.id}-${i}`} className="gde-sec">
                    <div className="gde-sec-head">
                      <input value={s.title} aria-label={`Section ${i + 1} title`} onChange={(e) => change((x) => { x[doc].sections[i].title = e.target.value; })} />
                      <button type="button" className="gde-icon" aria-label="Move up" disabled={i === 0}
                        onClick={() => change((x) => { const a = x[doc].sections; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}><ArrowUp size={14} /></button>
                      <button type="button" className="gde-icon" aria-label="Move down" disabled={i === d.sections.length - 1}
                        onClick={() => change((x) => { const a = x[doc].sections; [a[i + 1], a[i]] = [a[i], a[i + 1]]; })}><ArrowDown size={14} /></button>
                      <button type="button" className="gde-icon" aria-label="Remove this section" disabled={d.sections.length === 1}
                        onClick={() => change((x) => { x[doc].sections.splice(i, 1); })}><Trash2 size={14} /></button>
                    </div>
                    <textarea rows={Math.min(14, Math.max(4, s.body.join('\n\n').length / 90))} value={s.body.join('\n\n')} aria-label={`Section ${i + 1} text`}
                      onChange={(e) => change((x) => { x[doc].sections[i].body = e.target.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean); })} />
                  </li>
                ))}
              </ol>
              <button type="button" className="btn ghost sm" onClick={() => change((x) => {
                const n = x[doc].sections.length + 1; const title = `${n}. New section`;
                x[doc].sections.push({ id: `${slug(title)}-${Date.now().toString(36)}`, title, body: ['The words of this section.'] });
              })}><Plus size={13} /> Add a section</button>
            </div>
          ) : d && (
            <article className="gde-preview" aria-label="Preview">
              <span className="gde-pre-lbl">Preview, filled with today&rsquo;s settings · version of {day(draft.version)}</span>
              <h3>{fill(d.title)}</h3>
              <p className="gde-lede">{fill(d.lede)}</p>
              {d.sections.map((s) => (
                <section key={s.id}><h4>{fill(s.title)}</h4>{s.body.map((p, i) => <p key={i}>{fill(p)}</p>)}</section>
              ))}
            </article>
          )}

          <footer className="gde-foot">
            <label className="gde-note">What changed<input value={draft.note} maxLength={300} placeholder="For your own record, e.g. refunds clause rewritten" onChange={(e) => { setDraft({ ...draft, note: e.target.value }); setDirty(true); }} /></label>
            {msg && <span className={`gde-msg${msg.bad ? ' bad' : ''}`} role="status">{msg.text}</span>}
            {confirm === 'publish' ? (
              <span className="gde-confirm">Publish the version of <b>{day(draft.version)}</b>? It can never be edited afterwards; every owner who has not agreed is asked to.
                <button type="button" className="btn sm" disabled={busy} onClick={() => void publish()}><Send size={13} /> Publish</button>
                <button type="button" className="btn ghost sm" onClick={() => setConfirm(null)}>Cancel</button></span>
            ) : confirm === 'discard' ? (
              <span className="gde-confirm">Discard this draft and its changes?
                <button type="button" className="btn sm" disabled={busy} onClick={() => void discard()}>Discard</button>
                <button type="button" className="btn ghost sm" onClick={() => setConfirm(null)}>Keep it</button></span>
            ) : (
              <span className="gde-actions">
                <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setConfirm('discard')}>Discard</button>
                <button type="button" className="btn ghost sm" disabled={busy || !dirty} onClick={() => void save()}><Save size={13} /> {busy ? 'Saving…' : 'Save draft'}</button>
                <button type="button" className="btn sm" disabled={busy} onClick={() => setConfirm('publish')}><Send size={13} /> Publish…</button>
              </span>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
