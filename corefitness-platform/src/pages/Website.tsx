import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, Building2, Eye, EyeOff, ExternalLink, FileSignature, Inbox, Layers, LayoutList, MessageSquareQuote, PauseCircle, Phone,
  PlayCircle, RotateCcw, Save, Store,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import InfoDot from '../components/InfoDot';
import './website.css';

/**
 * Website (0241, redesigned 2026-11-22 with 0261). The public site, corefitness-site, reads its prices, gyms,
 * testimonials and documents from the database; this page edits the site's own words, which sections show, and
 * whether the Register your gym form is open. On the right, the page top to bottom: each part with its heading and
 * an eye to hide or show it, so what the visitor gets is visible at a glance. A word left empty is the site's
 * built-in word (shown as the placeholder), and a section with no setting shows; nothing changes until saved.
 */
const SITE_URL = 'https://corefitness-site.vercel.app';

type Key = 'notice' | 'hero_eyebrow' | 'hero_title_1' | 'hero_title_2' | 'hero_lede' | 'coaches_title' | 'coaches_lede'
  | 'roles_title' | 'how_title' | 'faq_title' | 'apply_title' | 'hidden_sections' | 'apply_closed';
type Field = { key: Key; label: string; builtIn: string; max: number; long?: boolean; tip?: string; since?: '0261' };
const F: Record<string, Field> = {
  notice: { key: 'notice', label: 'Notice along the top', builtIn: '', max: 160, tip: 'An amber line above everything: a holiday, an outage, news. Empty shows no line.' },
  hero_eyebrow: { key: 'hero_eyebrow', label: 'Small line above the headline', builtIn: 'Gym software, made in Occidental Mindoro', max: 60 },
  hero_title_1: { key: 'hero_title_1', label: 'Headline, first line', builtIn: 'Run your gym,', max: 40 },
  hero_title_2: { key: 'hero_title_2', label: 'Headline, second line (in colour)', builtIn: 'give your members an app.', max: 50 },
  hero_lede: { key: 'hero_lede', label: 'The sentence under the headline', max: 320, long: true,
    builtIn: 'Memberships, payments in cash or in the app, QR check-in, personal training, coaches and an AI assistant, with a phone app your members actually install. Built for a real gym in Mamburao, and open to yours.' },
  roles_title: { key: 'roles_title', label: 'Who uses it, title', builtIn: 'Four people use it every day.', max: 60, since: '0261' },
  coaches_title: { key: 'coaches_title', label: 'Coaches band, title', builtIn: 'Coaches carry the app too.', max: 60 },
  coaches_lede: { key: 'coaches_lede', label: 'Coaches band, sentence', max: 260, long: true,
    builtIn: 'Trainers sign in to the same phone app. They run their own classes, decide their own bookings, and see only the members they train, and only what those members choose to share.' },
  how_title: { key: 'how_title', label: 'How it works, title', builtIn: 'From this page to your first member.', max: 60, since: '0261' },
  faq_title: { key: 'faq_title', label: 'Questions, title', builtIn: 'Questions owners ask first.', max: 60, since: '0261' },
  apply_title: { key: 'apply_title', label: 'Register form, title', builtIn: 'Tell us about your gym', max: 60, since: '0261' },
};

/** The page in order. `id` is the section's id on the site; those with one can be hidden (0261). */
const PARTS: { id: string | null; label: string; tab: Tab; title?: Key; fixed?: string; note?: string }[] = [
  { id: null, label: 'Top of the page', tab: 'top', title: 'hero_title_1' },
  { id: 'ad', label: 'Watch the tour (the 34 second ad)', tab: 'sections', fixed: 'A button in the top of the page that plays the ad', note: 'Hide it to take the button and the video off the site.' },
  { id: 'roles', label: 'Who uses it', tab: 'sections', title: 'roles_title' },
  { id: 'floor', label: 'Coaches band', tab: 'sections', title: 'coaches_title' },
  { id: 'how', label: 'How it works', tab: 'sections', title: 'how_title' },
  { id: 'pricing', label: 'Pricing', tab: 'elsewhere', fixed: 'From the price list', note: 'Its heading follows the plans.' },
  { id: 'faq', label: 'Questions', tab: 'sections', title: 'faq_title' },
  { id: 'gyms', label: 'Gyms on Core Fitness', tab: 'elsewhere', fixed: 'Counted from the gyms listed' },
  { id: 'voices', label: 'Testimonials', tab: 'elsewhere', fixed: 'Shown when you approve one' },
];

type Tab = 'top' | 'sections' | 'apply' | 'elsewhere';
interface Saved { value: string; updated_at: string; updated_by: string | null }

export default function Website() {
  const [saved, setSaved] = useState<Record<string, Saved> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);
  /** 0261 pasted? Until it is, the new keys cannot be saved, and the page says so beside them. */
  const [has0261, setHas0261] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; text: string; bad?: boolean } | null>(null);
  const [counts, setCounts] = useState<{ gyms: number | null; quotes: number | null; plans: number | null }>({ gyms: null, quotes: null, plans: null });
  const [tab, setTab] = useState<Tab>('top');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('site_texts_detail');
    if (error) { setMissing(true); setSaved({}); return; }
    const m: Record<string, Saved> = {};
    for (const r of (data ?? []) as ({ key: string } & Saved)[]) m[r.key] = r;
    setSaved(m);
    setDraft(Object.fromEntries([...Object.keys(F), 'apply_closed'].map((k) => [k, m[k]?.value ?? ''])));
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      const { error: no61 } = await supabase.rpc('migration_0261_applied');
      setHas0261(!no61);
      // What the site shows today, read the way the site reads it (the anon functions).
      const [g, q, p] = await Promise.allSettled([supabase.rpc('list_gyms'), supabase.rpc('public_testimonials'), supabase.rpc('platform_price_list')]);
      const len = (r: PromiseSettledResult<{ data: unknown }>) => (r.status === 'fulfilled' && Array.isArray(r.value.data) ? r.value.data.length : null);
      setCounts({ gyms: len(g), quotes: len(q), plans: len(p) });
    })();
  }, [load]);

  const save = async (key: Key, value: string) => {
    setBusy(key); setMsg(null);
    const { error } = await supabase.rpc('save_site_text', { p_key: key, p_value: value });
    setBusy(null);
    if (error) {
      const needs = /has no text called/i.test(error.message) ? 'Needs migration 0261, paste it first.'
        : /save_site_text|schema cache|does not exist/i.test(error.message) ? 'Needs migration 0241, paste it first.' : error.message;
      setMsg({ key, text: needs, bad: true });
      return false;
    }
    setMsg({ key, text: value.trim() ? 'Saved, the website shows it on its next visit.' : 'Back to the built-in words.' });
    await load();
    return true;
  };

  const hiddenSet = new Set((saved?.hidden_sections?.value ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const toggle = async (id: string) => {
    const next = new Set(hiddenSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    await save('hidden_sections', [...next].join(','));
  };
  const closed = saved?.apply_closed?.value ?? '';
  const changedWords = Object.keys(F).filter((k) => saved?.[k]).length;
  const textOf = (k?: Key) => (k ? (saved?.[k]?.value || F[k].builtIn) : '');
  const needs61 = has0261 === false;

  const field = (f: Field) => {
    const cur = draft[f.key] ?? '';
    const was = saved?.[f.key]?.value ?? '';
    const changed = cur.trim() !== was;
    const locked = missing || (f.since === '0261' && needs61);
    return (
      <div key={f.key} className="ws-field" data-site-field={f.key}>
        <div className="ws-field-head">
          <label htmlFor={`ws-${f.key}`}>{f.label}{f.tip && <InfoDot tip={f.tip} />}</label>
          <em>{saved?.[f.key] ? `changed ${new Date(saved[f.key].updated_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}${saved[f.key].updated_by ? ` by ${saved[f.key].updated_by}` : ''}` : 'built-in'} · {cur.length}/{f.max}</em>
        </div>
        {f.long
          ? <textarea id={`ws-${f.key}`} rows={3} value={cur} maxLength={f.max} placeholder={f.builtIn} disabled={locked} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
          : <input id={`ws-${f.key}`} value={cur} maxLength={f.max} placeholder={f.builtIn || 'No notice'} disabled={locked} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />}
        {(changed || saved?.[f.key] || msg?.key === f.key || locked) && (
          <div className="ws-field-actions">
            {locked && f.since === '0261' ? <span className="ws-msg bad">Needs migration 0261 to edit.</span>
              : msg?.key === f.key && <span className={`ws-msg${msg.bad ? ' bad' : ''}`}>{msg.text}</span>}
            <span className="spacer" />
            {saved?.[f.key] && <button type="button" className="btn ghost sm" disabled={busy === f.key} onClick={() => void save(f.key, '')}><RotateCcw size={13} /> Built-in words</button>}
            <button type="button" className="btn sm" disabled={!changed || busy === f.key || locked} onClick={() => void save(f.key, cur)}><Save size={13} /> {busy === f.key ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </div>
    );
  };

  const where = [
    { icon: Layers, label: 'Prices', what: counts.plans === null ? 'The plans and prices on the site' : `${counts.plans} plans on the price list`, to: '/plans' },
    { icon: Building2, label: 'Gyms listed', what: counts.gyms === null ? 'Which gyms the site lists' : `${counts.gyms} gyms listed, hide or show one on its page`, to: '/gyms' },
    { icon: MessageSquareQuote, label: 'Testimonials', what: counts.quotes === null ? 'Owners’ words you approved' : `${counts.quotes} shown, approve or hide in Feedback`, to: '/feedback' },
    { icon: FileSignature, label: 'Gym documents', what: 'Terms for gyms, the Data Processing Agreement, the Privacy Policy, publish a version', to: '/settings?part=docs' },
    { icon: Phone, label: 'Business contact', what: 'The name, address, email and phone the site and the documents quote', to: '/settings?part=business' },
    { icon: Inbox, label: 'Applications', what: 'What the site’s Register your gym form sends', to: '/applications' },
  ];

  const TABS: [Tab, string][] = [['top', 'Top of the page'], ['sections', 'Sections'], ['apply', 'Applications'], ['elsewhere', 'Set elsewhere']];

  return (
    <>
      {missing && <p className="card notice">Editing the website needs migration 0241. Until it is pasted the site shows its built-in words; Set elsewhere still works.</p>}
      {needs61 && !missing && <p className="ws-banner">Hiding sections, pausing applications and the four new headings need migration 0261. Paste it in the Supabase SQL editor; until then the site shows every section and keeps the form open.</p>}

      <div className="ws-strip">
        <div><b>{saved ? changedWords : '…'}</b><span>words changed from the built-in ones</span></div>
        <div><b>{saved ? hiddenSet.size : '…'}</b><span>section{hiddenSet.size === 1 ? '' : 's'} hidden</span></div>
        <div className={closed ? 'warn' : ''}><b>{saved ? (closed ? 'Paused' : 'Open') : '…'}</b><span>new applications</span></div>
        <div><b>{counts.gyms ?? '—'}</b><span>gyms listed</span></div>
        <div><b>{counts.plans ?? '—'}</b><span>plans on the price list</span></div>
      </div>

      <div className="ws" data-va-keep>
        <section className="card ws-edit" data-site-words>
          <header className="ws-head">
            <div className="ws-tabs" role="tablist" aria-label="Edit">
              {TABS.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>
            <a className="btn ghost sm" href={SITE_URL} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open the site</a>
          </header>

          <div className="ws-body">
            {saved === null ? <p className="ws-none">Reading…</p> : tab === 'top' ? (
              <>
                <p className="ws-sub">What a visitor reads first. Empty means the site&rsquo;s own words, shown faintly in each box. Gym names, prices and contact details are never typed here.</p>
                {[F.notice, F.hero_eyebrow, F.hero_title_1, F.hero_title_2, F.hero_lede].map(field)}
              </>
            ) : tab === 'sections' ? (
              <>
                <p className="ws-sub">Each section&rsquo;s heading, and whether it shows. A hidden section is gone from the page and from the menu along the top.</p>
                {PARTS.filter((p) => p.id).map((p) => (
                  <div key={p.id} className={`ws-sec${hiddenSet.has(p.id!) ? ' off' : ''}`} data-site-section={p.id}>
                    <div className="ws-sec-head">
                      <b>{p.label}</b>
                      <button type="button" className={`ws-eye${hiddenSet.has(p.id!) ? ' off' : ''}`} disabled={needs61 || busy === 'hidden_sections'}
                        aria-pressed={!hiddenSet.has(p.id!)} onClick={() => void toggle(p.id!)}>
                        {hiddenSet.has(p.id!) ? <><EyeOff size={14} /> Hidden</> : <><Eye size={14} /> Showing</>}
                      </button>
                    </div>
                    {p.title ? field(F[p.title]) : <p className="ws-fixed">{p.fixed}. {p.note ?? ''}</p>}
                    {p.id === 'floor' && field(F.coaches_lede)}
                  </div>
                ))}
                {msg?.key === 'hidden_sections' && <p className={`ws-msg${msg.bad ? ' bad' : ''}`}>{msg.text}</p>}
              </>
            ) : tab === 'apply' ? (
              <>
                <p className="ws-sub">The Register your gym form at the bottom of the page. Pause it for a busy week, a holiday or the defense: your message takes its place, and anyone who already applied can still open My application.</p>
                <div className={`ws-switch${closed ? ' paused' : ''}`}>
                  {closed ? <PauseCircle size={20} /> : <PlayCircle size={20} />}
                  <span><b>{closed ? 'Applications are paused' : 'Applications are open'}</b>
                    <em>{closed ? 'Visitors read your message instead of the form.' : 'Anyone can send their gym from the website.'}</em></span>
                  {closed && <button type="button" className="btn sm" disabled={busy === 'apply_closed'} onClick={() => void save('apply_closed', '')}>Open the form again</button>}
                </div>
                <div className="ws-field" data-site-field="apply_closed">
                  <div className="ws-field-head"><label htmlFor="ws-apply_closed">{closed ? 'The message visitors read' : 'Pause with this message'}</label><em>{(draft.apply_closed ?? '').length}/300</em></div>
                  <textarea id="ws-apply_closed" rows={3} maxLength={300} value={draft.apply_closed ?? ''} disabled={missing || needs61}
                    placeholder="We are not taking new gyms this month. Check back in December." onChange={(e) => setDraft((d) => ({ ...d, apply_closed: e.target.value }))} />
                  <div className="ws-field-actions">
                    {needs61 ? <span className="ws-msg bad">Needs migration 0261.</span> : msg?.key === 'apply_closed' && <span className={`ws-msg${msg.bad ? ' bad' : ''}`}>{msg.text}</span>}
                    <span className="spacer" />
                    <button type="button" className="btn sm" disabled={missing || needs61 || !(draft.apply_closed ?? '').trim() || (draft.apply_closed ?? '').trim() === closed || busy === 'apply_closed'}
                      onClick={() => void save('apply_closed', draft.apply_closed ?? '')}>{closed ? <><Save size={13} /> Save the message</> : <><PauseCircle size={13} /> Pause applications</>}</button>
                  </div>
                </div>
                {field(F.apply_title)}
              </>
            ) : (
              <>
                <p className="ws-sub">Read from the database each time someone opens the site. Change them on the page each one links to.</p>
                <ul className="ws-links">
                  {where.map((w) => (
                    <li key={w.label}><Link to={w.to}><w.icon size={16} /><span><b>{w.label}</b><em>{w.what}</em></span><ArrowUpRight size={15} /></Link></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        <aside className="card ws-map" data-site-where>
          <h2 className="section-title"><LayoutList size={14} /> The page, top to bottom <InfoDot tip="What a visitor scrolls through, in order. The eye hides or shows a section; click a part to edit it." /></h2>
          <ol className="ws-parts">
            {(saved?.notice?.value) && <li className="ws-part notice" onClick={() => setTab('top')}><span className="ws-part-lbl">Notice</span><b>{saved.notice.value}</b></li>}
            {PARTS.map((p) => {
              const off = p.id ? hiddenSet.has(p.id) : false;
              return (
                <li key={p.label} className={`ws-part${off ? ' off' : ''}${p.id === null ? ' hero' : ''}`}>
                  <button type="button" className="ws-part-main" onClick={() => setTab(p.tab)}>
                    <span className="ws-part-lbl">{p.label}</span>
                    <b>{p.id === null ? <>{textOf('hero_title_1')} <span>{textOf('hero_title_2')}</span></> : p.title ? textOf(p.title) : p.fixed}</b>
                  </button>
                  {p.id && (
                    <button type="button" className={`ws-eye icon${off ? ' off' : ''}`} disabled={needs61 || busy === 'hidden_sections'} onClick={() => void toggle(p.id!)}
                      aria-label={`${off ? 'Show' : 'Hide'} ${p.label}`} data-tip={off ? 'Hidden, click to show' : 'Showing, click to hide'}>
                      {off ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </li>
              );
            })}
            <li className={`ws-part${closed ? ' paused' : ''}`}>
              <button type="button" className="ws-part-main" onClick={() => setTab('apply')}>
                <span className="ws-part-lbl">Register your gym</span>
                <b>{closed ? 'Paused: your message shows' : textOf('apply_title')}</b>
              </button>
              <span className={`ws-flag${closed ? ' warn' : ''}`}>{closed ? 'Paused' : 'Open'}</span>
            </li>
          </ol>
          <p className="ws-map-foot"><Store size={13} /> Prices, gyms and testimonials fill themselves in from the system.</p>
        </aside>
      </div>
    </>
  );
}
