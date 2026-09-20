import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarBlank, MagnifyingGlass, Target, X } from '@phosphor-icons/react';
import Avatar from '../components/ui/Avatar';
import { SkeletonList } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { TextInput, Select } from '../components/ui/Field';
import { errorMessage } from '../utils/errorMessage';
import { RatingLine } from '../components/ui/StarRating';
import { getCurrentMemberId } from '../services/bookingService';
import {
  loadCoachDirectory, goalMatches, goalScore, slotLabel, GOALS, type CoachCard, type Goal,
} from '../services/coachDirectoryService';
import { Page, PageTitle } from '../components/ui/page';
import { Chip, Eyebrow, Panel, StatusPill } from '../components/ui/noc';

/**
 * The gym's coaching team, as a member sees it (reworked 2026-09-19).
 *
 *   Find your coach   pick what you want to work on; coaches are ranked by
 *                     their own words and the words that matched are shown
 *   Your coaches      the ones you have trained with, with Book again
 *   All coaches       search, sort, and on every row the next free 1-on-1 —
 *                     computed exactly as the booking screen computes it
 *
 * Ratings are real (0042) and withheld until three exist. Book goes straight
 * to that coach's 1-on-1 times on the booking screen.
 */

type Sort = 'recommended' | 'soonest' | 'rated' | 'name';

function CoachRow({ c, goal, onOpen, onBook, last }: {
  c: CoachCard; goal: Goal | null; onOpen: () => void; onBook: () => void; last: boolean;
}) {
  const matched = goal ? goalMatches(c.trainer, goal) : [];
  return (
    <div className="flex items-center" style={{
      gap: 12, padding: '14px 0', borderBottom: last ? 'none' : '1px solid var(--color-separator)',
    }}>
      <button onClick={onOpen} className="flex-1 min-w-0 flex items-start text-left noc-press-soft" style={{ gap: 12 }}
        aria-label={`${c.name}, ${c.trainer.specialization ?? 'coach'}. Open profile`}>
        <Avatar name={c.name} photoUrl={c.trainer.photo_url} size={48} />
        <span className="flex-1 min-w-0">
          <span className="flex items-center" style={{ gap: 8 }}>
            <span className="truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.name}</span>
            {c.yours && <StatusPill label="Your coach" tone="structure" />}
          </span>
          <span className="block truncate" style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-secondary)' }}>
            {c.trainer.specialization ?? 'General training'}
            {c.trainer.years_experience ? ` · ${c.trainer.years_experience} yrs` : ''}
          </span>
          <span className="block" style={{ marginTop: 5 }}>
            <RatingLine average={c.rating?.average_stars ?? null} count={c.rating?.rating_count ?? 0} size={12} />
          </span>
          <span className="flex items-center" style={{ gap: 5, marginTop: 6, fontSize: 12 }}>
            <CalendarBlank size={13} aria-hidden style={{ color: c.nextFree ? 'var(--color-primary-300)' : 'var(--color-text-muted)', flex: 'none' }} />
            <span style={{ color: c.nextFree ? 'var(--color-primary-300)' : 'var(--color-text-muted)' }}>
              {!c.hoursKnown ? 'Open times could not be read'
                : c.nextFree ? `Next free 1-on-1 · ${slotLabel(c.nextFree)}`
                : 'No open 1-on-1 in the next 2 weeks'}
            </span>
          </span>
          {matched.length > 0 && (
            <span className="block" style={{ fontSize: 12, marginTop: 4, color: 'var(--color-secondary)' }}>
              Matches: {matched.join(', ')}
            </span>
          )}
        </span>
      </button>
      <button onClick={onBook} className="flex-none noc-press" style={{
        height: 36, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
        color: 'var(--color-secondary)',
        background: 'color-mix(in srgb, var(--color-secondary) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-secondary) 35%, transparent)',
      }} aria-label={`Book a 1-on-1 with ${c.name}`}>
        Book
      </button>
    </div>
  );
}

export default function Trainers() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<CoachCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recommended');
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentMemberId().catch(() => null);
        const list = await loadCoachDirectory(id);
        if (!cancelled) setCards(list);
      } catch (err) {
        if (!cancelled) toast.error(errorMessage(err, 'Could not load the coaches'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const goal = GOALS.find((g) => g.id === goalId) ?? null;
  const q = query.trim().toLowerCase();

  const ranked = useMemo(() => {
    const byRating = (a: CoachCard, b: CoachCard) => (b.rating?.average_stars ?? -1) - (a.rating?.average_stars ?? -1);
    const bySoonest = (a: CoachCard, b: CoachCard) => (a.nextFree ?? '9999').localeCompare(b.nextFree ?? '9999');
    let list = cards.filter((c) => !q || [c.name, c.trainer.specialization ?? '', ...(c.trainer.focus_areas ?? [])]
      .some((f) => f.toLowerCase().includes(q)));
    if (goal) list = list.filter((c) => goalScore(c.trainer, goal) > 0);
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'rated') return byRating(a, b) || a.name.localeCompare(b.name);
      if (sort === 'soonest') return bySoonest(a, b) || a.name.localeCompare(b.name);
      // Recommended: the goal first, then coaches you know, then who is free soonest.
      return (goal ? goalScore(b.trainer, goal) - goalScore(a.trainer, goal) : 0)
        || Number(b.yours) - Number(a.yours)
        || bySoonest(a, b) || byRating(a, b);
    });
  }, [cards, goal, q, sort]);

  const yours = cards.filter((c) => c.yours)
    .sort((a, b) => (b.lastWithYou ?? '').localeCompare(a.lastWithYou ?? ''));
  const freeThisWeek = cards.filter((c) => c.nextFree && new Date(c.nextFree).getTime() - now < 7 * 86_400_000).length;
  const book = (c: CoachCard) => navigate('/member/book-class', { state: { trainerId: c.trainer.id } });
  const open = (c: CoachCard) => navigate(`/member/trainer/${c.trainer.id}`);
  const plain = !goal && !q;

  return (
    <Page>
      <PageTitle back title="Coaches"
        subtitle={loading || cards.length === 0 ? 'The coaching team at your gym'
          : `${cards.length} at the gym · ${freeThisWeek} with 1-on-1 time this week`} />

      {loading ? (
        <SkeletonList />
      ) : cards.length === 0 ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          The gym has not added its coaching team to the app yet.
        </p>
      ) : (
        <>
          {/* ── Find your coach ── */}
          <Panel glow={goal ? 'action' : 'structure'}>
            <div className="flex items-center justify-between" style={{ gap: 10 }}>
              <Eyebrow tone={goal ? 'action' : undefined}>
                <span className="inline-flex items-center" style={{ gap: 6 }}><Target size={13} weight="bold" /> Find your coach</span>
              </Eyebrow>
              {goal && (
                <button onClick={() => setGoalId(null)} className="inline-flex items-center"
                  style={{ gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  <X size={12} /> Clear
                </button>
              )}
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, marginTop: 8, color: 'var(--color-text-primary)' }}>
              What do you want to work on?
            </p>
            <div className="flex flex-wrap" style={{ gap: 8, marginTop: 12 }}>
              {GOALS.map((g) => (
                <Chip key={g.id} label={g.label} on={goalId === g.id} onClick={() => setGoalId(goalId === g.id ? null : g.id)} />
              ))}
            </div>
            {goal && (
              <p style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                Matched on what each coach says about themselves — their specialization, focus and certificates.
                A starting point, not a verdict: open a profile or ask at the desk.
              </p>
            )}
          </Panel>

          {/* ── Your coaches ── */}
          {plain && yours.length > 0 && (
            <section>
              <Eyebrow mark>Your coaches</Eyebrow>
              <div className="noc-rows" style={{ marginTop: 4 }}>
                {yours.map((c, i) => (
                  <div key={c.trainer.id} className="flex items-center" style={{
                    gap: 12, padding: '12px 0', borderBottom: i === yours.length - 1 ? 'none' : '1px solid var(--color-separator)',
                  }}>
                    <button onClick={() => open(c)} className="flex-1 min-w-0 flex items-center text-left noc-press-soft" style={{ gap: 12 }}>
                      <Avatar name={c.name} photoUrl={c.trainer.photo_url} size={40} />
                      <span className="min-w-0">
                        <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.name}</span>
                        <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                          {c.lastWithYou ? `Last session ${new Date(c.lastWithYou).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                          {c.nextFree ? ` · free ${slotLabel(c.nextFree)}` : ''}
                        </span>
                      </span>
                    </button>
                    <button onClick={() => book(c)} className="flex-none"
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-secondary)' }}>
                      Book again
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── All coaches ── */}
          <section>
            <div className="flex items-center justify-between" style={{ gap: 12 }}>
              <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {goal ? `Best for “${goal.label.toLowerCase()}”` : 'All coaches'}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}> · {ranked.length}</span>
              </h2>
              <Select aria-label="Sort coaches" value={sort} onChange={(e) => setSort(e.target.value as Sort)}
                style={{ width: 'auto', height: 36, fontSize: 13, padding: '0 30px 0 12px' }}>
                <option value="recommended">{goal ? 'Best match' : 'Recommended'}</option>
                <option value="soonest">Soonest free</option>
                <option value="rated">Top rated</option>
                <option value="name">A–Z</option>
              </Select>
            </div>
            <label className="flex items-center" style={{
              gap: 10, height: 44, marginTop: 12, padding: '0 14px', borderRadius: 'var(--radius-btn)',
              background: 'var(--color-surface)', border: '1px solid var(--color-hairline)',
            }}>
              <MagnifyingGlass size={17} aria-hidden style={{ color: 'var(--color-text-muted)', flex: 'none' }} />
              <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or specialty"
                aria-label="Search coaches" className="flex-1 min-w-0"
                style={{ border: 'none', background: 'transparent', height: 42, padding: 0, fontSize: 14.5 }} />
            </label>
            {ranked.length === 0 ? (
              <p style={{ fontSize: 13, marginTop: 12, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
                {goal && !q ? `No coach mentions ${goal.label.toLowerCase()} in their profile yet. Ask at the desk — they know the team.`
                  : 'No coach matches that search.'}
              </p>
            ) : (
              <div className="noc-rows" style={{ marginTop: 4 }}>
                {ranked.map((c, i) => (
                  <CoachRow key={c.trainer.id} c={c} goal={goal} last={i === ranked.length - 1}
                    onOpen={() => open(c)} onBook={() => book(c)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
