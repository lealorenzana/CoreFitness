import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bug, Lightbulb, MessageSquareQuote, Star } from 'lucide-react';
import Card from '../components/ui/Card';
import { showToast } from '../utils/toast';
import { getGymContext } from '../lib/gymContext';
import {
  myIdeas, myRating, myTestimonials, rateCoreFitness, reportBug, sendIdea, sendTestimonial, withdrawTestimonial,
  type Idea, type MyRating, type Testimonial,
} from '../lib/api/feedback';

const MUTED = 'var(--color-text-muted)';
const FIELD = { background: 'var(--color-surface-high)', border: '1px solid var(--color-border)', color: '#fff' };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const IDEA_STATUS: Record<Idea['status'], string> = { open: 'Sent', planned: 'Planned', done: 'Done', not_now: 'Not now' };
const QUOTE_STATUS: Record<Testimonial['status'], string> = {
  pending: 'Waiting for Core Fitness', approved: 'On the website', declined: 'Not used', withdrawn: 'Taken down',
};

/**
 * Feedback to Core Fitness (0188): rate it, send ideas (and see what became of
 * them), report a problem with a screenshot, and — the owner only — offer a
 * testimonial for the website, which shows only once Core Fitness approves it
 * and can be taken down here at any time.
 */
export default function Feedback() {
  const [owner, setOwner] = useState(false);
  const [gymId, setGymId] = useState<string | null>(null);
  const [rating, setRating] = useState<MyRating | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [quotes, setQuotes] = useState<Testimonial[]>([]);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const ctx = await getGymContext();
    setOwner(ctx?.role === 'admin'); setGymId(ctx?.gymId ?? null);
    try {
      const isOwner = ctx?.role === 'admin';
      const [r, i, q] = await Promise.all([isOwner ? myRating() : null, myIdeas(), isOwner ? myTestimonials() : []]);
      setRating(r); setIdeas(i); setQuotes(q); setFailed(null);
    } catch (e) {
      setFailed(/schema cache|Could not find the function/i.test(e instanceof Error ? e.message : '')
        ? 'Feedback needs migration 0188, which is not live on this database yet.'
        : e instanceof Error ? e.message : 'Could not load feedback');
    }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Feedback to Core Fitness</h1>
        <p className="text-xs mt-1" style={{ color: MUTED }}>Tell the people who make this app what works, what does not, and what you need next.</p>
      </div>
      {failed && <Card className="!p-4"><p className="text-xs text-white">{failed}</p></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {owner && <RateCard rating={rating} onSaved={load} />}
        <IdeasCard ideas={ideas} onSaved={load} />
        <BugCard gymId={gymId} />
        {owner && <QuoteCard quotes={quotes} onSaved={load} />}
      </div>
    </div>
  );
}

function RateCard({ rating, onSaved }: { rating: MyRating | null; onSaved: () => Promise<void> }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await rateCoreFitness(stars, comment.trim()); showToast('Thank you — rating sent', 'success'); setStars(0); setComment(''); await onSaved(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not send', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Card className="!p-5" data-feedback="rate">
      <p className="text-sm font-semibold text-white flex items-center gap-2"><Star size={15} /> Rate Core Fitness</p>
      <p className="text-xs mt-1" style={{ color: MUTED }}>
        {rating ? `Your current rating: ${rating.stars} of 5, on ${day(rating.created_at)}. Rate again any time — the newest one counts.` : 'Any time, as often as you like. The newest rating counts.'}
      </p>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setStars(n)}>
            <Star size={26} fill={n <= stars ? 'var(--color-secondary)' : 'none'} style={{ color: n <= stars ? 'var(--color-secondary)' : MUTED }} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} aria-label="Comment"
        placeholder="What made you give that? (optional)" className="mt-3 w-full rounded-lg px-3 py-2 text-sm" style={FIELD} />
      <button type="button" disabled={busy || stars === 0} onClick={() => void save()}
        className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--color-secondary)', color: '#111' }}>
        {busy ? 'Sending…' : 'Send rating'}
      </button>
    </Card>
  );
}

function IdeasCard({ ideas, onSaved }: { ideas: Idea[]; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await sendIdea(title.trim(), body.trim()); showToast('Idea sent', 'success'); setTitle(''); setBody(''); await onSaved(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not send', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Card className="!p-5" data-feedback="ideas">
      <p className="text-sm font-semibold text-white flex items-center gap-2"><Lightbulb size={15} /> Ask for a feature</p>
      <p className="text-xs mt-1" style={{ color: MUTED }}>Core Fitness marks each one Planned, Done or Not now, and tells whoever asked.</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What should it do?" aria-label="Idea"
        className="mt-3 w-full rounded-lg px-3 py-2 text-sm" style={FIELD} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={2} aria-label="More detail"
        placeholder="Why it would help (optional)" className="mt-2 w-full rounded-lg px-3 py-2 text-sm" style={FIELD} />
      <button type="button" disabled={busy || title.trim().length < 3} onClick={() => void save()}
        className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--color-secondary)', color: '#111' }}>
        {busy ? 'Sending…' : 'Send idea'}
      </button>
      {ideas.length > 0 && (
        <ul className="mt-4 space-y-2">
          {ideas.slice(0, 8).map((i) => (
            <li key={i.id} className="rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-high)' }} data-idea={i.status}>
              <div className="flex items-center gap-2">
                <span className="text-sm text-white flex-1 min-w-0 truncate">{i.title}</span>
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                  style={{ background: i.status === 'open' ? 'var(--color-surface)' : 'color-mix(in srgb, var(--color-primary) 25%, transparent)', color: '#fff' }}>
                  {IDEA_STATUS[i.status]}
                </span>
              </div>
              {i.platform_note && <p className="text-xs mt-1" style={{ color: MUTED }}>Core Fitness: {i.platform_note}</p>}
              <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>{i.author_name ?? 'Someone'} · {day(i.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BugCard({ gymId }: { gymId: string | null }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [shot, setShot] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  /** Bumped after a send, so the native file field empties too. */
  const [fileKey, setFileKey] = useState(0);
  const save = async () => {
    if (!gymId) return;
    if (shot && shot.size > 5 * 1024 * 1024) { showToast('That screenshot is over 5 MB', 'error'); return; }
    setBusy(true);
    try { await reportBug(gymId, title.trim(), body.trim(), shot); setTitle(''); setBody(''); setShot(null); setFileKey((k) => k + 1); setSent(true); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not send', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Card className="!p-5" data-feedback="bug">
      <p className="text-sm font-semibold text-white flex items-center gap-2"><Bug size={15} /> Report a problem</p>
      <p className="text-xs mt-1" style={{ color: MUTED }}>It becomes a support ticket — Core Fitness answers in <Link to="/support" className="underline">Support</Link>. A screenshot helps; only your gym and Core Fitness can open it.</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What went wrong?" aria-label="Problem"
        className="mt-3 w-full rounded-lg px-3 py-2 text-sm" style={FIELD} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={3} aria-label="What happened"
        placeholder="What you did, what you expected, what happened instead" className="mt-2 w-full rounded-lg px-3 py-2 text-sm" style={FIELD} />
      <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Screenshot" className="mt-2 text-xs max-w-full"
        style={{ color: 'var(--color-text-secondary)' }} onChange={(e) => setShot(e.target.files?.[0] ?? null)} />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={busy || !title.trim() || !body.trim()} onClick={() => void save()}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--color-secondary)', color: '#111' }}>
          {busy ? 'Sending…' : 'Send report'}
        </button>
        {sent && <span className="text-xs" style={{ color: MUTED }}>Sent. Follow it in <Link to="/support" className="underline">Support</Link>.</span>}
      </div>
    </Card>
  );
}

function QuoteCard({ quotes, onSaved }: { quotes: Testimonial[]; onSaved: () => Promise<void> }) {
  const [quote, setQuote] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const live = quotes.find((q) => q.status === 'approved' || q.status === 'pending') ?? null;
  const save = async () => {
    setBusy(true);
    try { await sendTestimonial(quote.trim(), name.trim(), role.trim()); showToast('Sent to Core Fitness', 'success'); setQuote(''); setAgree(false); await onSaved(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not send', 'error'); }
    finally { setBusy(false); }
  };
  const takeDown = async (id: string) => {
    setBusy(true);
    try { await withdrawTestimonial(id); showToast('Taken down', 'success'); await onSaved(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not take it down', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Card className="!p-5" data-feedback="testimonial">
      <p className="text-sm font-semibold text-white flex items-center gap-2"><MessageSquareQuote size={15} /> A few words for the website</p>
      <p className="text-xs mt-1" style={{ color: MUTED }}>Optional. Core Fitness shows it on its website only after approving it, with the name you give — and you can take it down here at any time.</p>
      {live && (
        <div className="mt-3 rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-high)' }} data-quote={live.status}>
          <p className="text-sm text-white">“{live.quote}”</p>
          <p className="text-xs mt-1" style={{ color: MUTED }}>— {live.shown_name}{live.shown_role ? `, ${live.shown_role}` : ''} · {QUOTE_STATUS[live.status]}</p>
          <button type="button" disabled={busy} onClick={() => void takeDown(live.id)} className="mt-1 text-xs underline" style={{ color: MUTED }}>Take it down</button>
        </div>
      )}
      <textarea value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={400} rows={3} aria-label="Your words"
        placeholder="What has Core Fitness changed at your gym?" className="mt-3 w-full rounded-lg px-3 py-2 text-sm" style={FIELD} />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Name to show" aria-label="Name to show" className="rounded-lg px-3 py-2 text-sm" style={FIELD} />
        <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} placeholder="e.g. Owner, Iron Den (optional)" aria-label="Role to show" className="rounded-lg px-3 py-2 text-sm" style={FIELD} />
      </div>
      <label className="mt-2 flex items-start gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        Core Fitness may show these words with this name on its website.
      </label>
      <button type="button" disabled={busy || !agree || quote.trim().length < 20 || name.trim().length < 2} onClick={() => void save()}
        className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--color-secondary)', color: '#111' }}>
        {live ? 'Send instead' : 'Send'}
      </button>
    </Card>
  );
}
