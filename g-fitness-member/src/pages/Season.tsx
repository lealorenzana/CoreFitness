import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGymApp } from '../hooks/useGymApp';
import { moduleOn } from '../lib/gymApp';
import { Trophy } from '@phosphor-icons/react';
import { Page, PageTitle } from '../components/ui/page';
import { LineRow, NocButton, Panel, ProgressBar, SectionHead, StatusPill } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';
import GymGoalStrip from '../components/workout/GymGoalStrip';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { getCurrentMemberId } from '../services/bookingService';
import {
  claimTier, getShowOnBoards, myClaims, mySeason, personalRecords, prWall, recordValue, seasonBoard,
  seasonTiers, setShowOnBoards, type BoardRow, type Record_, type Season as SeasonT, type Tier, type WallRow,
} from '../lib/api/season';

const monthName = (iso: string) => new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-US', { month: 'long' });
const daysLeft = (end: string) =>
  Math.max(0, Math.ceil((new Date(`${end}T23:59:59+08:00`).getTime() - Date.now()) / 86_400_000));

/**
 * This month's season (0123): the points you earned this month, the gym's
 * tiers and their rewards, the board, this week's records, and your own.
 *
 * Every figure is the database's. The score is `sum(point_ledger)` for the
 * Manila month, so it can go down when the desk removes a false record — and
 * the page says "this month", never "your points", because spending comes out
 * of the balance, not the season.
 *
 * The board and the record wall show only members who chose to be on them; the
 * switch here is how. Your own rank and records are shown to you either way.
 */
export default function Season() {
  const gymApp = useGymApp();
  const navigate = useNavigate();
  const [season, setSeason] = useState<SeasonT | null | undefined>(undefined);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [claims, setClaims] = useState<Map<string, boolean>>(new Map());
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [wall, setWall] = useState<WallRow[]>([]);
  const [records, setRecords] = useState<Record_[] | null>(null);
  const [onBoards, setOnBoards] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const me = await getCurrentMemberId();
    const s = await mySeason();
    setSeason(s);
    if (!s) return;
    const [t, c, b, w, r, o] = await Promise.all([
      seasonTiers(), myClaims(s.start), seasonBoard(), prWall(),
      me ? personalRecords(me) : Promise.resolve(null), me ? getShowOnBoards(me) : Promise.resolve(null),
    ]);
    setTiers(t); setClaims(c); setBoard(b); setWall(w); setRecords(r); setOnBoards(o);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  if (season === undefined) return <Page><PageTitle back title="Season" /><SkeletonList /></Page>;
  if (season === null) {
    return (
      <Page>
        <PageTitle back title="Season" />
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Seasons are not switched on at your gym yet.
        </p>
      </Page>
    );
  }

  const next = tiers.find((t) => t.pointsNeeded > season.score) ?? null;
  const prevNeeded = [...tiers].reverse().find((t) => t.pointsNeeded <= season.score)?.pointsNeeded ?? 0;
  const left = daysLeft(season.end);

  const claim = async (t: Tier) => {
    setBusy(true);
    try {
      await claimTier(t.id);
      toast.success(t.rewardName ? `Claimed. Collect your ${t.rewardName} at the desk.` : `${t.name} claimed.`);
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'That could not be claimed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleBoards = async () => {
    if (onBoards === null) return;
    setBusy(true);
    try {
      await setShowOnBoards(!onBoards);
      toast.success(!onBoards ? 'You are on the boards now.' : 'You are off the boards. Your own rank still shows here.');
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'That could not be changed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageTitle back fallback="/member/challenges" title={`${monthName(season.start)} season`}
        subtitle={left === 0 ? 'Ends today — a new one starts tomorrow' : `${left} day${left === 1 ? '' : 's'} left · everyone starts again on the 1st`} />

      <Panel>
        <p className="tabular-nums" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: 'var(--color-text-primary)' }}>
          {season.score.toLocaleString()}
          <span style={{ fontSize: 14, fontWeight: 600, marginLeft: 6, color: 'var(--color-text-muted)' }}>points this month</span>
        </p>
        {season.rank != null && (
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--color-text-secondary)' }}>
            You are #{season.rank} of {season.ranked} in the gym
          </p>
        )}
        {next ? (
          <>
            <ProgressBar style={{ marginTop: 12 }}
              fraction={(season.score - prevNeeded) / Math.max(1, next.pointsNeeded - prevNeeded)} />
            <p style={{ fontSize: 12.5, marginTop: 8, color: 'var(--color-primary-300)' }}>
              {(next.pointsNeeded - season.score).toLocaleString()} to {next.name}{next.rewardName ? ` · ${next.rewardName}` : ''}
            </p>
          </>
        ) : tiers.length > 0 ? (
          <p style={{ fontSize: 12.5, marginTop: 10, color: 'var(--color-primary-300)' }}>Every tier reached this month.</p>
        ) : null}
      </Panel>

      {tiers.length > 0 && (
        <section>
          <SectionHead title="Tiers" />
          {tiers.map((t, i) => {
            const reached = season.score >= t.pointsNeeded;
            const claimed = claims.has(t.id);
            return (
              <LineRow key={t.id} title={t.name} last={i === tiers.length - 1}
                meta={`${t.pointsNeeded.toLocaleString()} points${t.rewardName ? ` · ${t.rewardName}` : ''}`}
                dim={!reached}
                action={claimed
                  ? <StatusPill label={claims.get(t.id) ? 'Collected' : 'At the desk'} tone="structure" />
                  : reached && t.rewardName
                    ? <NocButton variant="action" className="flex-none" disabled={busy} onClick={() => void claim(t)}>Claim</NocButton>
                    : reached ? <StatusPill label="Reached" tone="structure" /> : undefined} />
            );
          })}
        </section>
      )}

      <GymGoalStrip />

      {moduleOn(gymApp, 'squads') && (
      <Panel onClick={() => navigate('/member/squad')} ariaLabel="Your team">
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Your team</p>
        <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-secondary)' }}>
          Train with friends: hit your weekly target together and everyone gets the points.
        </p>
      </Panel>
      )}

      <Panel onClick={() => navigate('/member/challenges')} ariaLabel="This week's quests">
        <p className="flex items-center" style={{ gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          <Trophy size={17} aria-hidden style={{ color: 'var(--color-secondary)' }} /> This week's quests
        </p>
        <p style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-text-secondary)' }}>
          New ones every Monday. Everything you finish counts toward the season.
        </p>
      </Panel>

      <section>
        <SectionHead title="The board" meta="Opted-in members" />
        {board.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nobody has joined the board yet this month.</p>
        ) : board.map((b, i) => (
          <LineRow key={i} gutter={`#${i + 1}`} gutterWidth={36} title={`${b.firstName} ${b.lastInitial}.${b.isMe ? ' (you)' : ''}`}
            meta={`${b.score.toLocaleString()} points`} last={i === board.length - 1} />
        ))}
        {onBoards !== null && (
          <label className="flex items-center" style={{ gap: 10, marginTop: 12, fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={onBoards} disabled={busy} onChange={() => void toggleBoards()} aria-label="Show me on the boards" />
            Show me on the board and the record wall (first name and initial only)
          </label>
        )}
      </section>

      <section>
        <SectionHead title="Records this week" />
        {wall.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No records on the wall yet this week.</p>
        ) : wall.map((w, i) => (
          <LineRow key={i} title={`${w.firstName} ${w.lastInitial}. · ${w.exerciseName}`}
            meta={new Date(w.achievedAt).toLocaleDateString('en-US', { weekday: 'short' })}
            action={<span className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary-300)' }}>{recordValue(w.kind, w.value)}</span>}
            last={i === wall.length - 1} />
        ))}
      </section>

      <section>
        <SectionHead title="Your records" />
        {records === null ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Your records could not be loaded just now.</p>
        ) : records.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            None yet. Beat your best on any exercise in the tracker and it lands here — your first time on an exercise sets the bar.
          </p>
        ) : records.map((r, i) => (
          <LineRow key={r.id} title={r.exerciseName}
            meta={`up from ${recordValue(r.kind, r.previous)} · ${new Date(r.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            action={<span className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary-300)' }}>{recordValue(r.kind, r.value)}</span>}
            last={i === records.length - 1} />
        ))}
      </section>
    </Page>
  );
}
