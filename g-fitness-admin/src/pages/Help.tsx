import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Bug, CheckCircle2, Lightbulb, MessageCircle, MessageSquareQuote, Paperclip, Plus, Search, Send, ShieldCheck, Star } from 'lucide-react';
import './attendance/att.css';
import { showToast } from '../utils/toast';
import {
  approveTicketAccess, closeTicket, declineTicketAccess, myTickets, openTicket, replyTicket, thread, ticketAccess,
  type ThreadMessage, type Ticket, type TicketAccess,
} from '../lib/api/support';
import { getSupportGrant, revokeSupportAccess, type SupportGrant } from '../lib/api/gymApp';
import { getGymContext } from '../lib/gymContext';
import {
  myIdeas, myRating, myTestimonials, rateCoreFitness, reportBug, screenshotLink, sendIdea, sendTestimonial, ticketExtras, withdrawTestimonial,
  type Idea, type MyRating, type Testimonial,
} from '../lib/api/feedback';

const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const IDEA_STATUS: Record<Idea['status'], string> = { open: 'Sent', planned: 'Planned', done: 'Done', not_now: 'Not now' };
const QUOTE_STATUS: Record<Testimonial['status'], string> = {
  pending: 'Waiting for Core Fitness', approved: 'On the website', declined: 'Not used', withdrawn: 'Taken down',
};
const STATUS: Record<Ticket['status'], string> = { open: 'Waiting for Core Fitness', answered: 'Answered', closed: 'Solved' };
/** Where things are, for the questions every new gym asks. Each names a real page. */
const QUICK: { title: string; where: string; to: string }[] = [
  { title: 'Inviting your front desk', where: 'People → Invitations', to: '/invitations' },
  { title: 'Setting who approves bookings', where: 'Settings → Bookings', to: '/settings?tab=bookings' },
  { title: 'Your join link and poster', where: 'Your app → Joining', to: '/gym-app?tab=join' },
  { title: 'Paying Core Fitness', where: 'Your plan', to: '/subscription' },
];
type Tab = 'questions' | 'ideas' | 'rate';

/**
 * Help (2026-10-25): Support (0137, 0162) and Feedback (0188) on one page, to
 * the owner's approved mock-up (account-v1.html → Help). Three tabs:
 *
 *   Questions  every thread with Core Fitness. A new question can carry a
 *              screenshot, which files it as a problem report (0188) — the
 *              old Feedback page's "Report a problem" made a ticket anyway.
 *              Support access is still asked for and answered *on the ticket*
 *              (0162); the side card shows whether Core Fitness can look now.
 *   Ideas      ask for a feature, and see what became of each.
 *   Rate us    the owner's rating and the optional words for the website.
 *
 * /support and /feedback still open (App.tsx sends them here).
 */
export default function Help() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'ideas' ? 'ideas' : params.get('tab') === 'rate' ? 'rate' : 'questions';
  const setTab = (t: Tab) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', t); return n; }, { replace: true });

  const [owner, setOwner] = useState(false);
  const [gymId, setGymId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null | undefined>(null);
  const [extras, setExtras] = useState<Map<string, { kind: string; screenshot: string | null }>>(new Map());
  const [rating, setRating] = useState<MyRating | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [quotes, setQuotes] = useState<Testimonial[]>([]);
  const [grant, setGrant] = useState<SupportGrant | null>(null);
  const [feedbackFailed, setFeedbackFailed] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const loadTickets = useCallback(async () => {
    const list = await myTickets();
    setTickets(list);
    if (list) setExtras(await ticketExtras(list.map((t) => t.id)));
  }, []);
  const loadFeedback = useCallback(async () => {
    const ctx = await getGymContext();
    const isOwner = ctx?.role === 'admin';
    setOwner(isOwner); setGymId(ctx?.gymId ?? null);
    try {
      const [r, i, q] = await Promise.all([isOwner ? myRating() : null, myIdeas(), isOwner ? myTestimonials() : []]);
      // An empty answer comes back as null, not [] — a list the page then reads must never be null.
      setRating(r ?? null); setIdeas(i ?? []); setQuotes(q ?? []); setFeedbackFailed(null);
    } catch (e) {
      setFeedbackFailed(/schema cache|Could not find the function/i.test(e instanceof Error ? e.message : '')
        ? 'Ideas and ratings need migration 0188, which is not live on this database yet.'
        : e instanceof Error ? e.message : 'Could not load ideas and ratings');
    }
    setGrant(await getSupportGrant().catch(() => null));
  }, []);
  useEffect(() => { void (async () => { await Promise.all([loadTickets(), loadFeedback()]); })(); }, [loadTickets, loadFeedback]);

  const openCount = tickets?.filter((t) => t.status !== 'closed').length ?? 0;

  return (
    <div className="att" data-help>
      <div className="a-head">
        <div className="min-w-0"><h1>Help</h1><p>Ask Core Fitness anything, tell us what to build, and see what we changed</p></div>
        <div className="a-tabs" role="tablist" aria-label="Help sections">
          <button type="button" role="tab" aria-selected={tab === 'questions'} className={tab === 'questions' ? 'on' : ''} onClick={() => setTab('questions')}>
            <MessageCircle size={14} />Questions{openCount > 0 && <em>{openCount} open</em>}</button>
          <button type="button" role="tab" aria-selected={tab === 'ideas'} className={tab === 'ideas' ? 'on' : ''} onClick={() => setTab('ideas')}>
            <Lightbulb size={14} />Ideas{ideas.length > 0 && <em>{ideas.length}</em>}</button>
          <button type="button" role="tab" aria-selected={tab === 'rate'} className={tab === 'rate' ? 'on' : ''} onClick={() => setTab('rate')}>
            <Star size={14} />Rate us</button>
        </div>
        <button type="button" className="a-btn violet" onClick={() => { setTab('questions'); setComposing(true); }}><Plus size={15} />Ask a question</button>
      </div>

      {tab === 'questions' && (
        <Questions tickets={tickets} extras={extras} owner={owner} gymId={gymId} composing={composing} setComposing={setComposing}
          reload={loadTickets} side={(
            <div className="a-grid a-scroll" style={{ alignContent: 'start' }}>
              <div className="a-card">
                <div className="a-ct"><h3><ShieldCheck size={16} />Let Core Fitness look</h3>
                  <span className={`a-toggle ${grant ? '' : 'off'}`} aria-hidden /></div>
                {grant ? (
                  <>
                    <p className="a-sub">Core Fitness can look at your gym until {when(grant.expires_at)}{grant.reason ? `, for: ${grant.reason}` : ''}. {grant.first_used_at ? 'They have looked.' : 'Nobody has looked yet.'} They can only look — the database refuses them every change.</p>
                    {owner && <button type="button" className="a-btn sm" style={{ marginTop: 8, alignSelf: 'flex-start' }}
                      onClick={() => void revokeSupportAccess().then(loadFeedback).then(() => showToast('Access withdrawn', 'success')).catch((e) => showToast(e instanceof Error ? e.message : 'Could not withdraw it', 'error'))}>Take it back now</button>}
                  </>
                ) : (
                  <p className="a-sub">Off. When Core Fitness needs to see what you see, it asks on your question for a few hours of look-only access — you answer there, and it ends by itself.</p>
                )}
              </div>
              {owner && (
                <div className="a-card">
                  <div className="a-ct"><h3><Star size={16} />Your rating</h3></div>
                  {rating ? (
                    <>
                      <div aria-label={`${rating.stars} of 5`} style={{ color: 'var(--a-amber)', fontSize: 20 }}>{'★'.repeat(rating.stars)}<span style={{ color: 'var(--a-high)' }}>{'★'.repeat(5 - rating.stars)}</span></div>
                      <div className="a-sub" style={{ marginTop: 4 }}>{rating.stars} of 5 · {day(rating.created_at)} · <button type="button" className="a-link" onClick={() => setTab('rate')}>rate again any time</button></div>
                    </>
                  ) : <div className="a-sub">Not rated yet. <button type="button" className="a-link" style={{ color: 'var(--a-p300)' }} onClick={() => setTab('rate')}>Rate Core Fitness</button></div>}
                </div>
              )}
              <div className="a-card">
                <div className="a-ct"><h3><Lightbulb size={16} />Your ideas</h3>{ideas.length > 3 && <button type="button" className="a-link" onClick={() => setTab('ideas')}>See all</button>}</div>
                {ideas.length === 0 ? <div className="a-sub">None yet. <button type="button" className="a-link" style={{ color: 'var(--a-p300)' }} onClick={() => setTab('ideas')}>Ask for a feature</button></div>
                  : ideas.slice(0, 3).map((i) => (
                    <div key={i.id} className="a-row">
                      <div className="t"><b>{i.title}</b><small>{i.platform_note ? `“${i.platform_note}”` : day(i.created_at)}</small></div>
                      <span className={`a-pill ${i.status === 'open' ? '' : 'v'}`}>{IDEA_STATUS[i.status]}</span>
                    </div>
                  ))}
              </div>
            </div>
          )} />
      )}

      {tab === 'ideas' && (
        <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px', flex: 1 }}>
          <div className="a-card a-scroll">
            <div className="a-ct"><h3><Lightbulb size={16} />Ideas from your gym</h3><small>Core Fitness marks each one Planned, Done or Not now, and tells whoever asked</small></div>
            {feedbackFailed && <p className="a-sub">{feedbackFailed}</p>}
            {!feedbackFailed && ideas.length === 0 && <p className="a-sub">No ideas sent yet.</p>}
            {ideas.map((i) => (
              <div key={i.id} className="a-row" data-idea={i.status}>
                <div className="t">
                  <b>{i.title}</b>
                  <small>{i.author_name ?? 'Someone'} · {day(i.created_at)}</small>
                  {i.platform_note && <small style={{ whiteSpace: 'normal', color: '#fff' }}>Core Fitness: {i.platform_note}</small>}
                </div>
                <span className={`a-pill ${i.status === 'open' ? '' : 'v'}`}>{IDEA_STATUS[i.status]}</span>
              </div>
            ))}
          </div>
          <IdeaForm onSaved={loadFeedback} />
        </div>
      )}

      {tab === 'rate' && (
        <div className="a-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', flex: 1, alignContent: 'start' }}>
          {feedbackFailed && <div className="a-card" style={{ gridColumn: '1 / -1' }}><p className="a-sub">{feedbackFailed}</p></div>}
          {owner ? (
            <>
              <RateCard rating={rating} onSaved={loadFeedback} />
              <QuoteCard quotes={quotes} onSaved={loadFeedback} />
            </>
          ) : <div className="a-card"><p className="a-sub">The gym's owner rates Core Fitness and offers words for its website. You can still ask questions and send ideas.</p></div>}
        </div>
      )}
    </div>
  );
}

function Questions({ tickets, extras, owner, gymId, composing, setComposing, reload, side }: {
  tickets: Ticket[] | null | undefined;
  extras: Map<string, { kind: string; screenshot: string | null }>;
  owner: boolean; gymId: string | null;
  composing: boolean; setComposing: (b: boolean) => void;
  reload: () => Promise<void>;
  side: ReactNode;
}) {
  const [open, setOpenState] = useState<Ticket | null>(null);
  const openId = useRef<string | null>(null);
  const setOpen = (t: Ticket | null) => { openId.current = t?.id ?? null; setOpenState(t); };
  const [msgs, setMsgs] = useState<ThreadMessage[]>([]);
  const [access, setAccess] = useState<TicketAccess | null>(null);
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [shot, setShot] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const show = async (t: Ticket) => {
    setComposing(false); setOpen(t); setAccess(null);
    try { setMsgs(await thread(t.id)); setAccess(await ticketAccess(t.id)); await reload(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not open it', 'error'); }
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn(); showToast(ok, 'success'); await reload();
      if (openId.current) { setMsgs(await thread(openId.current)); setAccess(await ticketAccess(openId.current)); }
    } catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
    finally { setBusy(false); }
  };
  const send = () => run(async () => {
    if (shot && shot.size > 5 * 1024 * 1024) throw new Error('That screenshot is over 5 MB');
    // A screenshot makes it a problem report (0188), which is a ticket with the picture attached.
    const id = shot && gymId ? await reportBug(gymId, subject.trim(), body.trim(), shot) : await openTicket(subject, body);
    setSubject(''); setBody(''); setShot(null); setFileKey((k) => k + 1);
    const list = await myTickets();
    const t = list?.find((x) => x.id === id);
    if (t) await show(t); else setComposing(false);
  }, shot ? 'Sent — with your screenshot' : 'Sent to Core Fitness');

  if (tickets === null) return <p className="a-sub">Loading…</p>;
  if (tickets === undefined) return <div className="a-card"><p className="a-sub">Questions are not switched on yet — paste migration 0137.</p></div>;
  const shown = tickets.filter((t) => !q.trim() || t.subject.toLowerCase().includes(q.trim().toLowerCase()));
  const writing = composing || !open;

  return (
    <div className="a-grid" style={{ gridTemplateColumns: '320px minmax(0, 1fr) 300px', flex: 1 }}>
      <div className="a-card a-scroll">
        <label className="a-input sm" style={{ marginBottom: 8 }}><Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your questions…" aria-label="Search your questions" /></label>
        <div className="a-lbl" style={{ margin: '4px 0 6px' }}>Your messages</div>
        {tickets.length === 0 && <p className="a-sub">None yet — ask anything.</p>}
        {tickets.length > 0 && shown.length === 0 && <p className="a-sub">Nothing matches.</p>}
        {shown.map((t) => (
          <button key={t.id} type="button" onClick={() => void show(t)} className="a-row" data-ticket={t.id}
            style={{ width: '100%', textAlign: 'left', borderRadius: 12, padding: 10, background: open?.id === t.id && !composing ? '#7c3aed14' : undefined, borderTop: 0 }}>
            <div className="t">
              <b>{t.subject}</b>
              <small>{STATUS[t.status]} · {when(t.updatedAt)}</small>
            </div>
            {extras.get(t.id)?.kind === 'bug' && <span className="a-pill" data-bug-badge><Bug size={10} />BUG</span>}
            {t.unread ? <span className="a-pill a">NEW</span> : t.status === 'closed' ? <span className="a-pill v">solved</span> : t.status === 'open' ? <span className="a-dot a" /> : null}
          </button>
        ))}
        <div className="a-lbl" style={{ margin: '14px 0 6px' }}>Quick answers</div>
        {QUICK.map((k) => (
          <Link key={k.title} to={k.to} className="a-row" style={{ padding: '7px 0' }}>
            <BookOpen size={15} style={{ color: 'var(--a-p300)' }} />
            <div className="t"><b>{k.title}</b><small>{k.where}</small></div>
          </Link>
        ))}
      </div>

      <div className="a-card a-scroll">
        {writing ? (
          <>
            <div className="a-ct"><div><h3>Ask Core Fitness</h3><div className="a-sub">A problem, a question, an idea — we reply here and you get a notification</div></div>
              {composing && open && <button type="button" className="a-btn ghost sm" onClick={() => setComposing(false)}>Back to “{open.subject}”</button>}</div>
            <div className="a-fld"><label htmlFor="h-subject">Subject</label>
              <input id="h-subject" className="a-in" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Receipts will not print" aria-label="Subject" /></div>
            <div className="a-fld" style={{ marginTop: 10 }}><label htmlFor="h-message">Message</label>
              <textarea id="h-message" className="a-in" rows={6} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)}
                placeholder="What happened, and what you expected" aria-label="Message" /></div>
            <label className="a-btn ghost sm" style={{ marginTop: 10, alignSelf: 'flex-start', cursor: 'pointer' }}>
              <Paperclip size={13} />{shot ? shot.name : 'Add a screenshot (optional)'}
              <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Screenshot" className="hidden" onChange={(e) => setShot(e.target.files?.[0] ?? null)} />
            </label>
            <p className="a-sub" style={{ marginTop: 6 }}>A screenshot helps with a problem; only your gym and Core Fitness can open it. No member details go with it.</p>
            <button type="button" className="a-btn violet" style={{ marginTop: 12, alignSelf: 'flex-end' }} disabled={busy || !subject.trim() || !body.trim()} onClick={() => void send()}>
              <Send size={14} />{busy ? 'Sending…' : 'Send'}
            </button>
          </>
        ) : (
          <>
            <div className="a-ct">
              <div><h3 style={{ whiteSpace: 'normal' }}>{open.subject}</h3>
                <div className="a-sub">{open.status === 'open' ? 'Waiting for Core Fitness · you get a notification when they reply' : STATUS[open.status]}</div></div>
              {open.status !== 'closed' && <button type="button" className="a-btn ghost sm" disabled={busy}
                onClick={() => void run(async () => { await closeTicket(open.id); setOpen({ ...open, status: 'closed' }); }, 'Marked solved')}>Mark solved</button>}
            </div>
            {extras.get(open.id)?.screenshot && (
              <button type="button" className="a-link" style={{ color: 'var(--a-p300)', alignSelf: 'flex-start', marginBottom: 8 }}
                onClick={() => void screenshotLink(extras.get(open.id)!.screenshot!).then((u) => u && window.open(u, '_blank', 'noopener'))}>Open the screenshot you sent</button>
            )}
            {access?.context?.message && (
              <div className="a-hint" style={{ marginBottom: 8 }}><Bug size={15} />
                <span>Sent with the error report: <b style={{ color: '#fff' }}>{access.context.message}</b>{access.context.route ? ` on ${access.context.route}` : ''}. No member details go with it.</span></div>
            )}
            {access?.requested_at && !access.answer && (
              <div className="a-toast amber" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
                <span className="ok"><ShieldCheck size={15} /></span>
                <div style={{ flex: 1 }}>
                  <b>Core Fitness asks to look at your gym for {access.hours} hour{access.hours === 1 ? '' : 's'}</b>
                  <div className="a-sub" style={{ marginTop: 2 }}>Why: {access.why}. They can only look — the database refuses them every change — it ends by itself, and every visit is in your activity log.</div>
                  {owner ? (
                    <div className="flex gap-2" style={{ marginTop: 8 }}>
                      <button type="button" className="a-btn amber sm" disabled={busy} onClick={() => void run(() => approveTicketAccess(open.id), 'Access open — it ends by itself')}>Approve</button>
                      <button type="button" className="a-btn ghost sm" disabled={busy} onClick={() => void run(() => declineTicketAccess(open.id), 'Declined')}>Decline</button>
                    </div>
                  ) : <div className="a-sub" style={{ marginTop: 6 }}>Only the gym owner can answer this.</div>}
                </div>
              </div>
            )}
            {access?.live && (
              <div className="a-toast" style={{ marginBottom: 8 }}>
                <span className="ok"><ShieldCheck size={15} /></span>
                <span className="a-sub" style={{ flex: 1 }}>Core Fitness can look until {when(access.expires_at!)}. {access.first_used_at ? 'They have looked.' : 'Nobody has looked yet.'}</span>
                {owner && <button type="button" className="a-btn ghost sm" disabled={busy} onClick={() => void run(() => revokeSupportAccess(), 'Access withdrawn')}>Withdraw now</button>}
              </div>
            )}
            {access?.resolution && (
              <div className="a-toast" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
                <span className="ok"><CheckCircle2 size={15} /></span>
                <div><b>What was fixed</b><div className="a-sub" style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{access.resolution}</div></div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {msgs.map((m) => (
                <div key={m.id} className={`a-msg ${m.fromPlatform ? '' : 'me'}`}>
                  <b style={{ color: m.fromPlatform ? 'var(--a-p300)' : undefined }}>{m.authorName}</b> <span className="a-sub">· {when(m.createdAt)}</span>{'\n'}{m.body}
                </div>
              ))}
            </div>
            <div className="flex gap-2 items-end" style={{ marginTop: 'auto', paddingTop: 12 }}>
              <textarea className="a-in" rows={2} value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" aria-label="Reply" />
              <button type="button" className="a-btn violet" disabled={busy || !reply.trim()}
                onClick={() => void run(async () => { await replyTicket(open.id, reply); setReply(''); }, 'Reply sent')}><Send size={14} />Reply</button>
            </div>
          </>
        )}
      </div>

      {side}
    </div>
  );
}

function IdeaForm({ onSaved }: { onSaved: () => Promise<void> }) {
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
    <div className="a-card glow" data-feedback="ideas">
      <div className="a-ct"><h3><Lightbulb size={16} />Ask for a feature</h3></div>
      <div className="a-fld"><label htmlFor="i-title">What should it do?</label>
        <input id="i-title" className="a-in" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Export members to Excel" aria-label="Idea" /></div>
      <div className="a-fld" style={{ marginTop: 10 }}><label htmlFor="i-body">Why it would help <span style={{ fontWeight: 500 }}>· optional</span></label>
        <textarea id="i-body" className="a-in" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} aria-label="More detail" /></div>
      <button type="button" className="a-btn amber" style={{ marginTop: 12, alignSelf: 'flex-end' }} disabled={busy || title.trim().length < 3} onClick={() => void save()}>
        {busy ? 'Sending…' : 'Send idea'}
      </button>
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
    <div className="a-card" data-feedback="rate">
      <div className="a-ct"><h3><Star size={16} />Rate Core Fitness</h3></div>
      <p className="a-sub">
        {rating ? `Your current rating: ${rating.stars} of 5, on ${day(rating.created_at)}. Rate again any time — the newest one counts.` : 'Any time, as often as you like. The newest rating counts.'}
      </p>
      <div className="flex gap-1" role="radiogroup" aria-label="Stars" style={{ marginTop: 10 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setStars(n)}>
            <Star size={28} fill={n <= stars ? 'var(--a-amber)' : 'none'} style={{ color: n <= stars ? 'var(--a-amber)' : 'var(--a-muted)' }} />
          </button>
        ))}
      </div>
      <textarea className="a-in" style={{ marginTop: 10 }} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={3} aria-label="Comment"
        placeholder="What made you give that? (optional)" />
      <button type="button" className="a-btn amber" style={{ marginTop: 10, alignSelf: 'flex-end' }} disabled={busy || stars === 0} onClick={() => void save()}>
        {busy ? 'Sending…' : 'Send rating'}
      </button>
    </div>
  );
}

function QuoteCard({ quotes, onSaved }: { quotes: Testimonial[]; onSaved: () => Promise<void> }) {
  const [quote, setQuote] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const live = quotes.find((x) => x.status === 'approved' || x.status === 'pending') ?? null;
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
    <div className="a-card" data-feedback="testimonial">
      <div className="a-ct"><h3><MessageSquareQuote size={16} />A few words for the website</h3></div>
      <p className="a-sub">Optional. Core Fitness shows it on its website only after approving it, with the name you give — and you can take it down here at any time.</p>
      {live && (
        <div className="a-post" style={{ marginTop: 10 }} data-quote={live.status}>
          <b>“{live.quote}”</b>
          <div className="a-sub" style={{ marginTop: 4 }}>— {live.shown_name}{live.shown_role ? `, ${live.shown_role}` : ''} · {QUOTE_STATUS[live.status]}</div>
          <button type="button" className="a-link" style={{ marginTop: 4 }} disabled={busy} onClick={() => void takeDown(live.id)}>Take it down</button>
        </div>
      )}
      <textarea className="a-in" style={{ marginTop: 10 }} value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={400} rows={3} aria-label="Your words"
        placeholder="What has Core Fitness changed at your gym?" />
      <div className="a-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <input className="a-in" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Name to show" aria-label="Name to show" />
        <input className="a-in" value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} placeholder="e.g. Owner, Iron Den (optional)" aria-label="Role to show" />
      </div>
      <label className="a-sub flex items-start gap-2" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        Core Fitness may show these words with this name on its website.
      </label>
      <button type="button" className="a-btn amber" style={{ marginTop: 10, alignSelf: 'flex-end' }} disabled={busy || !agree || quote.trim().length < 20 || name.trim().length < 2} onClick={() => void save()}>
        {live ? 'Send instead' : 'Send'}
      </button>
    </div>
  );
}
