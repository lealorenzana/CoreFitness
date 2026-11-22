import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Lightbulb, MessageSquareQuote, Star } from 'lucide-react';
import { explain, feedback, setIdea, setTestimonial, type FeedbackData, type IdeaRow } from '../lib/platform';
import Tiles from '../components/Tiles';
import './talk.css';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const IDEA: Record<IdeaRow['status'], string> = { open: 'New', planned: 'Planned', done: 'Done', not_now: 'Not now' };

/**
 * What gyms tell Core Fitness (0188): their ratings (the average counts each
 * gym's newest), their ideas — answered Planned / Done / Not now with a note
 * the asker is told — and testimonials, which reach the website only when
 * approved here. Bug reports are support tickets, marked in Support.
 */
export default function Feedback() {
  const [data, setData] = useState<FeedbackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // A missing list reads as empty, never a crashed screen.
      const d = await feedback();
      setData({ ...d, ratings: d?.ratings ?? [], ideas: d?.ideas ?? [], testimonials: d?.testimonials ?? [], average: d?.average ?? null });
      setError(null);
    } catch (e) { setError(explain(e, '0188')); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work'); } finally { setBusy(false); }
  };

  if (!data) return error ? <p className="err">{error}</p> : <p className="empty">Loading…</p>;
  const current = data.ratings.filter((r) => r.current);
  const openIdeas = data.ideas.filter((i) => i.status === 'open');
  const waitingQuotes = data.testimonials.filter((t) => t.status === 'pending');
  const byStars = [5, 4, 3, 2, 1].map((s) => ({ s, n: current.filter((r) => r.stars === s).length }));
  const mostStars = Math.max(1, ...byStars.map((b) => b.n));

  return (
    <>
      {error && <p className="err">{error}</p>}
      <Tiles items={[
        { icon: Star, value: data.average != null ? `${Number(data.average).toFixed(1)} / 5` : '—', label: `Average · ${current.length} gym${current.length === 1 ? '' : 's'} rated`,
          tip: 'Each gym\'s newest rating, averaged. Older ratings stay below as history.' },
        { icon: Lightbulb, value: String(openIdeas.length), label: 'Ideas to answer', act: openIdeas.length > 0 },
        { icon: MessageSquareQuote, value: String(waitingQuotes.length), label: 'Testimonials to approve', act: waitingQuotes.length > 0 },
      ]} />

      {/* 2026-11-22: three columns, one per kind of feedback, each the full height and scrolling its own list. */}
      <div className="fbx" data-va-keep>
        <section className="card fbx-col" data-platform-ideas>
          <h2 className="section-title"><Lightbulb size={14} /> Ideas from gyms <span className="fbx-n">{data.ideas.length}</span></h2>
          <p className="fbx-sub">Answer Planned, Done or Not now; the gym that asked is told, with your note.</p>
          {data.ideas.length === 0 && <p className="fbx-none">No ideas yet. Gyms send them from Help in their admin app.</p>}
          <ul className="fbx-list">
            {data.ideas.map((i) => (
              <li key={i.id} className="fbx-item" data-idea={i.id}>
                <span className="fbx-top"><b>{i.title}</b><span className={`fbx-state ${i.status}`}>{IDEA[i.status]}</span></span>
                {i.body && <span className="fbx-body">{i.body}</span>}
                <span className="fbx-meta">{i.gym_name} · {when(i.created_at)}{i.platform_note ? ` · you said: ${i.platform_note}` : ''}</span>
                <div className="fbx-actions">
                  <input value={notes[i.id] ?? ''} maxLength={1000} placeholder="A note they read (optional)" aria-label={`Note for ${i.title}`}
                    onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} />
                  {(['planned', 'done', 'not_now'] as const).map((s) => (
                    <button key={s} type="button" className={`btn sm${s === 'planned' ? '' : ' ghost'}`} disabled={busy || i.status === s}
                      onClick={() => void run(() => setIdea(i.id, s, notes[i.id] ?? i.platform_note ?? null))}>{IDEA[s]}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card fbx-col" data-platform-testimonials>
          <h2 className="section-title"><MessageSquareQuote size={14} /> Testimonials <span className="fbx-n">{data.testimonials.length}</span></h2>
          <p className="fbx-sub">A quote reaches the website only once you put it there.</p>
          {data.testimonials.length === 0 && <p className="fbx-none">None offered yet.</p>}
          <ul className="fbx-list">
            {data.testimonials.map((t) => (
              <li key={t.id} className="fbx-item">
                <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
                <span className="fbx-meta">{t.shown_name}{t.shown_role ? `, ${t.shown_role}` : ''} · {t.gym_name} · <span className={`fbx-q ${t.status}`}>{t.status === 'approved' ? 'on the website' : t.status === 'declined' ? 'not used' : 'waiting for you'}</span></span>
                <div className="fbx-actions">
                  {t.status !== 'approved' && <button type="button" className="btn sm" disabled={busy} onClick={() => void run(() => setTestimonial(t.id, true))}>Put it on the website</button>}
                  {t.status !== 'declined' && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void run(() => setTestimonial(t.id, false))}>{t.status === 'approved' ? 'Take it off' : 'Do not use'}</button>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card fbx-col">
          <h2 className="section-title"><Star size={14} /> Ratings <span className="fbx-n">{current.length}</span></h2>
          <div className="fbx-dist" aria-label="Each gym's newest rating, by stars">
            {byStars.map((b) => (
              <div key={b.s}><span>{b.s} ★</span><span className="fbx-bar"><i style={{ width: `${(b.n / mostStars) * 100}%` }} /></span><b>{b.n}</b></div>
            ))}
          </div>
          {data.ratings.length === 0 && <p className="fbx-none">No gym has rated Core Fitness yet.</p>}
          <ul className="fbx-list">
            {data.ratings.slice(0, 30).map((r, n) => (
              <li key={n} className={`fbx-item${r.current ? '' : ' old'}`}>
                <span className="fbx-top"><span className="fbx-stars" aria-label={`${r.stars} of 5 stars`}>{'★'.repeat(r.stars)}<em>{'★'.repeat(5 - r.stars)}</em></span>
                  {r.current && r.stars >= 4 && <CheckCircle2 size={14} className="fbx-good" />}</span>
                {r.comment && <span className="fbx-body">{r.comment}</span>}
                <span className="fbx-meta">{r.gym_name}{r.current ? '' : ' · earlier'} · {when(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
