import { useState, useEffect, useCallback } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
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
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, LineRow, SectionHead, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';

/**
 * CORE Points — the balance, what it buys, how you earn, and what you have
 * asked for (Nocturne redesign).
 *
 * ## Earning and spending are separately gated
 *
 * `points_earn` and `points_redeem` are two features (0049), and the ladder
 * turns them on at different tiers. A member who can earn but not yet redeem
 * sees their balance growing and is told plainly what unlocks spending.
 *
 * ## The rules are published, in full, every visit
 *
 * "How do I earn points" is the first question anyone asks, and a scheme that
 * will not answer it is a slot machine. The list comes from `point_rules`, so a
 * double-points week needs no app update. It used to sit collapsed; You now
 * links here as "How you earn points", and a link that lands on a closed
 * accordion has not answered anything.
 *
 * The prototype's version said "Twenty points a check-in… nothing else earns
 * points". The real rule is 10, admin-editable, and five other things earn —
 * which is why this reads the table and never a sentence.
 */

const STATUS: Record<Redemption['status'], { label: string; tone: 'structure' | 'action' | 'muted' }> = {
  pending: { label: 'Waiting for the gym', tone: 'action' },
  approved: { label: 'Approved — collect at the desk', tone: 'structure' },
  rejected: { label: 'Not approved', tone: 'muted' },
  fulfilled: { label: 'Collected', tone: 'muted' },
};

export default function Rewards() {
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

  const title = (
    <PageTitle back title="Spend points"
      subtitle={balance == null ? 'Earn by training. Spend at the desk.' : `${balance.toLocaleString()} available · earn by training, spend at the desk`} />
  );

  if (loading) return <Page>{title}<SkeletonList count={3} /></Page>;

  return (
    <Page>
      {title}
      <FeatureLock feature="points_earn" context={null}>
        <div className="flex flex-col" style={{ gap: 'var(--stack)' }}>
          {error && (
            <p className="flex items-start" style={{ gap: 8, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-secondary)' }}>
              <WarningCircle size={15} className="flex-none" style={{ marginTop: 1 }} /> {error}
            </p>
          )}

          {/* The balance is what a member opens this screen for — the one
              element allowed to be loud. Violet: points are something you have,
              and the amber belongs on Redeem. */}
          <section style={{ padding: '14px 0', borderTop: '1px solid rgba(233, 233, 237, 0.12)', borderBottom: '1px solid rgba(233, 233, 237, 0.12)' }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>CORE points</p>
            <p style={{ fontSize: 38, fontWeight: 600, lineHeight: 1.1, marginTop: 4, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
              {balance == null ? '—' : balance.toLocaleString()}
            </p>
            {!mayRedeem && (
              <p style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.55, color: 'var(--color-secondary)' }}>
                Your plan earns points but does not include spending them yet. They keep adding up — ask the
                front desk which plan lets you spend them.
              </p>
            )}
          </section>

          {/* ── Catalogue ── */}
          <section>
            <SectionHead title="Rewards" meta={rewards.length ? `${rewards.length} to choose from` : undefined} />
            {rewards.length === 0 ? (
              <p style={{ padding: '12px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
                The gym has not added any rewards yet. Your points keep counting.
              </p>
            ) : (
              <div style={{ marginTop: 4 }}>
                {rewards.map((r, i) => {
                  const soldOut = r.stock != null && r.stock <= 0;
                  const affordable = balance != null && balance >= r.costPoints;
                  const disabled = !mayRedeem || soldOut || !affordable || busy === r.id;
                  return (
                    <div key={r.id}>
                      <div className="flex items-center" style={{ gap: 12, padding: '15px 0' }}>
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: 14.5, color: 'var(--color-text-primary)' }}>{r.name}</p>
                          {r.description && (
                            <p style={{ fontSize: 12, marginTop: 3, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>{r.description}</p>
                          )}
                          <p style={{ fontSize: 12.5, marginTop: 6, color: 'var(--color-primary-300)' }}>
                            {r.costPoints.toLocaleString()} points
                            {r.stock != null && !soldOut && <span style={{ color: 'var(--color-text-muted)' }}> · {r.stock} left</span>}
                          </p>
                          {/* Says WHY it is disabled. A greyed button with no
                              reason is the hidden-rulebook problem in miniature. */}
                          {mayRedeem && !soldOut && !affordable && balance != null && (
                            <p style={{ fontSize: 12, marginTop: 4, color: 'var(--color-text-muted)' }}>
                              {(r.costPoints - balance).toLocaleString()} more points to go.
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => redeem(r)}
                          disabled={disabled}
                          className="flex-none disabled:cursor-not-allowed"
                          style={{
                            height: 40, padding: '0 16px', borderRadius: 'var(--radius-btn)', fontSize: 13.5, fontWeight: 600,
                            color: disabled ? 'var(--color-text-muted)' : 'var(--color-secondary)',
                            border: `1px solid ${disabled ? 'var(--color-hairline)' : 'var(--color-secondary)'}`,
                          }}
                        >
                          {busy === r.id ? '…' : soldOut ? 'Sold out' : 'Redeem'}
                        </button>
                      </div>
                      {i < rewards.length - 1 && <div className="hair" />}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Requests ── */}
          {mine.length > 0 && (
            <section>
              <SectionHead title="Your requests" />
              <div style={{ marginTop: 4 }}>
                {mine.map((m, i) => (
                  <div key={m.id}>
                    <div className="flex items-start" style={{ gap: 12, padding: '13px 0' }}>
                      <div className="flex-1 min-w-0">
                        <p className="truncate" style={{ fontSize: 14.5, color: 'var(--color-text-primary)' }}>{m.rewardName}</p>
                        <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 6 }}>
                          <StatusPill label={STATUS[m.status].label} tone={STATUS[m.status].tone} />
                          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{m.costPoints} points</span>
                        </div>
                        {m.decisionNote && (
                          <p style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{m.decisionNote}</p>
                        )}
                      </div>
                      {m.status === 'pending' && (
                        <button onClick={() => withdraw(m.id)} disabled={busy === m.id} className="flex-none disabled:opacity-50"
                          style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                          Withdraw
                        </button>
                      )}
                    </div>
                    {i < mine.length - 1 && <div className="hair" />}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── How you earn ── */}
          {rules.length > 0 && (
            <section>
              <Eyebrow mark>How you earn</Eyebrow>
              <div style={{ marginTop: 4 }}>
                {rules.map((r, i) => (
                  <LineRow
                    key={r.key}
                    title={r.label}
                    action={<span style={{ fontSize: 13.5, color: 'var(--color-primary-300)' }}>+{r.points}</span>}
                    last={i === rules.length - 1}
                  />
                ))}
              </div>
              <p style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                Set by the gym. A plan that does not include earning points does not collect them.
              </p>
            </section>
          )}
        </div>
      </FeatureLock>
    </Page>
  );
}
