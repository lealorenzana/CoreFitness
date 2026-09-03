import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, AlertTriangle, Clock, Check, X, Sparkles } from 'lucide-react';
import { panelStyle } from '../components/ui/Card';
import FeatureLock from '../components/ui/FeatureLock';
import { getCurrentMemberId } from '../services/bookingService';
import { useFeatures } from '../hooks/useFeatures';
import { isEnabled } from '../lib/api/planFeatures';
import {
  getBalance, listRules, listRewards, listMyRedemptions,
  requestReward, cancelRedemption,
  type PointRule, type Reward, type Redemption,
} from '../lib/api/points';
import { errorMessage } from '../utils/errorMessage';

/**
 * CORE Points — the balance, what it buys, and what you have asked for.
 *
 * ## Earning and spending are separately gated
 *
 * `points_earn` and `points_redeem` are two features (0049), and the ladder
 * turns them on at different tiers. A member who can earn but not yet redeem
 * sees their balance growing and is told plainly what unlocks spending — which
 * is the honest version of that state, and a better upgrade argument than
 * hiding the screen.
 *
 * ## The rules are published
 *
 * "How do I earn points" is the first question anyone asks, and a scheme that
 * will not answer it is a slot machine. The table comes from `point_rules`, so
 * a gym running a double-points week does not have to ship an app update for
 * the screen to say so.
 */

const STATUS_LABEL: Record<Redemption['status'], string> = {
  pending: 'Waiting for the gym',
  approved: 'Approved — collect at the desk',
  rejected: 'Not approved',
  fulfilled: 'Collected',
};

export default function Rewards() {
  const navigate = useNavigate();
  const { features } = useFeatures();
  const mayRedeem = isEnabled(features, 'points_redeem');

  const [memberId, setMemberId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [rules, setRules] = useState<PointRule[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [mine, setMine] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const [b, r, w, m] = await Promise.all([
      getBalance(id), listRules(), listRewards(), listMyRedemptions(id),
    ]);
    setBalance(b); setRules(r); setRewards(w); setMine(m);
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
        // Named, never degraded to a zero balance — "you have 0 points" is a
        // claim, and a wrong one here would look like the gym took them away.
        if (alive) setError(errorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [load]);

  const redeem = async (reward: Reward) => {
    if (!memberId) return;
    setBusy(reward.id);
    setError(null);
    try {
      await requestReward(memberId, reward);
      await load(memberId);
    } catch (err) {
      // The database refuses for reasons worth reading out loud — not enough
      // points, out of stock, not on your plan — so its message is shown as-is.
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (id: string) => {
    if (!memberId) return;
    setBusy(id);
    try {
      await cancelRedemption(id);
      await load(memberId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const Header = (
    <div className="flex items-center gap-3 mb-4">
      <button onClick={() => navigate(-1)}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
        <ArrowLeft size={18} />
      </button>
      <div className="min-w-0">
        <h1 className="display text-xl text-white leading-none">CORE Points</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Earn by training. Spend at the desk.
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
      feature="points_earn"
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

          {/* ── Balance ────────────────────────────────────────────────────── */}
          <div className="p-5 rounded-2xl text-center" style={panelStyle}>
            <Sparkles size={20} className="mx-auto mb-2" style={{ color: 'var(--color-primary)' }} />
            <p className="display text-4xl text-white leading-none">
              {balance == null ? '—' : balance.toLocaleString()}
            </p>
            <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
              points available to spend
            </p>
            {!mayRedeem && (
              <p className="text-[10px] mt-3 leading-relaxed" style={{ color: 'var(--color-secondary)' }}>
                Your plan earns points but does not include redeeming them yet.
                They keep adding up — ask the front desk which plan lets you spend them.
              </p>
            )}
          </div>

          {/* ── How to earn ────────────────────────────────────────────────── */}
          <div className="p-4 rounded-2xl" style={panelStyle}>
            <p className="text-xs font-bold text-white mb-2.5">How you earn</p>
            <div className="space-y-1.5">
              {rules.map((r) => (
                <div key={r.key} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{r.label}</span>
                  <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                    +{r.points}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Catalogue ──────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-bold text-white mb-2 px-1">Rewards</p>
            {rewards.length === 0 ? (
              <div className="p-5 rounded-2xl text-center" style={panelStyle}>
                <Gift size={20} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  The gym has not added any rewards yet. Your points keep counting.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rewards.map((r) => {
                  const soldOut = r.stock != null && r.stock <= 0;
                  const affordable = balance != null && balance >= r.costPoints;
                  return (
                    <div key={r.id} className="p-4 rounded-2xl" style={panelStyle}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white">{r.name}</p>
                          {r.description && (
                            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                              {r.description}
                            </p>
                          )}
                          <p className="text-[11px] mt-1.5 font-semibold" style={{ color: 'var(--color-primary)' }}>
                            {r.costPoints.toLocaleString()} points
                            {r.stock != null && !soldOut && (
                              <span style={{ color: 'var(--color-text-muted)' }}> · {r.stock} left</span>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => redeem(r)}
                          disabled={!mayRedeem || soldOut || !affordable || busy === r.id}
                          className="px-3 h-9 rounded-full text-[11px] font-bold flex-shrink-0 disabled:opacity-35"
                          style={{ background: 'var(--color-secondary)', color: '#1A1200' }}
                        >
                          {busy === r.id ? '…' : soldOut ? 'Sold out' : 'Redeem'}
                        </button>
                      </div>
                      {/* Says WHY it is disabled. A greyed button with no reason
                          is the hidden-rulebook problem in miniature. */}
                      {mayRedeem && !soldOut && !affordable && balance != null && (
                        <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
                          {(r.costPoints - balance).toLocaleString()} more points to go.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── My requests ────────────────────────────────────────────────── */}
          {mine.length > 0 && (
            <div>
              <p className="text-xs font-bold text-white mb-2 px-1">Your requests</p>
              <div className="space-y-2">
                {mine.map((m) => (
                  <div key={m.id} className="p-3.5 rounded-2xl" style={panelStyle}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{m.rewardName}</p>
                        <p className="text-[10px] mt-0.5 flex items-center gap-1"
                           style={{ color: m.status === 'rejected' ? 'var(--color-secondary)' : 'var(--color-text-muted)' }}>
                          {m.status === 'pending' ? <Clock size={9} />
                            : m.status === 'rejected' ? <X size={9} /> : <Check size={9} />}
                          {STATUS_LABEL[m.status]} · {m.costPoints} points
                        </p>
                        {m.decisionNote && (
                          <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                            {m.decisionNote}
                          </p>
                        )}
                      </div>
                      {m.status === 'pending' && (
                        <button onClick={() => withdraw(m.id)} disabled={busy === m.id}
                          className="text-[10px] font-semibold flex-shrink-0 px-2.5 h-8 rounded-full"
                          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                          Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </FeatureLock>
  );
}
