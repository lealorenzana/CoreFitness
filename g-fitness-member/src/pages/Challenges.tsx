import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Flag, AlertTriangle, Check, Sparkles, ChevronDown } from 'lucide-react';
import { panelStyle } from '../components/ui/Card';
import FeatureLock from '../components/ui/FeatureLock';
import { getCurrentMemberId } from '../services/bookingService';
import { listChallenges, joinChallenge, leaveChallenge, type Challenge } from '../lib/api/challenges';
import { errorMessage } from '../utils/errorMessage';

/**
 * Gym challenges (migration 0052).
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
  const navigate = useNavigate();
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
    if (!memberId) return;
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

  const Header = (
    <div className="flex items-center gap-3 mb-4">
      <button onClick={() => navigate(-1)}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
        <ArrowLeft size={18} />
      </button>
      <div className="min-w-0">
        <h1 className="display text-xl text-white leading-none">Challenges</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Counted from your real check-ins — nothing to tick off
        </p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {Header}
        <p className="text-xs px-1" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </div>
    );
  }

  return (
    <FeatureLock
      feature="challenges"
      context={<div className="flex-1 min-h-0 flex flex-col">{Header}</div>}
    >
      <div className="flex-1 min-h-0 flex flex-col">
        {Header}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 pb-4">
          {error && (
            <div className="px-3 py-2.5 rounded-xl flex items-start gap-2 text-[11px] leading-relaxed"
                 style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {items.length === 0 ? (
            <div className="p-5 rounded-2xl text-center" style={panelStyle}>
              <Flag size={20} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                No challenges running right now. The gym adds these from time to time.
              </p>
            </div>
          ) : (
            /*
              Three groups, not one list.

              A challenge you finished in March sat between one you are halfway
              through and one you have not joined — the same mixing that made
              Goals unreadable. What you are *doing* comes first, what you could
              join comes next, and what is finished goes behind a button: it is
              a record, and there is nothing left to do on it.
            */
            renderGroups.map(({ key, label, rows, collapsed }) => rows.length === 0 ? null : (
              <div key={key} className="space-y-2">
                {collapsed ? (
                  <button
                    onClick={() => setShowDone((v) => !v)}
                    className="w-full py-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5"
                    style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
                  >
                    <Check size={13} style={{ color: 'var(--color-primary)' }} />
                    {showDone ? 'Hide completed' : `Show ${rows.length} completed`}
                    <ChevronDown size={13} style={{
                      transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform 150ms',
                    }} />
                  </button>
                ) : (
                  <p className="text-[10px] font-bold uppercase tracking-wider px-1"
                    style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                )}
                {(!collapsed || showDone) && rows.map((c) => {
              const pct = c.progress == null ? 0
                : Math.min(100, Math.round((c.progress / c.target) * 100));
              const done = c.completedOn != null;
              const left = daysLeft(c.endsOn);
              return (
                <div key={c.id} className="p-4 rounded-2xl" style={panelStyle}>
                  {/* Only when the gym attached one. */}
                  {c.imageUrl && (
                    <img
                      src={c.imageUrl}
                      alt=""
                      loading="lazy"
                      className="w-full rounded-xl object-cover mb-3"
                      style={{ aspectRatio: '16 / 9', background: 'var(--color-surface-high)' }}
                    />
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">{c.title}</p>
                      {c.description && (
                        <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                          {c.description}
                        </p>
                      )}
                    </div>
                    {done && (
                      <span className="text-[10px] px-2 py-1 rounded-full font-bold flex items-center gap-1 flex-shrink-0"
                            style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                        <Check size={10} /> Done
                      </span>
                    )}
                  </div>

                  {c.joined && (
                    <div className="mt-3">
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                          {c.metricLabel}
                        </span>
                        <span className="text-[11px] font-bold text-white">
                          {c.progress == null ? '—' : c.progress} / {c.target}
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-bg)' }}>
                        <div className="h-full rounded-full transition-all"
                             style={{ width: `${pct}%`, background: 'var(--color-primary)' }} />
                      </div>
                      {c.progress == null && (
                        <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-secondary)' }}>
                          Your progress couldn&apos;t be counted just now — this isn&apos;t zero,
                          it&apos;s unknown.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3">
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      {left === 0 ? 'Ends today' : `${left} day${left === 1 ? '' : 's'} left`}
                      {c.rewardPoints > 0 && (
                        <span style={{ color: 'var(--color-primary)' }}>
                          {' · '}<Sparkles size={9} className="inline" /> {c.rewardPoints} points
                        </span>
                      )}
                    </p>
                    {!done && (
                      <button onClick={() => toggle(c)} disabled={busy === c.id}
                        className="px-3.5 h-9 rounded-full text-[11px] font-bold disabled:opacity-50"
                        style={c.joined
                          ? { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }
                          : { background: 'var(--color-secondary)', color: '#1A1200' }}>
                        {busy === c.id ? '…' : c.joined ? 'Leave' : 'Join'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
              </div>
            ))
          )}
        </div>
      </div>
    </FeatureLock>
  );
}
