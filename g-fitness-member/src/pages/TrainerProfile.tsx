import Avatar from '../components/ui/Avatar';
import { SkeletonList } from '../components/ui/Skeleton';
import { panelStyle } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Award, BadgeCheck, Calendar, Clock, MapPin, Dumbbell, Target, Trophy, Star,
} from 'lucide-react';
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

/**
 * A coach's profile, as a member sees it.
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

  return (
    <div className="space-y-5 pb-4">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/trainers'))}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white">Trainer Profile</h1>
      </motion.div>

      {loading ? (
        <SkeletonList />
      ) : !trainer ? (
        <div className="rounded-2xl p-8 text-center" style={panelStyle}>
          <Dumbbell size={40} className="mx-auto mb-3" style={{ color: 'var(--color-border)' }} />
          <p className="font-medium text-white text-sm">Trainer not found</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            This coach may no longer be with the gym.
          </p>
          <button onClick={() => navigate('/member/trainers')}
            className="mt-4 px-6 py-2 rounded-full font-semibold text-sm text-black"
            style={{ background: 'var(--color-secondary)' }}>
            See all trainers
          </button>
        </div>
      ) : (
        <>
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-5 text-center"
            style={{ background: 'var(--color-primary)', border: '1px solid var(--color-primary-hover)' }}>
            <div className="mx-auto mb-3 w-fit">
              <Avatar name={trainerName(trainer)} photoUrl={trainer.photo_url} size={96} tone="secondary" />
            </div>
            <h2 className="text-xl font-bold text-white">{trainerName(trainer)}</h2>
            {trainer.specialization && (
              <p className="text-sm text-white/80 mt-1 flex items-center justify-center gap-1.5">
                <Award size={14} /> {trainer.specialization}
              </p>
            )}
            {/* Years sits in the header because it is the one fact a member
                weighs before anything else. `!= null` and not a truthiness
                check: a coach in their first year has `0`, which is a real
                answer, and `{0 && …}` would render a bare "0" on the card. */}
            {trainer.years_experience != null && (
              <p className="text-xs text-white/70 mt-2 flex items-center justify-center gap-1.5">
                <Clock size={12} />
                {trainer.years_experience === 0
                  ? 'In their first year of coaching'
                  : `${trainer.years_experience} ${trainer.years_experience === 1 ? 'year' : 'years'} coaching`}
              </p>
            )}
            {/* On the violet header the muted token would vanish, so the
                below-threshold wording is rendered here in white/70 rather than
                reusing <RatingLine>, which is tuned for panel backgrounds. */}
            {summary && (
              <div className="mt-3 pt-3 flex items-center justify-center gap-2"
                style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                {summary.average_stars == null ? (
                  /* "Not rated yet · 1 so far" read as a bug to everyone who
                     saw it after leaving a rating — their evaluation *was*
                     saved, and the sentence said otherwise. It now says what is
                     true: the score is waiting for more people, and how many. */
                  <p className="text-xs text-white/70">
                    {summary.rating_count === 0
                      ? 'No evaluations yet'
                      : `Score shows once 3 members have evaluated · ${summary.rating_count} of 3`}
                  </p>
                ) : (
                  <>
                    <Stars value={summary.average_stars} size={16} />
                    <span className="text-sm font-bold text-white">
                      {summary.average_stars.toFixed(1)}
                    </span>
                    <span className="text-xs text-white/70">
                      ({summary.rating_count} {summary.rating_count === 1 ? 'rating' : 'ratings'})
                    </span>
                  </>
                )}
              </div>
            )}
          </motion.div>

          {/* Rating. Shown only to members the database says may rate this coach
              — `may_rate_trainer()` requires a *completed* session with them, so
              a member who has never trained with this coach sees nothing here
              rather than a form that would be rejected on submit.

              The same function is re-checked inside the INSERT and UPDATE
              policies, so this is an explanation of the rule, never the rule. */}
          {eligible && (
            <div className="rounded-2xl p-4" style={panelStyle}>
              <h3 className="text-white font-semibold mb-1 text-sm flex items-center gap-2">
                <Star size={16} style={{ color: 'var(--color-secondary)' }} />
                {mine ? `Your ${periodLabel(period)} evaluation` : `Evaluate ${periodLabel(period)}`}
              </h3>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                {mine
                  ? 'You can change this until the month ends. Next month you get a fresh one.'
                  : 'One evaluation a month, so a coach can see how they are doing over time.'}
              </p>

              {mine && !editing ? (
                <div>
                  <div className="flex items-center gap-2">
                    <Stars value={mine.stars} size={18} />
                    <span className="text-sm font-bold text-white">{mine.stars}.0</span>
                  </div>
                  {mine.comment && (
                    <p className="text-sm mt-2 leading-relaxed whitespace-pre-line"
                      style={{ color: 'var(--color-text-secondary)' }}>
                      {mine.comment}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => setEditing(true)}
                      className="px-4 h-9 rounded-full text-xs font-bold text-black"
                      style={{ background: 'var(--color-secondary)' }}>
                      Change
                    </button>
                    <button onClick={removeRating} disabled={saving}
                      className="px-4 h-9 rounded-full text-xs font-semibold disabled:opacity-50"
                      style={{
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-secondary)',
                      }}>
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <StarInput value={draftStars} onChange={setDraftStars} disabled={saving} />
                  {/* The stars are the score; this is the part a coach can
                      act on. Still optional in SQL — forcing prose gets you
                      "ok" — but asked for properly rather than parenthetically,
                      and the count nudges toward a sentence rather than a word. */}
                  <label className="block mt-3">
                    <span className="text-xs font-semibold text-white">
                      Why that score?
                    </span>
                    <textarea
                      value={draftComment}
                      onChange={(e) => setDraftComment(e.target.value)}
                      rows={4}
                      maxLength={1000}
                      placeholder="What went well, what could be better? Only the gym and this coach can read it."
                      className="w-full mt-1.5 px-3 py-2 rounded-xl text-white text-sm resize-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                    />
                    <span className="block text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {draftComment.trim().length === 0
                        ? 'Optional — but a score with a reason is the useful kind.'
                        : `${draftComment.length}/1000`}
                    </span>
                  </label>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={submitRating}
                      disabled={saving || draftStars < 1}
                      className="px-5 h-10 rounded-full text-sm font-bold text-black disabled:opacity-50"
                      style={{ background: 'var(--color-secondary)' }}>
                      {saving ? 'Saving…' : mine ? 'Save changes' : 'Submit evaluation'}
                    </button>
                    {mine && (
                      <button
                        onClick={() => {
                          setEditing(false);
                          setDraftStars(mine.stars);
                          setDraftComment(mine.comment ?? '');
                        }}
                        className="px-4 h-10 rounded-full text-sm font-semibold"
                        style={{
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-secondary)',
                        }}>
                        Cancel
                      </button>
                    )}
                  </div>
                  {draftStars < 1 && (
                    <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                      Pick a star rating to continue.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Past months, behind a button.
              A member who has evaluated a coach for a year has twelve entries,
              and listing them above the coach's own profile would bury it. Only
              their own months: 0066 narrowed reads so one member cannot read
              another's written reasons. */}
          {history.length > (mine ? 1 : 0) && (
            <div className="rounded-2xl p-4" style={panelStyle}>
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="w-full flex items-center justify-between gap-2"
              >
                <span className="text-white font-semibold text-sm">Your past evaluations</span>
                <span className="text-xs" style={{ color: 'var(--color-secondary)' }}>
                  {showHistory ? 'Hide' : `Show ${history.length}`}
                </span>
              </button>

              {showHistory && (
                <div className="mt-3 space-y-2">
                  {history.map((h) => (
                    <div key={h.period} className="rounded-xl p-3" style={{ background: 'var(--color-bg)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">
                          {periodLabel(h.period)}
                          {h.period === period && (
                            <span className="ml-1.5 font-normal" style={{ color: 'var(--color-text-muted)' }}>
                              · this month
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          <Stars value={h.stars} size={12} />
                          <span className="text-xs font-bold text-white">{h.stars}.0</span>
                        </span>
                      </div>
                      {h.comment ? (
                        <p className="text-xs mt-1.5 leading-relaxed whitespace-pre-line"
                          style={{ color: 'var(--color-text-secondary)' }}>
                          {h.comment}
                        </p>
                      ) : (
                        <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                          No reason written.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* What they coach best. Chips rather than a sentence — a member
              scanning four coaches for "someone who does rehab" is matching a
              word, not reading a paragraph. */}
          {trainer.focus_areas != null && trainer.focus_areas.length > 0 && (
            <div className="rounded-2xl p-4" style={panelStyle}>
              <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
                <Target size={16} style={{ color: 'var(--color-secondary)' }} /> Trains for
              </h3>
              <div className="flex flex-wrap gap-2">
                {trainer.focus_areas.map((area) => (
                  <span
                    key={area}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{
                      background: 'var(--color-primary-light)',
                      color: 'var(--color-primary)',
                      border: '1px solid var(--color-primary)',
                    }}
                  >
                    {area}
                  </span>
                ))}
              </div>
            </div>
          )}

          {trainer.bio && (
            <div className="rounded-2xl p-4" style={panelStyle}>
              <h3 className="text-white font-semibold mb-2 text-sm">About</h3>
              <p className="text-sm leading-relaxed whitespace-pre-line"
                style={{ color: 'var(--color-text-secondary)' }}>{trainer.bio}</p>
            </div>
          )}

          {/* Self-declared, and labelled as such. The gym does not verify these
              and saying so costs nothing, whereas a certifications list
              presented as vetted is a claim the system cannot back. */}
          {trainer.certifications != null && trainer.certifications.length > 0 && (
            <div className="rounded-2xl p-4" style={panelStyle}>
              <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
                <BadgeCheck size={16} style={{ color: 'var(--color-secondary)' }} /> Certifications
              </h3>
              <ul className="space-y-2">
                {trainer.certifications.map((cert) => (
                  <li key={cert} className="text-sm flex items-start gap-2"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    <BadgeCheck size={14} className="flex-shrink-0 mt-0.5"
                      style={{ color: 'var(--color-primary)' }} />
                    {cert}
                  </li>
                ))}
              </ul>
              <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
                As stated by the trainer.
              </p>
            </div>
          )}

          {trainer.achievements && (
            <div className="rounded-2xl p-4" style={panelStyle}>
              <h3 className="text-white font-semibold mb-2 text-sm flex items-center gap-2">
                <Trophy size={16} style={{ color: 'var(--color-secondary)' }} /> Background
              </h3>
              <p className="text-sm leading-relaxed whitespace-pre-line"
                style={{ color: 'var(--color-text-secondary)' }}>{trainer.achievements}</p>
            </div>
          )}

          <div className="rounded-2xl p-4" style={panelStyle}>
            <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
              <Calendar size={16} style={{ color: 'var(--color-secondary)' }} /> Upcoming classes
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                No classes on the timetable right now. You can still request a 1-on-1 session below.
              </p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((c) => (
                  <div key={c.id} className="rounded-xl p-3"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(c.scheduled_at as string).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {', '}
                        {new Date(c.scheduled_at as string).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {c.location && <span className="flex items-center gap-1"><MapPin size={11} /> {c.location}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/member/book-class', { state: { trainerId: trainer.id } })}
            className="w-full py-3.5 rounded-full font-semibold text-black flex items-center justify-center gap-2"
            style={{ background: 'var(--color-secondary)' }}>
            <Calendar size={18} /> Book with {trainer.first_name}
          </button>
        </>
      )}
    </div>
  );
}