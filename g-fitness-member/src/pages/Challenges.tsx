import { useState, useEffect, useCallback } from 'react';
import { Check, WarningCircle } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, NocButton, Panel, ProgressBar, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import FeatureLock from '../components/ui/FeatureLock';
import { getCurrentMemberId } from '../services/bookingService';
import { listChallenges, joinChallenge, leaveChallenge, type Challenge } from '../lib/api/challenges';
import { errorMessage } from '../utils/errorMessage';

/**
 * Gym challenges (migration 0052, Nocturne redesign).
 *
 * ## The progress bar is the whole feature
 *
 * Nobody ticks anything off. The number under each bar is counted from real
 * check-ins and workout logs inside the challenge's own window, so a member can
 * trust it and cannot inflate it. A bar that cannot be computed shows "—"
 * rather than 0: "you have done nothing" is a claim, and a wrong one here would
 * be discouraging for no reason.
 *
 * ## There is no leaderboard, deliberately
 *
 * Ranking participants would publish one member's attendance to another. 0032
 * exists precisely because members choose what is shared, and a leaderboard
 * would quietly override that choice for everyone who joined.
 */

function daysLeft(endsOn: string): number {
  const end = new Date(`${endsOn}T23:59:59+08:00`).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

export default function Challenges() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [items, setItems] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setItems(await listChallenges(id));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = await getCurrentMemberId();
        if (!id) throw new Error('Could not identify your account.');
        if (!alive) return;
        setMemberId(id);
        await load(id);
      } catch (err) {
        if (alive) setError(errorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [load]);

  const toggle = async (c: Challenge) => {
    // `busy` guards a double tap: the join card is a whole-panel target with
    // no `disabled` of its own, and two taps would send two joins.
    if (!memberId || busy) return;
    setBusy(c.id);
    setError(null);
    try {
      if (c.joined) await leaveChallenge(c.id, memberId);
      else await joinChallenge(c.id, memberId);
      await load(memberId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  /**
   * In progress, then available, then finished.
   *
   * `completedOn` is the only hard boundary; "joined" separates the two live
   * groups. Order within each is left exactly as the query returned it — the
   * gym decides what is featured, and re-sorting here would quietly override
   * that.
   */
  const renderGroups = [
    { key: 'active',    label: 'In progress',    rows: items.filter((c) => c.joined && c.completedOn == null),  collapsed: false },
    { key: 'available', label: 'Open to join',   rows: items.filter((c) => !c.joined && c.completedOn == null), collapsed: false },
    { key: 'done',      label: 'Completed',      rows: items.filter((c) => c.completedOn != null),              collapsed: true  },
  ];

  const title = (
    <PageTitle back title="Challenges" subtitle="Counted from your real check-ins — nothing to tick off" />
  );

  if (loading) return <Page>{title}<SkeletonList count={3} /></Page>;

  return (
    <Page>
      {title}
      {/* One scroller, the page's own. This used to scroll inside an inner
          `overflow-y-auto` that owed the floating dock its own clearance — one
          of the two screens CLAUDE.md names for exactly that. */}
      <FeatureLock feature="challenges" context={null}>
        <div className="flex flex-col" style={{ gap: 'var(--stack)' }}>
          {error && (
            <p className="flex items-start" style={{ gap: 8, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-secondary)' }}>
              <WarningCircle size={15} className="flex-none" style={{ marginTop: 1 }} /> {error}
            </p>
          )}

          {items.length === 0 ? (
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
              No challenges running right now. The gym adds these from time to time.
            </p>
          ) : (
            /* Three groups, not one list: what you are doing, what you could
               join, and — behind a control — what is finished, which is a record
               with nothing left to do on it. */
            renderGroups.map(({ key, label, rows, collapsed }) => rows.length === 0 ? null : (
              <section key={key} className="flex flex-col" style={{ gap: 12 }}>
                {collapsed ? (
                  <NocButton variant="ghost" icon={<Check size={15} />} onClick={() => setShowDone((v) => !v)}>
                    {showDone ? 'Hide completed' : `Show ${rows.length} completed`}
                  </NocButton>
                ) : (
                  <Eyebrow mark={key === 'active'}>{label}</Eyebrow>
                )}
                {(!collapsed || showDone) && rows.map((c) => {
                  const done = c.completedOn != null;
                  const left = daysLeft(c.endsOn);

                  /*
                    The whole card joins; only leaving needs aiming at.

                    Every card looked like a control and only a 60px pill was one,
                    so tapping the title did nothing — a broken screen, to a
                    member. An unjoined challenge *is* the button. The asymmetry is
                    deliberate: joining is undone by one tap, leaving gives up a
                    place you may be seven sessions into, so the safe direction
                    gets the big target. Never a <button> inside a <button>: when
                    the card is the control, the "Join" word is a <span>.
                  */
                  const cardJoins = !c.joined && !done;

                  const body = (
                    <>
                      {c.imageUrl && (
                        <img src={c.imageUrl} alt="" loading="lazy" className="w-full object-cover"
                          style={{ aspectRatio: '16 / 9', marginBottom: 12, borderRadius: 10, background: 'var(--color-surface-high)' }} />
                      )}
                      <div className="flex items-start justify-between" style={{ gap: 12 }}>
                        <div className="min-w-0">
                          <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.title}</p>
                          {c.description && (
                            <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>{c.description}</p>
                          )}
                        </div>
                        {done && <StatusPill label="Done" tone="structure" />}
                      </div>

                      {c.joined && (
                        <div style={{ marginTop: 14 }}>
                          <div className="flex items-baseline justify-between" style={{ fontSize: 12 }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>{c.metricLabel}</span>
                            <span style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>
                              {c.progress == null ? '—' : c.progress} / {c.target}
                            </span>
                          </div>
                          {/* No bar for an unknown count — "you have done nothing"
                              is a claim, and a wrong one would discourage for no
                              reason. The sentence says it is unknown, not zero. */}
                          <ProgressBar style={{ marginTop: 9 }}
                            fraction={c.progress == null || c.target <= 0 ? null : c.progress / c.target} />
                          {c.progress == null && (
                            <p style={{ fontSize: 12, marginTop: 6, color: 'var(--color-secondary)' }}>
                              Your progress could not be counted just now — this is unknown, not zero.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between" style={{ gap: 12, marginTop: 14 }}>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {left === 0 ? 'Ends today' : `${left} day${left === 1 ? '' : 's'} left`}
                          {c.rewardPoints > 0 && (
                            <span style={{ color: 'var(--color-primary-300)' }}> · {c.rewardPoints} points</span>
                          )}
                        </p>
                        {cardJoins ? (
                          <span className="flex-none grid place-items-center" style={{
                            height: 36, padding: '0 15px', borderRadius: 'var(--radius-btn)', fontSize: 13, fontWeight: 500,
                            color: 'var(--color-secondary)', border: '1px solid var(--color-secondary)',
                            opacity: busy === c.id ? 0.5 : 1,
                          }}>
                            {busy === c.id ? '…' : 'Join'}
                          </span>
                        ) : !done ? (
                          <button onClick={() => toggle(c)} disabled={busy === c.id} className="flex-none disabled:opacity-50"
                            style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                            {busy === c.id ? '…' : 'Leave'}
                          </button>
                        ) : null}
                      </div>
                    </>
                  );

                  return cardJoins ? (
                    <Panel key={c.id} onClick={() => toggle(c)} ariaLabel={`Join ${c.title}`}>{body}</Panel>
                  ) : (
                    // Joined is filled: the one you are in reads first.
                    <Panel key={c.id} filled={c.joined && !done}>{body}</Panel>
                  );
                })}
              </section>
            ))
          )}
        </div>
      </FeatureLock>
    </Page>
  );
}
