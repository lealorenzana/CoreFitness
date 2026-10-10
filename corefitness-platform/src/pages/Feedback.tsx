import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Lightbulb, MessageSquareQuote, Star } from 'lucide-react';
import { explain, feedback, setIdea, setTestimonial, type FeedbackData, type IdeaRow } from '../lib/platform';
import Tiles from '../components/Tiles';

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
    try { setData(await feedback()); setError(null); } catch (e) { setError(explain(e, '0188')); }
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

  return (
    <>
      {error && <p className="err">{error}</p>}
      <Tiles items={[
        { icon: Star, value: data.average != null ? `${Number(data.average).toFixed(1)} / 5` : '—', label: `Average · ${current.length} gym${current.length === 1 ? '' : 's'} rated`,
          tip: 'Each gym\'s newest rating, averaged. Older ratings stay below as history.' },
        { icon: Lightbulb, value: String(openIdeas.length), label: 'Ideas to answer', act: openIdeas.length > 0 },
        { icon: MessageSquareQuote, value: String(waitingQuotes.length), label: 'Testimonials to approve', act: waitingQuotes.length > 0 },
      ]} />

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <section className="card" data-platform-ideas>
          <h2 className="section-title"><Lightbulb size={14} /> Ideas from gyms</h2>
          {data.ideas.length === 0 && <p className="empty">No ideas yet.</p>}
          {data.ideas.map((i) => (
            <div key={i.id} className="fb-row" data-idea={i.id}>
              <span className="grow">
                <span className="name">{i.title} <span className={`pill${i.status === 'done' ? ' ok' : i.status === 'open' ? ' warn' : ''}`}>{IDEA[i.status]}</span></span>
                {i.body && <span className="meta" style={{ display: 'block' }}>{i.body}</span>}
                <span className="meta">{i.gym_name} · {when(i.created_at)}{i.platform_note ? ` · you said: ${i.platform_note}` : ''}</span>
              </span>
              <div className="fb-actions">
                <input value={notes[i.id] ?? ''} maxLength={1000} placeholder="A note they read (optional)" aria-label={`Note for ${i.title}`}
                  onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} />
                {(['planned', 'done', 'not_now'] as const).map((s) => (
                  <button key={s} type="button" className={`btn${s === 'planned' ? '' : ' ghost'}`} disabled={busy || i.status === s}
                    onClick={() => void run(() => setIdea(i.id, s, notes[i.id] ?? i.platform_note ?? null))}>{IDEA[s]}</button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <div>
          <section className="card" data-platform-testimonials>
            <h2 className="section-title"><MessageSquareQuote size={14} /> Testimonials</h2>
            {data.testimonials.length === 0 && <p className="empty">None offered yet.</p>}
            {data.testimonials.map((t) => (
              <div key={t.id} className="fb-row">
                <span className="grow">
                  <span className="name" style={{ fontWeight: 500 }}>“{t.quote}”</span>
                  <span className="meta">— {t.shown_name}{t.shown_role ? `, ${t.shown_role}` : ''} · {t.gym_name} · {t.status === 'approved' ? 'on the website' : t.status === 'declined' ? 'not used' : 'waiting for you'}</span>
                </span>
                <div className="fb-actions">
                  {t.status !== 'approved' && <button type="button" className="btn" disabled={busy} onClick={() => void run(() => setTestimonial(t.id, true))}>Put it on the website</button>}
                  {t.status !== 'declined' && <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(() => setTestimonial(t.id, false))}>{t.status === 'approved' ? 'Take it off' : 'Do not use'}</button>}
                </div>
              </div>
            ))}
          </section>
          <section className="card" style={{ marginTop: 16 }}>
            <h2 className="section-title"><Star size={14} /> Ratings</h2>
            {data.ratings.length === 0 && <p className="empty">No gym has rated Core Fitness yet.</p>}
            {data.ratings.slice(0, 30).map((r, n) => (
              <div key={n} className="fb-row" style={{ opacity: r.current ? 1 : 0.6 }}>
                <span className="grow">
                  <span className="name">{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)} <span className="meta">{r.gym_name}{r.current ? '' : ' · earlier'}</span></span>
                  {r.comment && <span className="meta" style={{ display: 'block' }}>{r.comment}</span>}
                  <span className="meta">{when(r.created_at)}</span>
                </span>
                {r.current && r.stars >= 4 && <CheckCircle2 size={14} style={{ color: 'var(--accent)' }} />}
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
