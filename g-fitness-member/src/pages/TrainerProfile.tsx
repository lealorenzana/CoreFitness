import Avatar from '../components/ui/Avatar';
import { listPublicCredentials, type PublicCredential } from '../lib/api/trainerFeedback';
import { SkeletonList } from '../components/ui/Skeleton';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarPlus, Lock, SealCheck } from '@phosphor-icons/react';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { listPublicTrainers, trainerName, type PublicTrainer } from '../lib/api/directory';
import { listTrainerClasses } from '../lib/api/classes';
import {
  getRatingSummary, getMyRating, getMyRatingHistory, canRate, saveMyRating,
  deleteMyRating, currentPeriod, periodLabel,
  type TrainerRatingSummary, type MyTrainerRating, type MyRatingHistoryEntry,
} from '../lib/api/trainerRatings';
import { getCurrentMemberId } from '../services/bookingService';
import { Stars, StarInput } from '../components/ui/StarRating';
import type { ClassRow } from '../types/db';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, LineRow, NocButton, Panel } from '../components/ui/noc';

/**
 * A coach's profile, as a member sees it (Nocturne redesign).
 *
 * What this used to show — a 4.9 rating, two five-star reviews from "John Doe"
 * and "Maria Santos", a certifications list, and "8 years experience" — had no
 * table behind any of it, and the page fell back to `trainers[0]` when the id
 * didn't match, so an unknown link silently rendered somebody else's profile.
 *
 * Everything shown now has a column behind it. 0041 gave the background its
 * own storage — years coaching, focus areas, certifications, achievements — so
 * the page answers the questions the fake version was inventing answers to.
 *
 * **Ratings are still not here, and that is the point.** They were the loudest
 * thing on the old page (4.9, two glowing reviews, both fabricated) and they
 * are the one item deliberately left out: a rating needs reviews, reviews need
 * moderation, and on a four-trainer gym an unmoderated score turns one bad
 * afternoon into a permanent number. Everything above is the trainer's own
 * statement about themselves, which is a claim the system can honestly attribute.
 *
 * Every field is optional, and each renders only when filled. A coach who has
 * entered nothing gets the same clean profile they had before rather than a
 * page of empty headings.
 */
export default function TrainerProfile() {
  const navigate = useNavigate();
  const { trainerId } = useParams();
  const [trainer, setTrainer] = useState<PublicTrainer | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Ratings (0042). Kept separate from the profile fetch: a coach with no
  // ratings, or a summary that fails to load, must still render a full profile.
  const [summary, setSummary] = useState<TrainerRatingSummary | null>(null);
  /**
   * Qualifications the gym has checked (0072).
   *
   * A different and stronger claim than `trainer.certifications` below, which
   * is what the coach says about themselves. Kept apart on screen for that
   * reason — merging them would launder an unverified claim into a verified
   * one, which is the whole thing the credential review exists to prevent.
   *
   * Empty is normal: most coaches have uploaded nothing, and an empty list
   * renders no panel rather than an empty one.
   */
  const [credentials, setCredentials] = useState<PublicCredential[]>([]);
  const [mine, setMine] = useState<MyTrainerRating | null>(null);
  const [eligible, setEligible] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [draftStars, setDraftStars] = useState(0);
  const [draftComment, setDraftComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Every month this member has evaluated this coach, newest first. */
  const [history, setHistory] = useState<MyRatingHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  /**
   * The month being evaluated. Read once per mount rather than per render:
   * recomputing it would make `period` a new value on every pass and, at
   * midnight on the 1st, silently switch which row a save targets mid-edit.
   */
  const [period] = useState(currentPeriod);

  useEffect(() => {
    if (!trainerId) return;
    let cancelled = false;
    // Its own effect, like the ratings: a credential read that fails must not
    // take the profile down with it. Falling back to an empty list is honest
    // here — it renders nothing at all rather than claiming none exist.
    listPublicCredentials(trainerId)
      .then((rows) => { if (!cancelled) setCredentials(rows); })
      .catch(() => { /* no panel, rather than a wrong one */ });
    return () => { cancelled = true; };
  }, [trainerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listPublicTrainers();
        // Exact id only. Matching loosely, or falling back to the first coach,
        // is how the old page showed the wrong person with full confidence.
        const found = all.find((t) => t.id === trainerId) ?? null;
        if (cancelled) return;
        setTrainer(found);
        if (found) {
          setClasses(await listTrainerClasses(found.id).catch(() => []));

          const id = await getCurrentMemberId().catch(() => null);
          if (cancelled) return;
          setMemberId(id);

          const [sum, own, may] = await Promise.all([
            getRatingSummary(found.id).catch(() => null),
            id ? getMyRating(id, found.id).catch(() => null) : Promise.resolve(null),
            canRate(found.id),
          ]);
          if (cancelled) return;
          setSummary(sum);
          setMine(own);
          setEligible(may);
          if (own) {
            setDraftStars(own.stars);
            setDraftComment(own.comment ?? '');
          }
        }
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load this trainer'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [trainerId]);

  const submitRating = async () => {
    if (!trainer || !memberId || draftStars < 1) return;
    setSaving(true);
    try {
      await saveMyRating(memberId, trainer.id, draftStars, draftComment.trim() || null, period);
      setMine({
        trainer_id: trainer.id, stars: draftStars,
        comment: draftComment.trim() || null,
        period, updated_at: new Date().toISOString(),
      });
      setEditing(false);
      setHistory(await getMyRatingHistory(memberId, trainer.id).catch(() => history));
      // Re-read rather than adjusting the average locally. The threshold rule
      // lives in the view, so guessing the new average here would be a second
      // implementation of it that starts disagreeing the moment it changes.
      setSummary(await getRatingSummary(trainer.id).catch(() => summary));
      toast.success(`Thanks — your ${periodLabel(period)} evaluation is saved`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save your rating'));
    } finally {
      setSaving(false);
    }
  };

  const removeRating = async () => {
    if (!trainer || !memberId) return;
    setSaving(true);
    try {
      await deleteMyRating(memberId, trainer.id, period);
      setMine(null);
      setHistory(await getMyRatingHistory(memberId, trainer.id).catch(() => history));
      setDraftStars(0);
      setDraftComment('');
      setEditing(false);
      setSummary(await getRatingSummary(trainer.id).catch(() => summary));
      toast.success(`Your ${periodLabel(period)} evaluation was removed`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove your rating'));
    } finally {
      setSaving(false);
    }
  };

  const upcoming = classes
    .filter((c) => c.scheduled_at != null && new Date(c.scheduled_at).getTime() > Date.now())
    .slice(0, 5);

  const bookWith = () => trainer && navigate('/member/book-class', { state: { trainerId: trainer.id } });

  return (
    <Page>
      <PageTitle back title={trainer ? trainerName(trainer) : 'Coach'}
        subtitle={trainer?.specialization ?? (loading ? undefined : trainer ? 'General training' : undefined)} />

      {loading ? (
        <SkeletonList />
      ) : !trainer ? (
        <div className="flex flex-col" style={{ gap: 16 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
            This coach could not be found — they may no longer be with the gym.
          </p>
          <NocButton variant="ghost" onClick={() => navigate('/member/trainers')}>See all coaches</NocButton>
        </div>
      ) : (
        <>
          {/* ── Who they are, and the score if there is one ── */}
          <section className="flex items-center" style={{ gap: 14 }}>
            <Avatar name={trainerName(trainer)} photoUrl={trainer.photo_url} size={64} />
            <div className="min-w-0">
              {/* `!= null`, not truthiness: a coach in their first year has 0,
                  which is a real answer, and `{0 && …}` renders a bare "0". */}
              {trainer.years_experience != null && (
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  {trainer.years_experience === 0
                    ? 'In their first year of coaching'
                    : `${trainer.years_experience} ${trainer.years_experience === 1 ? 'year' : 'years'} coaching`}
                </p>
              )}
              {summary && (
                <div className="flex items-center" style={{ gap: 7, marginTop: 5 }}>
                  {summary.average_stars == null ? (
                    // "Not rated yet · 1 so far" read as a bug to everyone who had
                    // just left a rating. It says what is true: the score waits
                    // for more people, and how many.
                    <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                      {summary.rating_count === 0
                        ? 'No evaluations yet'
                        : `Score shows once 3 members have evaluated · ${summary.rating_count} of 3`}
                    </p>
                  ) : (
                    <>
                      <Stars value={summary.average_stars} size={14} />
                      <span style={{ fontSize: 13.5, color: 'var(--color-text-primary)' }}>{summary.average_stars.toFixed(1)}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {summary.rating_count} {summary.rating_count === 1 ? 'rating' : 'ratings'}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          <NocButton variant="action" icon={<CalendarPlus size={16} />} onClick={bookWith}>
            Book with {trainer.first_name}
          </NocButton>

          {/* ── Evaluating this coach ──
              Not eligible yet, and SAYING SO. This was `{eligible && …}` and
              nothing else, so a member the database will not let rate a coach saw
              no form and no sentence — indistinguishable from a broken feature,
              which is what "users cannot rate a coach" turned out to mean. Gates
              lock and explain; `may_rate_trainer()` is still the rule. */}
          {!eligible ? (
            <Panel>
              <p className="flex items-center" style={{ gap: 8, fontSize: 14.5, color: 'var(--color-text-primary)' }}>
                <Lock size={15} style={{ color: 'var(--color-text-muted)' }} /> Evaluations open after your first session
              </p>
              <p style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
                You can evaluate {trainer.first_name} once you have finished a class they taught or a 1-on-1 with them.
                It keeps scores to members who have actually trained with a coach.
              </p>
            </Panel>
          ) : (
            <Panel glow="structure">
              <p className="eyebrow" style={{ color: 'var(--color-primary-300)' }}>
                {mine ? `Your ${periodLabel(period)} evaluation` : `Evaluate ${periodLabel(period)}`}
              </p>
              <p style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                {mine
                  ? 'You can change this until the month ends. Next month you get a fresh one.'
                  : 'One evaluation a month, so a coach can see how they are doing over time.'}
              </p>

              {mine && !editing ? (
                <div style={{ marginTop: 14 }}>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <Stars value={mine.stars} size={18} />
                    <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{mine.stars}.0</span>
                  </div>
                  {mine.comment && (
                    <p className="whitespace-pre-line" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
                      {mine.comment}
                    </p>
                  )}
                  <div className="flex items-center" style={{ gap: 18, marginTop: 12, fontSize: 13 }}>
                    <button onClick={() => setEditing(true)} style={{ color: 'var(--color-secondary)' }}>Change</button>
                    <button onClick={removeRating} disabled={saving} className="disabled:opacity-50"
                      style={{ color: 'var(--color-text-secondary)' }}>Remove</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <StarInput value={draftStars} onChange={setDraftStars} disabled={saving} />
                  {/* The stars are the score; this is the part a coach can act
                      on. Optional in SQL — forcing prose gets you "ok" — but
                      asked for properly, with a count nudging toward a sentence. */}
                  <label className="block" style={{ marginTop: 14 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>Why that score?</span>
                    <textarea
                      value={draftComment}
                      onChange={(e) => setDraftComment(e.target.value)}
                      rows={4}
                      maxLength={1000}
                      placeholder="What went well, what could be better? Only the gym and this coach can read it."
                      className="field-input w-full resize-none"
                      style={{ marginTop: 8, fontSize: 14, padding: 12 }}
                    />
                    <span className="block" style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text-muted)' }}>
                      {draftComment.trim().length === 0
                        ? 'Optional — but a score with a reason is the useful kind.'
                        : `${draftComment.length}/1000`}
                    </span>
                  </label>
                  <div className="flex" style={{ gap: 9, marginTop: 14 }}>
                    <NocButton variant="action" className="flex-1" onClick={submitRating} disabled={saving || draftStars < 1}>
                      {saving ? 'Saving…' : mine ? 'Save changes' : 'Send evaluation'}
                    </NocButton>
                    {mine && (
                      <NocButton variant="ghost" className="flex-1" onClick={() => {
                        setEditing(false);
                        setDraftStars(mine.stars);
                        setDraftComment(mine.comment ?? '');
                      }}>
                        Cancel
                      </NocButton>
                    )}
                  </div>
                  {draftStars < 1 && (
                    <p style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>Pick a star rating to continue.</p>
                  )}
                </div>
              )}
            </Panel>
          )}

          {/* Past months, behind a control. Only this member's own: 0066 narrowed
              reads so one member cannot read another's written reasons. */}
          {history.length > (mine ? 1 : 0) && (
            <section>
              <button onClick={() => setShowHistory((v) => !v)} className="w-full flex items-center justify-between"
                style={{ fontSize: 13.5 }}>
                <span style={{ color: 'var(--color-text-primary)' }}>Your past evaluations</span>
                <span style={{ color: 'var(--color-primary-300)' }}>{showHistory ? 'Hide' : `Show ${history.length}`}</span>
              </button>
              {showHistory && (
                <div style={{ marginTop: 6 }}>
                  {history.map((h, i) => (
                    <div key={h.period}>
                      <div style={{ padding: '12px 0' }}>
                        <div className="flex items-center justify-between" style={{ gap: 8 }}>
                          <span style={{ fontSize: 13.5, color: 'var(--color-text-primary)' }}>
                            {periodLabel(h.period)}
                            {h.period === period && <span style={{ color: 'var(--color-text-muted)' }}> · this month</span>}
                          </span>
                          <span className="flex items-center flex-none" style={{ gap: 6 }}>
                            <Stars value={h.stars} size={12} />
                            <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{h.stars}.0</span>
                          </span>
                        </div>
                        <p className="whitespace-pre-line" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.5, color: h.comment ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                          {h.comment ?? 'No reason written.'}
                        </p>
                      </div>
                      {i < history.length - 1 && <div className="hair" />}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* What they coach best — chips, because a member scanning coaches for
              "someone who does rehab" is matching a word, not reading prose. */}
          {trainer.focus_areas != null && trainer.focus_areas.length > 0 && (
            <section>
              <Eyebrow>Trains for</Eyebrow>
              <div className="flex flex-wrap" style={{ gap: 8, marginTop: 10 }}>
                {trainer.focus_areas.map((area) => (
                  <span key={area} style={{
                    padding: '6px 12px', borderRadius: 'var(--radius-pill)', fontSize: 12.5,
                    border: '1px solid var(--color-primary-800)', color: 'var(--color-primary-300)',
                  }}>
                    {area}
                  </span>
                ))}
              </div>
            </section>
          )}

          {trainer.bio && (
            <section>
              <Eyebrow>About</Eyebrow>
              <p className="whitespace-pre-line" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
                {trainer.bio}
              </p>
            </section>
          )}

          {/* Checked by the gym, and labelled as such — the strong claim (0072).
              Only the title and the date verified are published; a pending
              upload shown here would be a claim laundered into a fact. Kept
              apart from the coach's own list below for exactly that reason. */}
          {credentials.length > 0 && (
            <section>
              <Eyebrow mark>Verified by the gym</Eyebrow>
              <div style={{ marginTop: 4 }}>
                {credentials.map((c, i) => (
                  <LineRow
                    key={`${c.title}-${c.verified_on ?? ''}`}
                    gutterWidth={26}
                    gutter={<SealCheck size={17} weight="fill" style={{ color: 'var(--color-primary-400)' }} />}
                    title={c.title}
                    // NULL is possible on rows verified before reviewed_at was
                    // written; the title stands on its own.
                    meta={c.verified_on
                      ? `Verified ${new Date(c.verified_on).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                      : undefined}
                    last={i === credentials.length - 1}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Self-declared, and labelled as such. The gym does not verify these,
              and saying so costs nothing. */}
          {trainer.certifications != null && trainer.certifications.length > 0 && (
            <section>
              <Eyebrow>Certifications</Eyebrow>
              <div style={{ marginTop: 4 }}>
                {trainer.certifications.map((cert, i) => (
                  <LineRow key={cert} title={cert} last={i === trainer.certifications!.length - 1} />
                ))}
              </div>
              <p style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>As stated by the coach — not checked by the gym.</p>
            </section>
          )}

          {trainer.achievements && (
            <section>
              <Eyebrow>Background</Eyebrow>
              <p className="whitespace-pre-line" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
                {trainer.achievements}
              </p>
            </section>
          )}

          <section>
            <Eyebrow>Upcoming classes</Eyebrow>
            {upcoming.length === 0 ? (
              <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
                No classes on the timetable right now. You can still request a 1-on-1 session.
              </p>
            ) : (
              <div style={{ marginTop: 4 }}>
                {upcoming.map((c, i) => {
                  const at = new Date(c.scheduled_at as string);
                  return (
                    <LineRow
                      key={c.id}
                      gutterWidth={62}
                      gutter={at.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                      title={c.name}
                      meta={[at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), c.location].filter(Boolean).join(' · ')}
                      action="Book"
                      onClick={() => navigate('/member/book-class')}
                      last={i === upcoming.length - 1}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
