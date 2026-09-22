import { useState, useEffect, useCallback } from 'react';
import { useGymApp } from '../hooks/useGymApp';
import { pointsWord } from '../lib/gymApp';
import { useNavigate } from 'react-router-dom';
import { CaretRight, Gift, Package, PushPin, Storefront, WarningCircle } from '@phosphor-icons/react';
import FeatureLock from '../components/ui/FeatureLock';
import GlassSheet from '../components/ui/GlassSheet';
import RedemptionRow from '../components/ui/RedemptionRow';
import { toast } from '../components/ui/Toast';
import { getCurrentMemberId } from '../services/bookingService';
import { useFeatures } from '../hooks/useFeatures';
import { isEnabled } from '../lib/api/planFeatures';
import { requestReward, cancelRedemption, setSavingFor, type Reward } from '../lib/api/points';
import { loadRewards, etaLabel, type RewardsView } from '../services/rewardsService';
import { errorMessage } from '../utils/errorMessage';
import { Page, PageTitle } from '../components/ui/page';
import { Eyebrow, LineRow, NocButton, Panel, ProgressBar, SectionHead, SeeAll } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';

/**
 * CORE Points — the balance, what it buys, how you earn, and what you asked
 * for (Nocturne redesign; reworked 2026-09-19 with 0092).
 *
 *   Balance     with this month's earnings and your weekly pace
 *   Saving for  one pinned reward, its progress and "about N weeks at your
 *               pace" — the gym sees how many members save for each (demand)
 *   Ready       an approved reward waiting at the desk says so, loudly
 *   Rewards     each row shows how close you are; a tap opens its sheet, where
 *               you redeem (with the balance after) or pin it
 *   Requests    the latest three and "See all" — collected ones carry the date
 *   How you earn the gym's rules (point_rules) with how often each paid you
 *               this month
 *
 * `points_earn` and `points_redeem` are separately gated (0049). The rules
 * come from the table, never a sentence typed here.
 */
export default function Rewards() {
  const gymApp = useGymApp();
  const navigate = useNavigate();
  const { features } = useFeatures();
  const mayRedeem = isEnabled(features, 'points_redeem');

  const [memberId, setMemberId] = useState<string | null>(null);
  const [view, setView] = useState<RewardsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Reward | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (id: string) => {
    setView(await loadRewards(id));
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

  const balance = view?.balance ?? null;
  const rewards = view?.rewards ?? [];
  const target = view?.savingFor ? rewards.find((r) => r.id === view.savingFor) ?? null : null;
  const ready = (view?.mine ?? []).filter((m) => m.status === 'approved');

  const redeem = async (reward: Reward) => {
    if (!memberId) return;
    setBusy(reward.id);
    setError(null);
    try {
      await requestReward(memberId, reward);
      // Reaching the target clears it — there is nothing left to save for.
      if (view?.savingFor === reward.id) await setSavingFor(memberId, null).catch(() => {});
      await load(memberId);
      setOpen(null);
      setConfirming(false);
      toast.success('Requested — the gym will let you know when it is ready');
    } catch (err) {
      // The database refuses for reasons worth reading out loud — not enough
      // points, out of stock, not on your plan — so its message is shown as-is.
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const pin = async (reward: Reward | null) => {
    if (!memberId) return;
    setBusy('pin');
    try {
      await setSavingFor(memberId, reward?.id ?? null);
      await load(memberId);
      toast.success(reward ? `Saving for ${reward.name}` : 'No longer saving for anything');
      setOpen(null);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save that'));
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
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const title = (
    <PageTitle back fallback="/member/membership" title="Rewards"
      subtitle="Earn by training · spend at the desk" />
  );

  if (loading) return <Page>{title}<SkeletonList count={3} /></Page>;

  const sheetReward = open;
  const soldOut = (r: Reward) => r.stock != null && r.stock <= 0;

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

          {/* ── Balance and target ── */}
          <Panel glow="structure">
            <Eyebrow>{pointsWord(gymApp)}</Eyebrow>
            <p style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 6, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
              {balance == null ? '—' : balance.toLocaleString()}
            </p>
            {view && !view.ledgerFailed && (
              <p style={{ fontSize: 12.5, marginTop: 6, color: 'var(--color-text-secondary)' }}>
                +{view.earnedThisMonth.toLocaleString()} this month
                {view.perWeek ? ` · about ${view.perWeek} a week lately` : ''}
              </p>
            )}

            {target && balance != null && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-separator)' }}>
                <div className="flex items-center justify-between" style={{ gap: 10 }}>
                  <span className="inline-flex items-center" style={{ gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    <PushPin size={14} weight="fill" style={{ color: 'var(--color-primary-300)' }} aria-hidden /> Saving for {target.name}
                  </span>
                  <button onClick={() => setOpen(target)} style={{ fontSize: 12.5, color: 'var(--color-primary-300)' }}>Change</button>
                </div>
                <ProgressBar style={{ marginTop: 10 }} fraction={Math.min(1, balance / target.costPoints)} />
                <p style={{ fontSize: 12, marginTop: 7, color: 'var(--color-text-secondary)' }}>
                  {balance >= target.costPoints
                    ? 'You have enough — redeem it whenever you like.'
                    : `${(target.costPoints - balance).toLocaleString()} to go${etaLabel(target.costPoints, balance, view?.perWeek ?? null) ? ` · ${etaLabel(target.costPoints, balance, view?.perWeek ?? null)}` : ''}`}
                </p>
              </div>
            )}
            {!target && view?.savingFor !== undefined && rewards.length > 0 && (
              <p style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                Tap a reward below and pin it to track how close you are.
              </p>
            )}

            {!mayRedeem && (
              <p style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.55, color: 'var(--color-secondary)' }}>
                Your plan earns points but does not include spending them yet. They keep adding up — ask the
                front desk which plan lets you spend them.
              </p>
            )}
          </Panel>

          {/* ── Waiting at the desk ── */}
          {ready.length > 0 && (
            <div className="flex items-start" style={{
              gap: 12, padding: 14, borderRadius: 14, border: '1px solid color-mix(in srgb, var(--color-secondary) 45%, transparent)',
              background: 'color-mix(in srgb, var(--color-secondary) 8%, transparent)',
            }}>
              <Package size={20} weight="fill" style={{ color: 'var(--color-secondary)', flex: 'none', marginTop: 1 }} aria-hidden />
              <div className="min-w-0">
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {ready.length === 1 ? `${ready[0].rewardName} is ready` : `${ready.length} rewards are ready`}
                </p>
                <p style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-secondary)' }}>
                  Collect at the front desk — they mark it handed over.
                </p>
              </div>
            </div>
          )}

          {/* ── Rewards ── */}
          <section>
            <SectionHead title="Rewards" meta={rewards.length ? `${rewards.length} to choose from` : undefined} />
            {rewards.length === 0 ? (
              <p style={{ padding: '12px 0', fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-muted)' }}>
                The gym has not listed any rewards right now. Your points keep counting.
              </p>
            ) : (
              <div className="noc-rows" style={{ marginTop: 4 }}>
                {rewards.map((r, i) => {
                  const out = soldOut(r);
                  const canGet = balance != null && balance >= r.costPoints && !out;
                  return (
                    <button key={r.id} onClick={() => { setOpen(r); setConfirming(false); }}
                      className="w-full flex items-center text-left noc-row"
                      style={{ gap: 12, padding: '14px 0', borderBottom: i === rewards.length - 1 ? 'none' : '1px solid var(--color-separator)' }}>
                      <span className="flex-none grid place-items-center orb-cell" aria-hidden
                        style={{ width: 42, height: 42, borderRadius: 12, color: canGet ? 'var(--color-secondary)' : 'var(--color-primary-300)' }}>
                        {r.id === target?.id ? <PushPin size={18} weight="fill" /> : <Gift size={18} />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.name}</span>
                        <span className="block" style={{ fontSize: 12, marginTop: 2, color: out ? 'var(--color-text-muted)' : canGet ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }}>
                          {r.costPoints.toLocaleString()} points
                          {out ? ' · sold out' : canGet ? ' · you can get this' : balance != null ? ` · ${(r.costPoints - balance).toLocaleString()} to go` : ''}
                          {!out && r.stock != null && r.stock <= 5 ? ` · ${r.stock} left` : ''}
                        </span>
                        {!out && balance != null && !canGet && (
                          <ProgressBar style={{ marginTop: 7, height: 3 }} fraction={balance / r.costPoints} />
                        )}
                      </span>
                      <CaretRight size={15} className="flex-none" style={{ color: 'var(--color-text-muted)' }} aria-hidden />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Requests ── */}
          {(view?.mine.length ?? 0) > 0 && (
            <section>
              <SectionHead title="Your requests" />
              <div style={{ marginTop: 4 }}>
                {view!.mine.slice(0, 3).map((m, i, arr) => (
                  <RedemptionRow key={m.id} m={m} last={i === arr.length - 1} busy={busy === m.id} onWithdraw={() => void withdraw(m.id)} />
                ))}
              </div>
              {view!.mine.length > 3 && (
                <SeeAll label="See all requests" count={view!.mine.length} onClick={() => navigate('/member/rewards/requests')} />
              )}
            </section>
          )}

          {/* ── How you earn ── */}
          {(view?.rules.length ?? 0) > 0 && (
            <section>
              <SectionHead title="How you earn" meta="set by the gym" />
              <div style={{ marginTop: 4 }}>
                {view!.rules.map((r, i) => {
                  const n = view!.ruleCounts[r.key] ?? 0;
                  return (
                    <LineRow
                      key={r.key}
                      title={r.label}
                      meta={n > 0 ? `${n}× this month · +${(n * r.points).toLocaleString()}` : undefined}
                      action={<span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-primary-300)' }}>+{r.points}</span>}
                      last={i === view!.rules.length - 1}
                    />
                  );
                })}
              </div>
              <SeeAll label="Your points history" onClick={() => navigate('/member/activity?filter=points')} />
            </section>
          )}
        </div>
      </FeatureLock>

      {/* ── A reward, opened ── */}
      <GlassSheet
        open={sheetReward != null}
        onClose={() => { setOpen(null); setConfirming(false); }}
        title={sheetReward?.name ?? ''}
        subtitle={sheetReward ? `${sheetReward.costPoints.toLocaleString()} points${sheetReward.stock != null ? ` · ${sheetReward.stock} left` : ''}` : undefined}
        footer={sheetReward ? (() => {
          const out = soldOut(sheetReward);
          const enough = balance != null && balance >= sheetReward.costPoints;
          const pinned = view?.savingFor === sheetReward.id;
          return (
            <div className="flex flex-col" style={{ gap: 8 }}>
              {confirming ? (
                <NocButton variant="fill" className="w-full" disabled={busy === sheetReward.id}
                  icon={<Storefront size={16} />} onClick={() => void redeem(sheetReward)}>
                  {busy === sheetReward.id ? 'Requesting…' : `Yes, spend ${sheetReward.costPoints.toLocaleString()} points`}
                </NocButton>
              ) : (
                <NocButton variant="action" className="w-full" disabled={!mayRedeem || out || !enough}
                  onClick={() => setConfirming(true)}>
                  {!mayRedeem ? 'Spending is not on your plan' : out ? 'Sold out' : enough ? 'Redeem' : `${(sheetReward.costPoints - (balance ?? 0)).toLocaleString()} more points needed`}
                </NocButton>
              )}
              {view?.savingFor !== undefined && !out && (
                <NocButton variant="ghost" className="w-full" disabled={busy === 'pin'}
                  icon={<PushPin size={15} weight={pinned ? 'fill' : 'regular'} />}
                  onClick={() => void pin(pinned ? null : sheetReward)}>
                  {pinned ? 'Stop saving for this' : 'Save for this'}
                </NocButton>
              )}
            </div>
          );
        })() : undefined}
      >
        {sheetReward && (
          <div className="flex flex-col" style={{ gap: 14 }}>
            {sheetReward.description && (
              <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{sheetReward.description}</p>
            )}
            {balance != null && (
              <div>
                <ProgressBar fraction={Math.min(1, balance / sheetReward.costPoints)} />
                <p style={{ fontSize: 12.5, marginTop: 8, color: 'var(--color-text-secondary)' }}>
                  {balance >= sheetReward.costPoints
                    ? `You have ${balance.toLocaleString()} — ${(balance - sheetReward.costPoints).toLocaleString()} left after this.`
                    : `${balance.toLocaleString()} of ${sheetReward.costPoints.toLocaleString()}${etaLabel(sheetReward.costPoints, balance, view?.perWeek ?? null) ? ` · ${etaLabel(sheetReward.costPoints, balance, view?.perWeek ?? null)}` : ''}`}
                </p>
              </div>
            )}
            {confirming && (
              <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-primary)' }}>
                The points are set aside now. The gym approves it, then you collect it at the front desk.
                If they decline, your points come back.
              </p>
            )}
          </div>
        )}
      </GlassSheet>
    </Page>
  );
}
