import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, ExternalLink, FileSignature, Inbox, Layers, MessageSquareQuote, PenLine, RotateCcw, Save, Store, Phone } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import InfoDot from '../components/InfoDot';

/**
 * Website (0241, the owner's choice 2026-11-08: "gather + edit words"). The public site — corefitness-site — reads
 * its prices, gyms, testimonials and documents from the database already; this page gathers where each is set, with
 * live counts, and edits the site's own words: the top of the page, the coaches band and an optional notice line.
 * A word left empty is the site's built-in word (written below as the placeholder), so nothing changes until saved.
 */
const SITE_URL = 'https://corefitness-site.vercel.app';

type Key = 'notice' | 'hero_eyebrow' | 'hero_title_1' | 'hero_title_2' | 'hero_lede' | 'coaches_title' | 'coaches_lede';
const FIELDS: { key: Key; label: string; builtIn: string; max: number; long?: boolean; tip?: string }[] = [
  { key: 'notice', label: 'Notice along the top', builtIn: '', max: 160, tip: 'An amber line above everything — a holiday, an outage, news. Empty shows no line.' },
  { key: 'hero_eyebrow', label: 'Small line above the headline', builtIn: 'Gym software, made in Occidental Mindoro', max: 60 },
  { key: 'hero_title_1', label: 'Headline, first line', builtIn: 'Run your gym,', max: 40 },
  { key: 'hero_title_2', label: 'Headline, second line (in colour)', builtIn: 'give your members an app.', max: 50 },
  { key: 'hero_lede', label: 'The sentence under the headline', max: 320, long: true,
    builtIn: 'Memberships, payments in cash or in the app, QR check-in, personal training, coaches and an AI assistant — with a phone app your members actually install. Built for a real gym in Mamburao, and open to yours.' },
  { key: 'coaches_title', label: 'Coaches band, title', builtIn: 'Coaches carry the app too.', max: 60 },
  { key: 'coaches_lede', label: 'Coaches band, sentence', max: 260, long: true,
    builtIn: 'Trainers sign in to the same phone app. They run their own classes, decide their own bookings, and see only the members they train — and only what those members choose to share.' },
];

interface Saved { value: string; updated_at: string; updated_by: string | null }

export default function Website() {
  const [saved, setSaved] = useState<Record<string, Saved> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; text: string; bad?: boolean } | null>(null);
  const [counts, setCounts] = useState<{ gyms: number | null; quotes: number | null; plans: number | null }>({ gyms: null, quotes: null, plans: null });

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('site_texts_detail');
    if (error) { setMissing(true); setSaved({}); return; }
    const m: Record<string, Saved> = {};
    for (const r of (data ?? []) as ({ key: string } & Saved)[]) m[r.key] = r;
    setSaved(m);
    setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, m[f.key]?.value ?? ''])));
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
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
    if (error) { setMsg({ key, text: /save_site_text|schema cache|does not exist/i.test(error.message) ? 'Needs migration 0241 — paste it first.' : error.message, bad: true }); return; }
    setMsg({ key, text: value.trim() ? 'Saved — the website shows it on its next visit.' : 'Back to the built-in words.' });
    await load();
  };

  const where = [
    { icon: Layers, label: 'Prices', what: counts.plans === null ? 'The plans and prices on the site' : `${counts.plans} plans on the price list`, to: '/plans' },
    { icon: Building2, label: 'Gyms listed', what: counts.gyms === null ? 'Which gyms the site lists' : `${counts.gyms} gyms listed — hide or show one on its page`, to: '/gyms' },
    { icon: MessageSquareQuote, label: 'Testimonials', what: counts.quotes === null ? 'Owners’ words you approved' : `${counts.quotes} shown — approve or hide in Feedback`, to: '/feedback' },
    { icon: FileSignature, label: 'Gym documents', what: 'Terms for gyms, the Data Processing Agreement, the Privacy Policy — publish a version', to: '/settings' },
    { icon: Phone, label: 'Business contact', what: 'The name, address, email and phone the site and the documents quote', to: '/settings' },
    { icon: Inbox, label: 'Applications', what: 'What the site’s Register your gym form sends', to: '/applications' },
  ];

  return (
    <div className="page" data-page="website">
      {missing && <p className="card notice">Editing the words needs migration 0241. Until it is pasted the site shows its built-in words, and the list on the right still works.</p>}
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' }}>
        <section className="card" data-site-words>
          <div className="card-head">
            <h2 className="section-title row" style={{ gap: 8 }}><PenLine size={14} /> <span className="grow">The website&rsquo;s words</span>
              <a className="btn ghost sm" href={SITE_URL} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open the site</a>
            </h2>
            <p className="meta" style={{ margin: 0 }}>Empty means the site&rsquo;s own words (shown faintly in each box). Gym names, prices and contact details are never typed here — they come from the system.</p>
          </div>
          {saved === null ? <p className="empty">Reading…</p> : FIELDS.map((f) => {
            const cur = draft[f.key] ?? '';
            const was = saved[f.key]?.value ?? '';
            const changed = cur.trim() !== was;
            return (
              <div key={f.key} className="site-field" data-site-field={f.key}>
                <label>
                  <span className="site-field__label">{f.label} {f.tip && <InfoDot tip={f.tip} />}
                    <em className="muted">{saved[f.key] ? `changed ${new Date(saved[f.key].updated_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}${saved[f.key].updated_by ? ` by ${saved[f.key].updated_by}` : ''}` : 'built-in'} · {cur.length}/{f.max}</em>
                  </span>
                  {f.long
                    ? <textarea rows={3} value={cur} maxLength={f.max} placeholder={f.builtIn} disabled={missing} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                    : <input value={cur} maxLength={f.max} placeholder={f.builtIn || 'No notice'} disabled={missing} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />}
                </label>
                <div className="row" style={{ gap: 8 }}>
                  {msg?.key === f.key && <span className={msg.bad ? 'err' : 'meta'} style={{ margin: 0 }}>{msg.text}</span>}
                  <span className="grow" />
                  {saved[f.key] && <button type="button" className="btn ghost sm" disabled={busy === f.key} onClick={() => void save(f.key, '')}><RotateCcw size={13} /> Built-in words</button>}
                  <button type="button" className="btn sm" disabled={!changed || busy === f.key || missing} onClick={() => void save(f.key, cur)}><Save size={13} /> {busy === f.key ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            );
          })}
        </section>

        <section className="card" data-site-where>
          <h2 className="section-title"><Store size={14} /> Everything else the site shows <InfoDot tip="Read from the database each time someone opens the site — change it on the page it links to." /></h2>
          {where.map((w) => (
            <Link key={w.label} to={w.to} className="todo">
              <span className="kpi-icon" style={{ width: 32, height: 32 }}><w.icon size={15} /></span>
              <span className="todo-text"><b>{w.label}</b><span className="meta" style={{ display: 'block' }}>{w.what}</span></span>
              <ArrowUpRight size={15} className="muted" />
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
